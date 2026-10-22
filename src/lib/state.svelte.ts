// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  fetchProductShoppingListItems,
  fetchProductStock,
  fetchProductStockLogs,
  GrocyClient,
  GrocyObjectCache,
} from "$lib/grocy";
import type {
  GrocyData,
  GrocyProductGroup,
  GrocyShoppingList,
  GrocyShoppingListItemEntry,
} from "$lib/types/grocy";
import { PackagingUnitsBuilder } from "$lib/packaging";

/**
 * Grocy's default shopping list. Its API substitutes this id wherever a
 * list is omitted, and the list cannot be deleted.
 */
export const DEFAULT_SHOPPING_LIST_ID = 1;

/**
 * The amount to preselect, in GrocyProduct.qu_id_stock units.
 *
 * The units are ordered by amount, so the base unit is not generally the
 * first one; it is the one `baseIndex` points at. The list always holds at
 * least the "Quick C" unit, so the lookup cannot come up empty.
 */
function basePackagingUnitAmount(grocyData: GrocyData): number {
  const { units, baseIndex } = grocyData.packaging_units;
  return units[baseIndex].amount;
}

export abstract class State {
  /**
   * Has effect:
   * $effect(() => {
   *    if (pageState.progress === 100) {
   *        setTimeout(() => pageState.progress = 0, 300);
   *    };
   * })
   *
   * *Statefull* */
  progress: number;
  timeout?: ReturnType<typeof setTimeout>;
  constructor(
    progress: number,
    timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    this.progress = $state(progress);
    clearTimeout(timeout);
  }

  async fetchGrocyData(
    barcode: string,
  ): Promise<GrocyData> {
    // We fetch 'grcy:p:'-Barcodes from product_barcodes_view because only this view provides them.
    // Other barcodes we fetch directly from product_barcodes because we want the userfields and
    // they are returned only from there.
    // (The 'grcy:p:'-Barcodes never have userfields, so no problem there.)
    const [grocyBarcode, ...grocyExtraBarcodes] = await GrocyClient.getBarcode(
      barcode,
    );
    if (grocyBarcode === undefined) {
      throw `No product with barcode ${barcode} found`;
    }
    if (grocyExtraBarcodes.length) {
      throw `Multiple products with barcode ${barcode} found`;
    }
    const productId = grocyBarcode.product_id;
    const fetchProductDetailsPromise = GrocyClient.getProductDetails(
      productId,
    );
    const fetchStockPromise = fetchProductStock(
      productId,
    );
    const fetchStockLogPromise = fetchProductStockLogs(productId);
    const fetchShoppingListItemsPromise = fetchProductShoppingListItems(
      productId,
    );
    // These run concurrently, so a failure in one rejects before the others
    // are awaited; without this they would surface as unhandled rejections.
    const pending = Promise.all([
      fetchProductDetailsPromise,
      fetchStockPromise,
      fetchStockLogPromise,
      fetchShoppingListItemsPromise,
    ]);
    pending.catch(() => {});
    this.progress = 25;

    const grocyProductDetails = await fetchProductDetailsPromise;
    const buildPackagingUnitsPromise = new PackagingUnitsBuilder(
      grocyBarcode,
      grocyProductDetails,
    ).build();
    const fetchGroupPromise = GrocyObjectCache.getObject(
      "product_groups",
      grocyProductDetails.product.product_group_id,
    );
    this.progress = 75;

    const grocyData = {
      barcode: grocyBarcode,
      packaging_units: await buildPackagingUnitsPromise,
      product_details: grocyProductDetails,
      product_group: await fetchGroupPromise as GrocyProductGroup,
      stock: await fetchStockPromise,
      stock_log: await fetchStockLogPromise,
      shopping_list_items: await fetchShoppingListItemsPromise,
    };
    this.progress = 100;
    return grocyData;
  }
}

export abstract class MessageState extends State {
  readonly message: string;
  constructor(
    message: string,
    progress: number,
    state_timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    super(progress, state_timeout);
    this.message = message;
  }
}
class InitState extends MessageState {
  public static readonly MESSAGE = "Initializing…";
  constructor() {
    super(InitState.MESSAGE, 0, undefined);
  }
}

