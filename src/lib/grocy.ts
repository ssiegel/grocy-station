// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { components, paths } from "$lib/types/grocy.d.ts";
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
type GrocyUnit = components["schemas"]["QuantityUnit"];
type GrocyProductDetails = components["schemas"]["ProductDetailsResponse"] & {
    product: GrocyProduct;
    product_barcodes: GrocyBarcode[];
    quantity_unit_stock: GrocyUnit;
    default_quantity_unit_purchase: GrocyUnit;
    default_quantity_unit_consume: GrocyUnit;
    quantity_unit_price: GrocyUnit;
};
export type GrocyStockEntry = components["schemas"]["StockEntry"] & {
  /** In GrocyProduct.qu_id_stock units. */
  amount: number;
  amount_allotted: number;
};
type GrocyQUConversion = {
  id: number;
  from_qu_id: number;
  to_qu_id: number;
  factor: number;
  //product_id?: number;
};
type GrocyBarcode = components["schemas"]["ProductBarcode"] & {
  id: number;
  product_id: number;
  barcode: string;
  userfields?: Record<string, string>;
};

export type GrocyShoppingListItem = components["schemas"]["ShoppingListItem"] & {
  id: number;
  shopping_list_id: number;
  product_id: number;
  done: number
};
export type GrocyProductGroup = {
  id: number;
  name: string;
}

export type GrocyShoppingList = {
  id: number;
  name: string;
}

/** Product purchasing or consumption packaging units.
 * 
 * eg.: A *Box* of cerial contains x *Bags* of cerial.
 * Thus *Box* and *Bag* are packaging units of the product cerial.
 * *Box* is the purchase pu and *Bag* is the consumption pu.
*/
export type GrocyPackagingUnit = {
  name: string;
  /** In GrocyProduct.qu_id_stock units. */
  amount: number;
  /** Packaging unit amount formated for display */
  amount_display: string;
};
export type GrocyData = {
  barcode?: GrocyBarcode;
  /** In increasing order of PackagingUnit.amount 
   * with the default consume *Packaging Unit* at index 0.
  */
  packaging_units?: Array<GrocyPackagingUnit>;
  product_details?: GrocyProductDetails;
  product_group?: GrocyProductGroup;
  stock?: Array<GrocyStockEntry>;
  shopping_list_items?: Array<GrocyShoppingListItem>;
  timestamp?: string
};

function AbortTimeoutController() {
  const API_TIMEOUT_MS = 10_000;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  return ctrl;
}

export class GrocyClient {
  private static BASE_CLIENT = createClient<paths>({ baseUrl: "/api/grocy/" });

  private static unwrapOFData<D, E>(
    { data, error }: { data?: D; error?: E },
  ): D {
    if (data !== undefined) {
      return data;
    }
    throw (error as any)?.error_message ?? Error("Grocy Communication Error");
  }

  // Get Methods

  public static async getBarcode(
    barcode: string,
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
        signal: AbortTimeoutController().signal,
      }),
    ) as Array<GrocyBarcode>;
  }

  public static async getCacheable(
    entity: CacheableEntities,
  ) {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: entity },
        },
        signal: AbortTimeoutController().signal,
      }),
    );
  }

  public static async getLastChangedTimestamp(
  ): Promise<string | undefined> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/system/db-changed-time", {
        signal: AbortTimeoutController().signal,
      }),
    ).changed_time;
  }

  public static async getProductDetails(
    product_id: number,
  ): Promise<GrocyProductDetails> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/stock/products/{productId}", {
        params: {
          path: { productId: product_id },
        },
        signal: AbortTimeoutController().signal,
      }),
    ) as GrocyProductDetails;
  }

  public static async getQUConversions(
    product_id: number,
    qu_id_stock: number,
  ): Promise<Array<GrocyQUConversion>> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: "quantity_unit_conversions_resolved" },
          query: {
            "query[]": [`product_id=${product_id}`, `to_qu_id=${qu_id_stock}`],
          },
        },
        signal: AbortTimeoutController().signal,
      }),
    ) as Array<GrocyQUConversion>;
  }

  public static async getShoppingListItems(
    product_id: number,
    shopping_list_id?: number,
  ): Promise<Array<GrocyShoppingListItem>> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: "shopping_list" },
          query: {
            "query[]": [`product_id=${product_id}`].concat((shopping_list_id?[`shopping_list_id=${shopping_list_id}`]:[])),
          },
        },
        signal: AbortTimeoutController().signal,
      }),
    ) as Array<GrocyShoppingListItem>;
  }

  public static async getStockEntries(
    product_id: number,
  ): Promise<Array<GrocyStockEntry>> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/stock/products/{productId}/entries", {
        params: {
          path: { productId: product_id },
        },
        signal: AbortTimeoutController().signal,
      }),
    ) as Array<GrocyStockEntry>;
  }

  // Post methods

  public static async postAddMissingProducts(
    list_id?: number,
  ) {
    return this.BASE_CLIENT.POST(
      `/stock/shoppinglist/add-missing-products`,
      {
        body: {
          list_id: list_id
        },
        signal: AbortTimeoutController().signal,
      },
    );
  }

  public static async postConsume(
    product_id: number,
    stock_id: string,
    amount_allotted: number,
    open: boolean,
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
        signal: AbortTimeoutController().signal,
      },
    );
  }

  public static async postAddProductShopping(
    product_id: number,
    list_id?: number,
  ) {
    return this.BASE_CLIENT.POST(
      `/stock/shoppinglist/add-product`,
      {
        body: {
          product_id: product_id,
          list_id: list_id,
        },
        signal: AbortTimeoutController().signal,
      },
    );
  }

  public static async postRemoveProductShopping(
    product_id: number,
    product_amount: number,
    list_id?: number,
  ) {
    return this.BASE_CLIENT.POST(
      `/stock/shoppinglist/remove-product`,
      {
        body: {
          product_id: product_id,
          list_id: list_id,
          product_amount: product_amount
        },
        signal: AbortTimeoutController().signal,
      },
    );
  }
}

type CacheableEntities =
  | "locations"
  | "quantity_units"
  | "shopping_lists"
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
      await GrocyObjectCache.fetchObjects(entity,);
      setInterval(
        () => GrocyObjectCache.fetchObjects(entity),
        GrocyObjectCache.OBJECT_TTL,
      );
    }

    if (id === undefined) {
      return GrocyObjectCache.caches.get(entity)?.cache.values;
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
      return GrocyObjectCache.caches.get(entity)?.cache.values;
    }
    return GrocyObjectCache.caches.get(entity)?.cache.get(id);
  }
}