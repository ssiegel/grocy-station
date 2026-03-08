// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { components, paths } from "$lib/types/grocy-api";
import type {
  GrocyBarcode,
  GrocyErrorReply,
  GrocyObject,
  GrocyProductDetails,
  GrocyQUConversion,
  GrocyShoppingListItem,
  GrocyStockEntry,
  GrocyStockLogEntry,
} from "$lib/types/grocy";
import createClient from "openapi-fetch";

function AbortTimeoutController() {
  const API_TIMEOUT_MS = 10_000;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  return ctrl;
}

export class GrocyClient {
  private static BASE_CLIENT = createClient<paths>({ baseUrl: "/api/grocy/" });

  private static unwrapOFData<D>(
    { data, error }: { data?: D; error?: GrocyErrorReply },
  ): D {
    if (data !== undefined) {
      return data;
    }
    throw error?.error_message ?? Error("Grocy Communication Error");
  }

  // Get Methods

  public static async getEntity(
    entity: components["schemas"]["ExposedEntity_NotIncludingNotListable"],
    query?: components["parameters"]["query"],
    limit?: components["parameters"]["limit"],
  ) {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: entity },
          query: { "query[]": query },
          limit: limit,
        },
        signal: AbortTimeoutController().signal,
      }),
    );
  }

  public static async getBarcode(
    barcode: string,
  ): Promise<GrocyBarcode[]> {
    return await this.getEntity(
      barcode.startsWith("grcy:p:")
        ? "product_barcodes_view"
        : "product_barcodes" as components["schemas"][
          "ExposedEntity_NotIncludingNotListable"
        ],
      [`barcode=${barcode}`],
    ) as GrocyBarcode[];
  }

  public static async getLastChangedTimestamp(): Promise<string | undefined> {
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
  ): Promise<GrocyQUConversion[]> {
    return await this.getEntity(
      "quantity_unit_conversions_resolved",
      [`product_id=${product_id}`, `to_qu_id=${qu_id_stock}`],
    ) as GrocyQUConversion[];
  }

  public static async getShoppingListItems(
    product_id: number,
    shopping_list_id?: number,
  ): Promise<GrocyShoppingListItem[]> {
    return await this.getEntity(
      "shopping_list",
      [`product_id=${product_id}`].concat(
        shopping_list_id ? [`shopping_list_id=${shopping_list_id}`] : [],
      ),
    ) as GrocyShoppingListItem[];
  }

  public static async getStockEntries(
    product_id: number,
  ): Promise<GrocyStockEntry[]> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/stock/products/{productId}/entries", {
        params: {
          path: { productId: product_id },
        },
        signal: AbortTimeoutController().signal,
      }),
    ) as GrocyStockEntry[];
  }

  // Post methods

  public static async postAddMissingProducts(
    list_id?: number,
  ) {
    return await this.BASE_CLIENT.POST(
      `/stock/shoppinglist/add-missing-products`,
      {
        body: {
          list_id: list_id,
        },
        signal: AbortTimeoutController().signal,
      },
    );
  }

  // This posting method allows for
  // amount to be unspecified and
  // it actually be reflected in grocy.
  // with the endpoint
  // `/stock/shoppinglist/add-product`
  // "null" amounts are defaulted to "1".
  public static async postAddToShoppingList(
    product_id: number,
    shopping_list_id?: number,
    amount?: number,
  ) {
    return await this.BASE_CLIENT.POST(`/objects/{entity}`, {
      params: {
        path: { entity: "shopping_list" },
      },
      body: {
        product_id: product_id,
        shopping_list_id: shopping_list_id,
        amount: amount,
      },
      signal: AbortTimeoutController().signal,
    });
  }

  public static async postConsume(
    product_id: number,
    stock_id: string,
    amount_allotted: number,
    open: boolean,
  ) {
    return await this.BASE_CLIENT.POST(
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

  public static async postRemoveProductShopping(
    product_id: number,
    product_amount: number,
    list_id?: number,
  ) {
    return await this.BASE_CLIENT.POST(
      `/stock/shoppinglist/remove-product`,
      {
        body: {
          product_id: product_id,
          list_id: list_id,
          product_amount: product_amount,
        },
        signal: AbortTimeoutController().signal,
      },
    );
  }

  public static async postRemoveBooking(
    booking_id: number,
  ) {
    return await this.BASE_CLIENT.POST(
      `/stock/bookings/{bookingId}/undo`,
      {
        params: {
          path: { bookingId: booking_id },
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
          const data = await GrocyClient.getEntity(
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
    return await entry.getPromise;
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

export async function fetchProductStock(
  productId: number,
): Promise<GrocyStockEntry[]> {
  const fetchedStock = await GrocyClient.getStockEntries(productId);
  for (const entry of fetchedStock) {
    entry.amount_allotted = 0;
  }
  return fetchedStock;
}

export async function fetchProductStockLogs(
  productId: number,
): Promise<GrocyStockLogEntry[]> {
  return await GrocyClient.getEntity("stock_log", [
    `product_id=${productId}`,
    `undone=0`,
  ], 5) as GrocyStockLogEntry[];
}

export async function fetchProductShoppingListItems(
  productId: number,
): Promise<GrocyShoppingListItem[]> {
  let shoppingListItems = await GrocyClient.getShoppingListItems(productId);
  if (!shoppingListItems) {
    const shoppingLists = await GrocyObjectCache.getObject(
      "shopping_lists",
    ) as GrocyShoppingListItem[];
    shoppingListItems = await (Promise.all(
      shoppingLists.filter((shoppingList) => shoppingList.id !== 1).map((
        shoppingList,
      ) => GrocyClient.getShoppingListItems(productId, shoppingList.id)),
    )).then((lists) => lists.flat());
  }
  return shoppingListItems;
}