export class ErrorState extends MessageState {
  constructor(
    message: string,
    progress: number,
    state_timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    super(message, progress, state_timeout);
  }
}

export class WaitingState extends MessageState {
  public static readonly MESSAGE = "Please scan a barcode.";
  constructor(
    progress: number,
    state_timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    super(WaitingState.MESSAGE, progress, state_timeout);
  }
}

export class ProductState extends State {
  /** *Statefull* */
  grocyData: GrocyData;
  /** Derived */
  readonly productId: number;

  /** Number of units selected.
   *
   * *Statefull* */
  inputQuantity: string;
  /** Size of product unit in GrocyProduct.qu_id_stock units.
   *
   * *Statefull* */
  inputUnitSize: string;
  /**
   * Has effect
   * $effect(() => {
   *   if (pageState instanceof ProductState) {
   *        void pageState.consumeAmount;
   *        untrack(() => pageState.reAllot());
   *    }
   * });
   *
   * *Derived* */
  public readonly consumeAmount: number;

  /** *Statefull* */
  public consumeValid = $state(false);
  /**
   * One entry per shopping list item for this product, each carrying the
   * list it sits on. A list holding several items for the product appears
   * once per item.
   *
   * *Derived* */
  public readonly shoppingListItemEntries: GrocyShoppingListItemEntry[];
  /**
   * Every shopping list that exists, whether or not the product is on it.
   *
   * *Derived* */
  public readonly shoppingLists: GrocyShoppingList[];
  /** *Statefull* */
  selectedStockEntryIndex: number = $state(0);
  /** *Statefull* */
  selectedStockLogEntryIndex = $state(undefined as number | undefined);

  /** Which sections are expanded. Lives here so that a scan starts every
   * product from the same view rather than inheriting the last one's.
   *
   * *Statefull* */
  stockExpanded = $state(true);
  /** *Statefull* */
  shoppingListExpanded = $state(true);
  /** The journal is the only one collapsed by default: it is a record of
   * what already happened, not something to act on.
   *
   * *Statefull* */
  journalExpanded = $state(false);

  private refreshing?: Promise<void>;
  private refreshQueued = false;
  /**
   * Grocy's db-changed time as of the start of the most recent successful
   * read. Changes at or before it are already reflected in `grocyData`.
   */
  private watermark?: string;

  constructor(
    grocyData: GrocyData,
    changedTime: string | undefined,
    progress: number,
    state_timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    super(progress, state_timeout);
    this.watermark = changedTime;
    this.grocyData = $state(grocyData);
    // product_details.product.id is fetched based on barcode.product_id
    this.productId = $derived(grocyData.barcode.product_id);
    this.inputQuantity = $state("1");
    this.inputUnitSize = $state(String(basePackagingUnitAmount(grocyData)));
    this.consumeAmount = $derived(this.unitSize() * this.quantity());
    this.shoppingListItemEntries = $derived.by(() => {
      // The cache is not reactive, so a miss here is not re-run when it is
      // later filled. The lists are among those warmed at startup, which
      // happens long before a scan can reach this.
      const lists = (GrocyObjectCache.getCachedObject("shopping_lists") ??
        []) as GrocyShoppingList[];
      // A list can hold several items for one product, which Grocy's own UI
      // allows and which can carry per-item notes. Each keeps its own entry
      // so that none of that is flattened away.
      return this.grocyData.shopping_list_items.flatMap((item) => {
        const list = lists.find(
          (candidate) => candidate.id === item.shopping_list_id,
        );
        // An item whose list is missing from the cache cannot be labelled,
        // and is dropped rather than shown against a blank name.
        return list === undefined ? [] : [{ list, item }];
      });
    });
    this.shoppingLists = $derived(
      (GrocyObjectCache.getCachedObject("shopping_lists") ??
        []) as GrocyShoppingList[],
    );
  }

  /** Returns currents state of ProductState.inputQuantity as numeric. */
  public quantity(): number {
    return Number(this.inputQuantity);
  }

