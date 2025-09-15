// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { GrocyClient, GrocyObjectCache, type GrocyData, type GrocyPackagingUnit, type GrocyProductGroup, type GrocyShoppingList, type GrocyShoppingListItem } from "$lib/grocy";
import { formatNumber } from "./format";

export abstract class State {
  /** *Statefull* */
  public progress: number = $state(0)
}

export class InitState extends State {
  public readonly message = "Initializing…";
}

abstract class NotInitState extends State {
  constructor() {
    super();
    clearTimeout(pageState.timeout)
  }
}

abstract class TimedState extends NotInitState {
  constructor(ms: number | undefined ) {
    super();
    pageState.timeout = setTimeout(() => {

      pageState.current = new WaitingState();
    }, ms);
  }
}

export class ErrorState extends TimedState {
  public readonly message: string;

  constructor(message: string, ms?: number) {
    super(ms);
    this.message = message;
  }
}

export class WaitingState extends NotInitState {
  public readonly message = "Please scan a barcode.";

  constructor() {
    super();
  }
}

const GROCY_POLL_INTERVAL_MS = 15_000;
export class ProductState extends NotInitState {
  /** *Statefull* */
  public grocyData: GrocyData;

  /** Number of units selected.
   * 
   * *Statefull* */
  inputQuantity: string;
  /** Size of product unit in GrocyProduct.qu_id_stock units.
   * 
   * *Statefull* */
  inputUnitSize: string;
  public readonly consumeAmount: number;

  /** *Statefull* */
  public consumeValid = $state(false);
  /** *Statefull* */
  public addShoppingListValid: boolean;
  public selectedStockEntryIndex: number = $state(0)

  constructor(grocyData: GrocyData) {
    super();

    this.grocyData = $state(grocyData);
    this.inputQuantity = $state('1');
    // grocyData.packaging_units shouldn't be null 
    // contains at least the "Quick C" pu.
    // inputUnitSize is set to amount of base pu at 
    // index zero in GrocyProduct.qu_id_stock units .
    this.inputUnitSize = $state(String(grocyData.packaging_units![0].amount));
    this.consumeAmount = $derived(this.unitSize() * this.quantity());
    this.addShoppingListValid = $derived(this.grocyData.shopping_list_items!.filter((list) => !Boolean(list.done)).length == 0)
    setInterval(fetchDbChanged, GROCY_POLL_INTERVAL_MS)
  }

  /** Returns currents state of ProductState.inputQuantity as numeric. */
  public quantity(): number {
    return Number(this.inputQuantity)
  }

  /** Returns currents state of ProductState.inputUnitSize 
   * as numeric in GrocyProduct.qu_id_stock units.
  */
  public unitSize(): number {
    return Number(this.inputUnitSize)
  }

