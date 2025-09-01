// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { formatNumber } from "$lib/format";
import type { components, paths } from "$lib/types/grocy.d.ts";
import { pageInfo, ProductState } from "$lib/state.svelte";
import createClient from "openapi-fetch";

// type GrocyObject = paths['/objects/{entity}/{objectId}']['get']['responses'][200]['content']['application/json'];
// type GrocyObject = Record<string, unknown>;
type GrocyObject = Record<string, any>;
type GrocyProduct = components["schemas"]["Product"] & {
  qu_id_stock: number;
  qu_id_purchase: number;
  qu_id_consume: number;
  qu_id_price: number;
  quick_open_amount: number;
  quick_consume_amount: number;
  due_type: 1 | 2;
};
export type GrocyProductDetails =
  & components["schemas"]["ProductDetailsResponse"]
  & {
    product: GrocyProduct;
    product_barcodes: GrocyBarcode[];
    quantity_unit_stock: GrocyUnit;
    default_quantity_unit_purchase: GrocyUnit;
    default_quantity_unit_consume: GrocyUnit;
    quantity_unit_price: GrocyUnit;
  };
export type GrocyStockEntry = components["schemas"]["StockEntry"] & {
  /** In S.I. units. */
  amount: number;
  amount_allotted: number;
};
type GrocyUnit = components["schemas"]["QuantityUnit"];
export type GrocyQUConversion = {
  id: number;
  from_qu_id: number;
  to_qu_id: number;
  factor: number;
  product_id?: number;
};
export type GrocyBarcode = components["schemas"]["ProductBarcode"] & {
  id: number;
  product_id: number;
  barcode: string;
  userfields?: Record<string, string>;
};
export type PackagingUnit = {
  name: string;
  amount_display: string;
  amount_stock: number;
};
export type GrocyData = {
  barcode?: GrocyBarcode;
  packaging_units?: Array<PackagingUnit>;
  product_details?: GrocyProductDetails;
  product_group?: GrocyObject;
  stock?: Array<GrocyStockEntry>;
};

class GrocyClient {
  private static BASE_CLIENT = createClient<paths>({ baseUrl: "/api/grocy/" });

  private static unwrapOFData<D, E>(
    { data, error }: { data?: D; error?: E },
  ): D {
    if (data !== undefined) {
      return data;
    }
    throw (error as any)?.error_message ?? Error("Grocy Communication Error");
  }

  public static async getStockEntries(
    product_id: number,
    signal: AbortSignal,
  ): Promise<Array<GrocyStockEntry>> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/stock/products/{productId}/entries", {
        params: {
          path: { productId: product_id },
        },
        signal: signal,
      }),
    ) as Array<GrocyStockEntry>;
  }

  public static async getProductDetails(
    product_id: number,
    signal: AbortSignal,
  ): Promise<GrocyProductDetails> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/stock/products/{productId}", {
        params: {
          path: { productId: product_id },
        },
        signal: signal,
      }),
    ) as GrocyProductDetails;
  }

  public static async getQUConversions(
    product_id: number,
    qu_id_stock: number,
    signal: AbortSignal,
  ): Promise<Array<GrocyQUConversion>> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: "quantity_unit_conversions_resolved" },
          query: {
            "query[]": [`product_id=${product_id}`, `to_qu_id=${qu_id_stock}`],
          },
        },
        signal: signal,
      }),
    ) as Array<GrocyQUConversion>;
  }

  public static async getBarcode(
    barcode: string,
    signal: AbortSignal,
  ): Promise<Array<GrocyBarcode>> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: {
            entity: barcode.startsWith("grcy:p:")
              ? "product_barcodes_view"
              : "product_barcodes",
          },
          query: { "query[]": [`barcode=${barcode}`] },
        },
        signal: signal,
      }),
    ) as Array<GrocyBarcode>;
  }

  public static async getCacheable(
    entity: CacheableEntities,
    signal: AbortSignal,
  ) {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: entity },
        },
        signal: signal,
      }),
    );
  }

  public static async getLastChangedTimestamp(
    signal: AbortSignal,
  ): Promise<string | undefined> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/system/db-changed-time", {
        signal: signal,
      }),
    ).changed_time;
  }

  public static async postConsume(
    product_id: number,
    stock_id: string,
    amount_allotted: number,
    open: boolean,
    signal: AbortSignal,
  ) {
    return this.BASE_CLIENT.POST(
      `/stock/products/{productId}/${open ? "open" : "consume"}`,
      {
        params: {
          path: { productId: product_id },
        },
        body: {
          amount: amount_allotted,
          stock_entry_id: stock_id,
        },
        signal: signal,
      },
    );
  }
}

function AbortTimeoutController() {
  const API_TIMEOUT_MS = 10_000;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  return ctrl;
}

