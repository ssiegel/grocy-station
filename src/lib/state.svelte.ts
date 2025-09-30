// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { GrocyClient, GrocyObjectCache } from "$lib/grocy";
import type {
  GrocyData,
  GrocyProductGroup,
  GrocyShoppingList,
  GrocyShoppingListItem,
  GrocyStockEntry,
} from "$lib/types/grocy";
import { PackagingUnitsBuilder } from "./packaging";

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
    const dbChangePromise = GrocyClient.getLastChangedTimestamp();

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
    const fetchShoppingListItemsPromise = fetchShoppingListItemsFor(
      grocyBarcode.product_id,
    );
    this.progress = 25;

    const grocyProductDetails = await GrocyClient.getProductDetails(
      grocyBarcode.product_id,
    );
    const buildPackagingUnitsPromise = new PackagingUnitsBuilder(
      grocyBarcode,
      grocyProductDetails,
    ).build();
    const fetchGroupPromise = GrocyObjectCache.getObject(
      "product_groups",
      grocyProductDetails.product?.product_group_id,
    );
    const fetchStockPromise = fetchStockFor(
      grocyProductDetails.product.id!,
    ); // TODO: can be fetched earlier?
    this.progress = 75;

    const grocyData = {
      barcode: grocyBarcode,
      packaging_units: await buildPackagingUnitsPromise,
      product_details: grocyProductDetails,
      product_group: await fetchGroupPromise as GrocyProductGroup,
      stock: await fetchStockPromise,
      shopping_list_items: await fetchShoppingListItemsPromise,
      timestamp: await dbChangePromise,
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

const GROCY_POLL_INTERVAL_MS = 15_000;

export class ProductState extends State {
  /** *Statefull* */
  grocyData: GrocyData;

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

  constructor(
    grocyData: GrocyData,
    progress: number,
    state_timeout: ReturnType<typeof setTimeout> | undefined,
  ) {
    super(progress, state_timeout);
    this.grocyData = $state(grocyData);
    this.inputQuantity = $state("1");
    // grocyData.packaging_units shouldn't be null
    // contains at least the "Quick C" pu.
    // inputUnitSize is set to amount of base pu at
    // index zero in GrocyProduct.qu_id_stock units .
    this.inputUnitSize = $state(String(grocyData.packaging_units![0].amount));
    this.consumeAmount = $derived(this.unitSize() * this.quantity());
    this.addShoppingListValid = $derived(
      this.grocyData.shopping_list_items!.filter((list) => !list.done)
        .length === 0,
    );
    setInterval(() => this.fetchDbChanged(), GROCY_POLL_INTERVAL_MS);
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
      this.grocyData?.stock === undefined
    ) {
      this.consumeValid = false;
      return;
    }

    if (this.selectedStockEntryIndex >= this.grocyData.stock?.length) {
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

  async fetchDbChanged() {
    const timestamp = await GrocyClient.getLastChangedTimestamp();
    if (
      timestamp === undefined ||
      timestamp === this.grocyData.timestamp ||
      this.progress !== 0
    ) {
      return;
    }

    const promises: Array<Promise<void>> = [];
    this.grocyData.timestamp = timestamp;
    this.progress = 25;
    promises.push(this.fetchStock());
    this.progress = 50;
    promises.push(
      fetchShoppingListItemsFor(this.grocyData.product_details.product.id!)
        .then(
          (items) => {
            this.grocyData.shopping_list_items = items;
          },
        ),
    );
    this.progress = 75;
    Promise.all(promises);
    this.progress = 100;
  }

  async fetchStock() {
    const product_details = this.grocyData.product_details!;
    const product_id = product_details.product.id!;

    const getStockPromise = fetchStockFor(product_id);

    await GrocyClient.getProductDetails(product_id)
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
      this.grocyData?.stock === undefined ||
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

    triggerShoppingListUpdate();

    await this.fetchStock();
    this.progress = 100;
  }

  async doShoppingList() {
    this.progress = 1;
    //await triggerShoppingListUpdate() // makes amount unpredictable if adding same product.
    this.grocyData.shopping_list_items = await fetchShoppingListItemsFor(
      this.grocyData.product_details.product.id!,
    );
    this.progress = 50;

    if (this.addShoppingListValid) {
      const removePromises = [];
      for (
        const doneShoppingListItem of this.grocyData.shopping_list_items!
      ) {
        removePromises.push(
          GrocyClient.postRemoveProductShopping(
            doneShoppingListItem.product_id,
            doneShoppingListItem.amount,
            doneShoppingListItem.shopping_list_id,
          ),
        );
      }
      Promise.all(removePromises);
      this.progress = 75;
      GrocyClient.postAddToShoppingList(
        this.grocyData.product_details!.product.id!,
      );
    }
    fetchShoppingListItemsFor(this.grocyData.product_details?.product.id!).then(
      (
        items,
      ) => this.grocyData.shopping_list_items = items,
    );
    this.progress = 100;
  }
}

async function fetchStockFor(productId: number): Promise<GrocyStockEntry[]> {
  const fetchedStock = await GrocyClient.getStockEntries(productId);
  for (const entry of fetchedStock) {
    entry.amount_allotted = 0;
  }
  return fetchedStock;
}

async function fetchShoppingListItemsFor(
  productId: number,
): Promise<Array<GrocyShoppingListItem>> {
  let shoppingListItems = await GrocyClient.getShoppingListItems(productId);
  if (!shoppingListItems) {
    const shoppingLists = await GrocyObjectCache.getObject(
      "shopping_lists",
    ) as Array<GrocyShoppingList>;
    shoppingListItems = await (Promise.all(
      shoppingLists.filter((shoppingList) => shoppingList.id !== 1).map((
        shoppingList,
      ) => GrocyClient.getShoppingListItems(productId, shoppingList.id)),
    )).then((lists) => lists.flat());
  }
  return shoppingListItems;
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

  toErrorState(message: string, ms?: number) {
    this.state = new ErrorState(
      message,
      this.state.progress,
      this.state.timeout,
    );
    this.state.timeout = setTimeout(() => this.toWaitingState(), ms);
  }

  toWaitingState() {
    this.state = new WaitingState(this.state.progress, this.state.timeout);
  }

  async doBarcode(
    barcode: string,
  ) {
    if (
      (this.state instanceof ProductState) &&
      (this.state.grocyData.barcode?.barcode === barcode) &&
      Number.isFinite(this.state.quantity())
    ) {
      return this.state.increaseQuantity();
    }

    this.state = new ProductState(
      await this.state.fetchGrocyData(barcode),
      this.state.progress,
      this.state.timeout,
    );
  }
}