  reAllot() {
    if (
      !Number.isFinite(this.consumeAmount) || this.consumeAmount <= 0 ||
      this.grocyData?.stock === undefined
    ) {
      this.consumeValid = false;
      return;
    }

    if (this.selectedStockEntryIndex >= this.grocyData.stock?.length){
      this.selectedStockEntryIndex = 0
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
}

function AbortTimeoutController() {
  const API_TIMEOUT_MS = 10_000;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  return ctrl;
}

async function fetchStock(product: GrocyData, signal: AbortSignal) {
  let product_details = product.product_details;
  const product_id = product_details?.product.id;
  if (product_details === undefined || product_id === undefined) {
    product.stock = undefined;
    return;
  }
  //signal ??= AbortTimeoutController().signal;

  const getStockPromise = GrocyClient.getStockEntries(product_id, signal);

  const fetchedProductDetails = await GrocyClient.getProductDetails(
    product_id,
    signal,
  );
  product_details.stock_amount = fetchedProductDetails.stock_amount;
  product_details.stock_amount_opened =
    fetchedProductDetails.stock_amount_opened;

  const fetchedStock = await getStockPromise;
  for (const entry of fetchedStock) {
    entry.amount_allotted = 0;
  }
  product.stock = fetchedStock;

  // Force trigger recalculation of allotted amounts via $effect
  if (pageState.current instanceof ProductState) {
    let currentInputQuantity = pageState.current.inputQuantity;
    pageState.current.inputQuantity = String(pageState.current.quantity() + 1); // When set to zero, consume and open butens get disabled
    await Promise.resolve();
    pageState.current.inputQuantity = currentInputQuantity;
  }
}


async function fetchShoppingListItems(product: GrocyData, signal: AbortSignal) {
  const product_id = product.barcode!.product_id;
  let shoppingListItems = await GrocyClient.getShoppingListItems(product_id, signal);
  if (!shoppingListItems) {
    const shoppingLists = await GrocyObjectCache.getObject("shopping_lists", signal) as Array<GrocyShoppingList>
    shoppingListItems = await (Promise.all(shoppingLists.filter((shoppingList) => shoppingList.id != 1).map((shoppingList) =>  GrocyClient.getShoppingListItems(product_id, signal, shoppingList.id)))).then((lists) => lists.flat())
  }
  product.shopping_list_items = shoppingListItems;
}

export async function fetchDbChanged() {
  const actrl = AbortTimeoutController();
  const timestamp = await GrocyClient.getLastChangedTimestamp(
    actrl.signal,
  );
  if (
    timestamp === undefined || !(pageState.current instanceof ProductState) ||
    timestamp === pageState.current.grocyData.timestamp ||
    pageState.current.progress !== 0
  ) {
    return;
  }

  let promises: Array<Promise<void>> = [];
  pageState.current.grocyData.timestamp = timestamp;
  pageState.current.progress = 1;
  promises.push(fetchStock(pageState.current.grocyData, actrl.signal));
  pageState.current.progress = 50; 
  promises.push(fetchShoppingListItems(pageState.current.grocyData, actrl.signal));
  Promise.all(promises);
  pageState.current.progress = 100;
  setTimeout(() => pageState.current.progress = 0, 300);
}

export async function fetchGrocyData(
  barcode: string,
): Promise<GrocyData> {
  const actrl = AbortTimeoutController();
  const dbChangePromise = GrocyClient.getLastChangedTimestamp(actrl.signal);

  let grocyData: GrocyData = {};
  // We fetch 'grcy:p:'-Barcodes from product_barcodes_view because only this view provides them.
  // Other barcodes we fetch directly from product_barcodes because we want the userfields and
  // they are returned only from there.
  // (The 'grcy:p:'-Barcodes never have userfields, so no problem there.)
  const [grocyBarcode, ...grocyExtraBarcodes] = await GrocyClient
    .getBarcode(barcode, actrl.signal);
  if (grocyBarcode === undefined) {
    throw `No product with barcode ${barcode} found`;
  }
  if (grocyExtraBarcodes.length) {
    throw `Multiple products with barcode ${barcode} found`;
  }
  grocyData.barcode = grocyBarcode;
  const fetchedShoppingListItemsPromise = fetchShoppingListItems(grocyData, actrl.signal);
  pageState.current.progress = 25;

  const grocyProductDetails = await GrocyClient.getProductDetails(
    grocyBarcode.product_id,
    actrl.signal,
  );
  grocyData.product_details = grocyProductDetails;
  const fetchStockPromise = fetchStock(grocyData, actrl.signal);
  pageState.current.progress = 50;

  /** Maps *qu_id* to *conversion factor*
   * between *qu_id quantity units* and *stock quantity units* */
  let quStockquConversionFactorMap = new Map<number, number>([
    [
      grocyProductDetails.product!.qu_id_purchase!,
      grocyProductDetails.qu_conversion_factor_purchase_to_stock!,
    ],
    [
      grocyProductDetails.product!.qu_id_price!,
      grocyProductDetails.qu_conversion_factor_price_to_stock!,
    ],
    [grocyProductDetails.product!.qu_id_stock!, 1.0],
  ]);
  if (
    [grocyProductDetails.product!.qu_id_consume!, grocyBarcode.qu_id].some((x) =>
      x != null && !quStockquConversionFactorMap.has(x)
    )
  ) {
    for (
      const c of await GrocyClient.getQUConversions(
        grocyProductDetails.product!.id!,
        grocyProductDetails.product!.qu_id_stock,
        actrl.signal,
      )
    ) {
      quStockquConversionFactorMap.set(c.from_qu_id, c.factor);
    }
  }
  const pus = new Map<number, GrocyPackagingUnit>();
  let basePuSizeStockUnits: number;
  // build pu units from barcode
  if (grocyBarcode.amount != null && grocyBarcode.qu_id != null) {
    const barcodeAmountStockUnits = grocyBarcode.amount * quStockquConversionFactorMap.get(grocyBarcode.qu_id)!;

    // get pu from barcode qu
    pus.set(barcodeAmountStockUnits, {
        name: "Barcode PU",
        amount_display: formatNumber(
          grocyBarcode.amount,
          grocyBarcode.qu_id,
        ),
        amount: barcodeAmountStockUnits,
    });

    // get pu from userfields
    for (
      const line of (grocyBarcode.userfields?.packaging_units ?? "").split(
        /\r?\n/,
      )
    ) {
      const match = line.match(/^(\d+)(?:\/(\d+))?\s+(.*)$/);
      if (!match) {
        continue;
      }
      const factor = Number(match[1]) / Number(match[2] ?? 1);
      pus.set(barcodeAmountStockUnits * factor, {
        name: match[3],
        amount_display: formatNumber(
          grocyBarcode.amount * factor,
          grocyBarcode.qu_id,
        ),
        amount: barcodeAmountStockUnits * factor,
      });
    }
    basePuSizeStockUnits = barcodeAmountStockUnits;
  // build pu units from grocyProductDetails
  } else {
    for (
      const pu of [
        {
          name: "Quick C",
          amount: grocyProductDetails.product.quick_consume_amount,
        },
        { name: "Quick O", amount: grocyProductDetails.product.quick_open_amount },
      ]
    ) {
      if (!pus.has(pu.amount)) {
        pus.set(pu.amount, {
          name: pu.name,
          amount_display: formatNumber(
            pu.amount / quStockquConversionFactorMap.get(grocyProductDetails.product.qu_id_consume)!,
            grocyProductDetails.product.qu_id_consume,
          ),
          amount: pu.amount,
        });
      }
    }
    basePuSizeStockUnits = grocyProductDetails.product!.quick_consume_amount;
  }

  grocyData.packaging_units = Array.from(pus.entries()).sort(([a], [b]) =>
    (a === basePuSizeStockUnits ? 0 : a) - (b === basePuSizeStockUnits ? 0 : b)
  ).map(([, pu]) => pu);

  const fetchedGroup = await GrocyObjectCache.getObject(
    "product_groups",
    actrl.signal,
    grocyProductDetails.product?.product_group_id,
  ) as GrocyProductGroup;
  grocyData.product_group = fetchedGroup;
  pageState.current.progress = 75;

  await dbChangePromise;
  await fetchStockPromise;
  await fetchedShoppingListItemsPromise;
  pageState.current.progress = 100;
  setTimeout(() => pageState.current.progress = 0, 300);

  return grocyData;
}

/** Triggers adding missing products to shopping list *id*.
 * If *id* is undefined loops through all shopping lists
 */
async function triggerShoppingListUpdate(id?: number) {
  const actrl = AbortTimeoutController();
  GrocyClient.postAddMissingProducts(actrl.signal, id);
}

export async function doConsume(open: boolean) {
  if (
    !(pageState.current instanceof ProductState) ||
    pageState.current.grocyData?.stock === undefined ||
    !pageState.current.consumeValid || pageState.current.progress !== 0
  ) return;

  if (
    open && pageState.current.grocyData.stock.some((entry) =>
      entry.open === 1 &&
      entry.amount_allotted !== 0
    )
  ) {
    pageState.current.selectedStockEntryIndex = Math.max(0, pageState.current.grocyData.stock.findIndex((entry) => !entry.open));
    pageState.current.reAllot();
    return;
  }

  pageState.current.progress = 1;

  const to_consume = pageState.current.grocyData.stock.filter((entry) =>
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
        AbortTimeoutController().signal,
      ).then(() => {
        pageState.current.progress = Math.max(
          1,
          Math.round(++count / total * 100),
        );
      })
    ),
  );