type CacheableEntities =
  | "locations"
  | "quantity_units"
  | "shopping_locations"
  | "product_groups";
export class GrocyObjectCache {
  private static readonly OBJECT_TTL = 60 * 60 * 1_000; // 1 hour
  private static readonly OBJECT_MIN_INTERVAL = 5 * 60 * 1_000; // 5 minutes
  private static readonly caches = new Map<string, {
    cache: Map<number, GrocyObject>;
    lastFetchTime: number;
    getPromise: Promise<void> | undefined;
  }>();

  private static async fetchObjects(entity: CacheableEntities): Promise<void> {
    const entry = GrocyObjectCache.caches.get(entity)!;
    // only issue a new request if there is none in-flight
    if (!entry.getPromise) {
      entry.getPromise = (async () => {
        try {
          const data = await GrocyClient.getCacheable(
            entity,
            AbortTimeoutController().signal,
          );
          entry.cache.clear();
          for (const obj of data) {
            // @ts-expect-error TS2339: type information for '/objects/{entity}' is incomplete
            entry.cache.set(obj.id, obj);
          }
          entry.lastFetchTime = Date.now();
        } catch (e) {
          console.error(`Failed to GET ${entity}:`, e);
        } finally {
          entry.getPromise = undefined;
        }
      })();
    }
    return entry.getPromise;
  }

  /**
   * Asynchronously get a GrocyObject, fetching from the server if:
   *  - we've never fetched this entity before
   *  - the object isn't in cache and at least OBJECT_MIN_INTERVAL has passed
   */
  public static async getObject(
    entity: CacheableEntities,
    id?: number,
  ): Promise<GrocyObject | undefined> {
    if (!GrocyObjectCache.caches.has(entity)) {
      GrocyObjectCache.caches.set(entity, {
        cache: new Map<number, GrocyObject>(),
        lastFetchTime: 0,
        getPromise: undefined,
      });
      await GrocyObjectCache.fetchObjects(entity);
      setInterval(
        () => GrocyObjectCache.fetchObjects(entity),
        GrocyObjectCache.OBJECT_TTL,
      );
    }

    if (id === undefined) {
      return undefined;
    }

    const entry = GrocyObjectCache.caches.get(entity)!;
    if (
      !entry.cache.has(id) &&
      Date.now() - entry.lastFetchTime > GrocyObjectCache.OBJECT_MIN_INTERVAL
    ) {
      await GrocyObjectCache.fetchObjects(entity);
    }
    return entry.cache.get(id);
  }

  /**
   * Synchronous lookup: returns a cached object if present, or undefined.
   */
  public static getCachedObject(
    entity: CacheableEntities,
    id?: number,
  ): GrocyObject | undefined {
    if (id === undefined) {
      return undefined;
    }
    return GrocyObjectCache.caches.get(entity)?.cache.get(id);
  }
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
  if (pageInfo.state instanceof ProductState) {
    let currentInputQuantity = pageInfo.state.inputQuantity;
    pageInfo.state.inputQuantity = String(pageInfo.state.quantity() + 1); // When set to zero, consume and open butens get disabled
    await Promise.resolve();
    pageInfo.state.inputQuantity = currentInputQuantity;
  }
}

export async function fetchDbChanged() {
  const timestamp = await GrocyClient.getLastChangedTimestamp(
    AbortTimeoutController().signal,
  );
  if (
    timestamp === undefined || !(pageInfo.state instanceof ProductState) ||
    timestamp === pageInfo.state.lastchanged.timestamp ||
    pageInfo.state.progress !== 0
  ) {
    return;
  }

  pageInfo.state.lastchanged.timestamp = timestamp;
  pageInfo.state.progress = 1;
  fetchStock(pageInfo.state.grocyData, AbortTimeoutController().signal);
  pageInfo.state.progress = 100;
  setTimeout(() => pageInfo.state.progress = 0, 300);
}

interface ProductStateInfo {
  grocyData: GrocyData;
  unitSize: number;
}