  /** Returns currents state of ProductState.inputUnitSize
   * as numeric in GrocyProduct.qu_id_stock units.
   */
  public unitSize(): number {
    return Number(this.inputUnitSize);
  }

  reAllot() {
    if (
      !Number.isFinite(this.consumeAmount) || this.consumeAmount <= 0 ||
      this.grocyData.stock === undefined
    ) {
      this.consumeValid = false;
      return;
    }

    if (this.selectedStockEntryIndex >= this.grocyData.stock.length) {
      this.selectedStockEntryIndex = 0;
    }

    let remaining = this.consumeAmount;
    for (const [idx, entry] of this.grocyData.stock.entries()) {
      if (idx < this.selectedStockEntryIndex) {
        entry.amount_allotted = 0;
      } else {
        entry.amount_allotted = Math.min(entry.amount, remaining);
        remaining -= entry.amount_allotted;
      }
    }

    this.consumeValid = remaining === 0;
  }

  resetQuantity() {
    this.inputQuantity = "1";
    this.inputUnitSize = String(basePackagingUnitAmount(this.grocyData));
    this.selectedStockEntryIndex = 0;
    this.reAllot();
  }

  increaseQuantity() {
    if (Number.isFinite(this.quantity())) {
      this.inputQuantity = String(Math.max(0, this.quantity()) + 1);
    }
  }

  decreaseQuantity() {
    if (Number.isFinite(this.quantity())) {
      this.inputQuantity = String(Math.max(0, Number(this.quantity()) - 1));
    }
  }

  async updateStockLogs() {
    this.grocyData.stock_log = await fetchProductStockLogs(
      this.productId,
    );
  }

  async updateShoppingListItems() {
    this.grocyData.shopping_list_items = await fetchProductShoppingListItems(
      this.productId,
    );
  }

  async onDbChanged(changedTime: string) {
    // Our own writes notify us too; a change at or before the watermark is
    // already reflected in the last read.
    if (this.watermark !== undefined && changedTime <= this.watermark) {
      return;
    }
    await this.refresh();
  }

  /**
   * Re-read everything this view displays, coalescing concurrent requests
   * so the result never predates the latest one.
   */
  refresh(): Promise<void> {
    if (this.refreshing !== undefined) {
      this.refreshQueued = true;
      return this.refreshing;
    }

    this.refreshing = (async () => {
      try {
        do {
          this.refreshQueued = false;
          // 100 means done, so a new pass restarts the bar rather than
          // inheriting it; below that keep an action's own higher value.
          this.progress = this.progress === 100
            ? 25
            : Math.max(this.progress, 25);
          try {
            const previous = this.watermark;
            // Adopted before the reads, so our own echo of them cannot
            // queue a redundant second pass.
            this.watermark = await GrocyClient.getDbChangedTime();
            try {
              await Promise.all([
                this.updateStock(),
                this.updateStockLogs(),
                this.updateShoppingListItems(),
              ]);
            } catch (e) {
              // A watermark must never claim data we failed to read.
              this.watermark = previous;
              throw e;
            }
          } catch (e) {
            console.warn("refresh failed:", e);
          }
        } while (this.refreshQueued);
        this.progress = 100;
      } finally {
        this.refreshing = undefined;
      }
    })();

    return this.refreshing;
  }

  async updateStock() {
    const getStockPromise = fetchProductStock(this.productId);

    const product_details = this.grocyData.product_details!;
    await GrocyClient.getProductDetails(this.productId)
      .then((fetchedProductDetails) => {
        product_details.stock_amount = fetchedProductDetails.stock_amount;
        product_details.stock_amount_opened =
          fetchedProductDetails.stock_amount_opened;
      });

    const fetchedStock = await getStockPromise;
    for (const entry of fetchedStock) {
      entry.amount_allotted = 0;
    }
    this.grocyData.stock = fetchedStock;

    // Trigger recalculation of allotted amounts
    this.reAllot();
  }

