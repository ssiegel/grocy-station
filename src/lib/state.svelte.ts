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
import type { GrocyData, GrocyProductGroup } from "$lib/types/grocy";
import { PackagingUnitsBuilder } from "$lib/packaging";

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
  /** *Derived* */
  public readonly addShoppingListValid: boolean;
  /** *Statefull* */
  selectedStockEntryIndex: number = $state(0);
  /** *Statefull* */
  selectedStockLogEntryIndex = $state(undefined as number | undefined);

  private refreshing?: Promise<void>;
  private refreshQueued = false;

  constructor(
    grocyData: GrocyData,
    progress: number,
    state_timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    super(progress, state_timeout);
    this.grocyData = $state(grocyData);
    // product_details.product.id is fetched based on barcode.product_id
    this.productId = $derived(grocyData.barcode.product_id);
    this.inputQuantity = $state("1");
    // grocyData.packaging_units shouldn't be null
    // contains at least the "Quick C" pu.
    // inputUnitSize is set to amount of base pu at
    // index zero in GrocyProduct.qu_id_stock units .
    this.inputUnitSize = $state(String(grocyData.packaging_units![0].amount));
    this.consumeAmount = $derived(this.unitSize() * this.quantity());
    this.addShoppingListValid = $derived(
      this.grocyData.shopping_list_items.filter((list) => !list.done)
        .length === 0,
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
    this.inputUnitSize = String(this.grocyData.packaging_units![0].amount);
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

  async onDbChanged() {
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
          // Don't drag the bar backwards over an action's own progress.
          this.progress = Math.max(this.progress, 25);
          try {
            await Promise.all([
              this.updateStock(),
              this.updateStockLogs(),
              this.updateShoppingListItems(),
            ]);
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
    if (this instanceof ProductState) {
      this.reAllot();
    }
  }

  async doConsume(open: boolean) {
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

  async doShoppingList() {
    if (this.progress !== 0) return;
    this.progress = 1;
    // Not triggerShoppingListUpdate(): it makes the amount unpredictable
    // when adding the same product again.
    await this.updateShoppingListItems();
    this.progress = 50;

    if (this.addShoppingListValid) {
      await Promise.all(
        this.grocyData.shopping_list_items.map((doneShoppingListItem) =>
          GrocyClient.postRemoveProductShopping(
            doneShoppingListItem.product_id,
            doneShoppingListItem.amount,
            doneShoppingListItem.shopping_list_id,
          )
        ),
      );
      this.progress = 75;
      await GrocyClient.postAddToShoppingList(this.productId);
    }
    this.resetQuantity();
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
    this.state = new ProductState(
      await this.state.fetchGrocyData(barcode),
      this.state.progress,
      this.state.timeout,
    );
  }
}