export async function fetchProductStateInfo(
  barcode: string,
): Promise<ProductStateInfo> {
  const actrl = AbortTimeoutController();
  const dbChangedPromise = fetchDbChanged();

  let grocyData: GrocyData = {};
  // We fetch 'grcy:p:'-Barcodes from product_barcodes_view because only this view provides them.
  // Other barcodes we fetch directly from product_barcodes because we want the userfields and
  // they are returned only from there.
  // (The 'grcy:p:'-Barcodes never have userfields, so no problem there.)
  const [fetchedBarcode, ...fetchedExtraBarcodes] = await GrocyClient
    .getBarcode(barcode, actrl.signal);
  if (fetchedBarcode === undefined) {
    throw `No product with barcode ${barcode} found`;
  }
  if (fetchedExtraBarcodes.length) {
    throw `Multiple products with barcode ${barcode} found`;
  }
  grocyData.barcode = fetchedBarcode;
  pageInfo.state.progress = 25;

  const fetchedProduct = await GrocyClient.getProductDetails(
    fetchedBarcode.product_id,
    actrl.signal,
  );
  grocyData.product_details = fetchedProduct;
  const fetchStockPromise = fetchStock(grocyData, actrl.signal);
  pageInfo.state.progress = 50;

  let conv = new Map<number, number>([
    [
      fetchedProduct.product!.qu_id_purchase!,
      fetchedProduct.qu_conversion_factor_purchase_to_stock!,
    ],
    [
      fetchedProduct.product!.qu_id_price!,
      fetchedProduct.qu_conversion_factor_price_to_stock!,
    ],
    [fetchedProduct.product!.qu_id_stock!, 1.0],
  ]);
  if (
    [fetchedProduct.product!.qu_id_consume!, fetchedBarcode.qu_id].some((x) =>
      x != null && !conv.has(x)
    )
  ) {
    for (
      const c of await GrocyClient.getQUConversions(
        fetchedProduct.product!.id!,
        fetchedProduct.product!.qu_id_stock,
        actrl.signal,
      )
    ) {
      conv.set(c.from_qu_id, c.factor);
    }
  }
  const pus = new Map<number, PackagingUnit>();
  let unitSize: number;
  if (fetchedBarcode.amount != null && fetchedBarcode.qu_id != null) {
    const initial_unit = fetchedBarcode.amount *
      conv.get(fetchedBarcode.qu_id)!;
    for (
      const line of (fetchedBarcode.userfields?.packaging_units ?? "").split(
        /\r?\n/,
      )
    ) {
      const match = line.match(/^(\d+)(?:\/(\d+))?\s+(.*)$/);
      if (!match) {
        continue;
      }
      const factor = Number(match[1]) / Number(match[2] ?? 1);
      pus.set(initial_unit * factor, {
        name: match[3],
        amount_display: formatNumber(
          fetchedBarcode.amount * factor,
          fetchedBarcode.qu_id,
        ),
        amount_stock: initial_unit * factor,
      });
    }
    if (!pus.has(initial_unit)) {
      pus.set(initial_unit, {
        name: "Barcode PU",
        amount_display: formatNumber(
          fetchedBarcode.amount,
          fetchedBarcode.qu_id,
        ),
        amount_stock: initial_unit,
      });
    }
    unitSize = initial_unit;
  } else {
    for (
      const pu of [
        {
          name: "Quick C",
          amount: fetchedProduct.product.quick_consume_amount,
        },
        { name: "Quick O", amount: fetchedProduct.product.quick_open_amount },
      ]
    ) {
      if (!pus.has(pu.amount)) {
        pus.set(pu.amount, {
          name: pu.name,
          amount_display: formatNumber(
            pu.amount / conv.get(fetchedProduct.product.qu_id_consume)!,
            fetchedProduct.product.qu_id_consume,
          ),
          amount_stock: pu.amount,
        });
      }
    }
    unitSize = fetchedProduct.product!.quick_consume_amount;
  }
  grocyData.packaging_units = Array.from(pus.entries()).sort(([a], [b]) =>
    a - b
  ).map(([, pu]) => pu);

  const fetchedGroup = await GrocyObjectCache.getObject(
    "product_groups",
    fetchedProduct.product?.product_group_id,
  );
  grocyData.product_group = fetchedGroup;
  pageInfo.state.progress = 75;

  await dbChangedPromise;
  await fetchStockPromise;
  pageInfo.state.progress = 100;
  setTimeout(() => pageInfo.state.progress = 0, 300);

  return { grocyData, unitSize };
}

export async function doConsume(open: boolean) {
  if (
    !(pageInfo.state instanceof ProductState) ||
    pageInfo.state.grocyData?.stock === undefined ||
    !pageInfo.state.consumeValid || pageInfo.state.progress !== 0
  ) return;

  if (
    open && pageInfo.state.grocyData.stock.some((entry) =>
      entry.open === 1 &&
      entry.amount_allotted !== 0
    )
  ) {
    pageInfo.state.reAllot(true);
    return;
  }

  pageInfo.state.progress = 1;

  const to_consume = pageInfo.state.grocyData.stock.filter((entry) =>
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
        pageInfo.state.progress = Math.max(
          1,
          Math.round(++count / total * 100),
        );
      })
    ),
  );

  await fetchStock(pageInfo.state.grocyData, AbortTimeoutController().signal);
  pageInfo.state.progress = 100;

  setTimeout(() => pageInfo.state.progress = 0, 300);
}