  /**
   * Book the composed amount out of stock, oldest allotted entry first.
   *
   * `open` marks the entries as opened instead of removing them; `spoiled`
   * records the removal as waste rather than use. The two are mutually
   * exclusive, since opening something does not spoil it.
   */
  async doConsume(open: boolean, spoiled = false) {
    if (
      this.grocyData.stock === undefined ||
      !this.consumeValid || this.progress !== 0
    ) return;

    if (
      open && this.grocyData.stock.some((entry) =>
        entry.open === 1 &&
        entry.amount_allotted !== 0
      )
    ) {
      this.selectedStockEntryIndex = Math.max(
        0,
        this.grocyData.stock.findIndex((entry) => !entry.open),
      );
      this.reAllot();
      return;
    }

    this.progress = 1;

    const to_consume = this.grocyData.stock.filter((entry) =>
      entry.amount_allotted !== 0 &&
      entry.product_id !== undefined
    );

    const total = to_consume.length + 1; // +1 for the final fetchStock()
    let count = 0;
    await Promise.all(
      to_consume.map((entry) =>
        GrocyClient.postConsume(
          entry.product_id!,
          entry.stock_id!,
          entry.amount_allotted,
          open,
          spoiled,
        ).then(() => {
          this.progress = Math.max(
            1,
            Math.round(++count / total * 100),
          );
        })
      ),
    );

    await triggerShoppingListUpdate();

    this.resetQuantity();
    await this.refresh();
  }

  /**
   * Put the composed amount on a shopping list.
   *
   * Each call adds an item of its own. Two trips to the same list stay two
   * items, since they are two separate intentions to buy, which a single
   * summed item could no longer be unpicked into.
   */
  async addToShoppingList(listId: number) {
    if (
      !Number.isFinite(this.consumeAmount) || this.consumeAmount <= 0 ||
      this.progress !== 0
    ) return;

    this.progress = 1;
    await GrocyClient.postAddToShoppingList(
      this.productId,
      this.consumeAmount,
      listId,
    );
    this.resetQuantity();
    await this.refresh();
  }

  /**
   * Delete one shopping list item.
   *
   * Removal is not the inverse of adding: it clears the item rather than
   * deducting the composed amount. Whoever took it off the list is saying
   * they no longer want it, which is not a statement about a quantity.
   */
  async removeShoppingListItem(itemId: number) {
    if (this.progress !== 0) return;

    this.progress = 1;
    await GrocyClient.deleteShoppingListItem(itemId);
    await this.refresh();
  }

  async doUndo() {
    if (this.selectedStockLogEntryIndex === undefined || this.progress !== 0) {
      return;
    }
    this.progress = 1;
    const booking_id = this.grocyData.stock_log.splice(
      this.selectedStockLogEntryIndex,
      1,
    )[0].id!;
    // Indices shift after the splice, so the old selection no longer
    // refers to the entry the user picked.
    this.selectedStockLogEntryIndex = undefined;
    await GrocyClient.postRemoveBooking(booking_id);
    this.resetQuantity();
    await this.refresh();
  }
}

/** Triggers adding missing products to shopping list *id*.
 * If *id* is undefined loops through all shopping lists
 */
async function triggerShoppingListUpdate(id?: number) {
  await GrocyClient.postAddMissingProducts(id);
}

export class Page {
  /** *Statefull* */
  state: State = $state(new InitState());

  toErrorState(message: string, ms = 10_000) {
    // Carrying the progress over would leave the bar stuck at whatever
    // fraction the failed operation had reached.
    this.state = new ErrorState(
      message,
      0,
      this.state.timeout,
    );
    // An undefined delay makes setTimeout fire immediately, which would
    // clear the message before it could be read.
    this.state.timeout = setTimeout(() => this.toWaitingState(), ms);
  }

  toWaitingState() {
    this.state = new WaitingState(this.state.progress, this.state.timeout);
  }

  async doBarcode(
    barcode: string,
  ) {
    // Must precede the data, so it cannot cover changes the scan missed.
    const changedTime = await GrocyClient.getDbChangedTime();
    this.state = new ProductState(
      await this.state.fetchGrocyData(barcode),
      changedTime,
      this.state.progress,
      this.state.timeout,
    );
  }
}