  triggerShoppingListUpdate()

  await fetchStock(pageState.current.grocyData, AbortTimeoutController().signal);
  pageState.current.progress = 100;

  setTimeout(() => pageState.current.progress = 0, 300);
}

export async function doShoppingList(productState: ProductState) {
  pageState.current.progress = 1
  //await triggerShoppingListUpdate() // makes amount unpredictable if adding same product.
  pageState.current.progress = 50
  await fetchShoppingListItems(productState.grocyData, AbortTimeoutController().signal)

  if (productState.addShoppingListValid) {
    let removePromises = []
    for (const doneShoppingListItem of productState.grocyData.shopping_list_items!) {
      removePromises.push(GrocyClient.postRemoveProductShopping(doneShoppingListItem.product_id, doneShoppingListItem.amount, AbortTimeoutController().signal))
    }
    Promise.all(removePromises)
    pageState.current.progress = 75
    GrocyClient.postAddProductShopping(productState.grocyData.product_details!.product.id!, AbortTimeoutController().signal)
  }
  fetchShoppingListItems(productState.grocyData, AbortTimeoutController().signal)
  pageState.current.progress = 100;

  setTimeout(() => pageState.current.progress = 0, 300);
}


/** *Statefull* */
export let pageState = $state({current: new InitState() as State, timeout: undefined as ReturnType<typeof setTimeout> | undefined})

