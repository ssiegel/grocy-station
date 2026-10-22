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

const API_TIMEOUT_MS = 10_000;

function abortTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(API_TIMEOUT_MS);
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
    order?: components["parameters"]["order"],
    limit?: components["parameters"]["limit"],
  ) {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/objects/{entity}", {
        params: {
          path: { entity: entity },
          query: { "query[]": query, order: order, limit: limit },
        },
        signal: abortTimeoutSignal(),
      }),
    );
  }

  /**
   * Timestamp of the last database change, as `2026-03-15T14:23:01.123456Z`.
   * Undefined on a database that has never been written.
   */
  public static async getDbChangedTime(): Promise<string | undefined> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/system/db-changed-time", {
        signal: abortTimeoutSignal(),
      }),
    ).changed_time ?? undefined;
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

  public static async getProductDetails(
    product_id: number,
  ): Promise<GrocyProductDetails> {
    return this.unwrapOFData(
      await this.BASE_CLIENT.GET("/stock/products/{productId}", {
        params: {
          path: { productId: product_id },
        },
        signal: abortTimeoutSignal(),
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
        signal: abortTimeoutSignal(),
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
        signal: abortTimeoutSignal(),
      },
    );
  }

  /**
   * Add an item to a shopping list.
   *
   * Posts the item directly rather than going through
   * `/stock/shoppinglist/add-product`, which folds the amount into any
   * existing item for the product and so cannot produce a second one.
   *
   * `amount` is in the product's stock quantity unit.
   */
  public static async postAddToShoppingList(
    product_id: number,
    amount: number,
    shopping_list_id?: number,
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
      signal: abortTimeoutSignal(),
    });
  }

  public static async postConsume(
    product_id: number,
    stock_id: string,
    amount_allotted: number,
    open: boolean,
    spoiled = false,
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
          // Opening cannot spoil anything, and the open endpoint has no
          // such field; sending it there would be meaningless.
          ...(open ? {} : { spoiled: spoiled }),
        },
        signal: abortTimeoutSignal(),
      },
    );
  }

  /**
   * Delete one shopping list item.
   *
   * Addressed by the item's own id, since
   * `/stock/shoppinglist/remove-product` works on product and list only and
   * so cannot name one item among several for the same product.
   */
  public static async deleteShoppingListItem(
    item_id: number,
  ) {
    return await this.BASE_CLIENT.DELETE(`/objects/{entity}/{objectId}`, {
      params: {
        path: { entity: "shopping_list", objectId: item_id },
      },
      signal: abortTimeoutSignal(),
    });
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
        signal: abortTimeoutSignal(),
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
        } catch (e) {
          console.error(`Failed to GET ${entity}:`, e);
        } finally {
          // Record the attempt even on failure, so OBJECT_MIN_INTERVAL
          // throttles retries instead of every cache miss refetching.
          entry.lastFetchTime = Date.now();
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
      return GrocyObjectCache.toArray(entity);
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
      return GrocyObjectCache.toArray(entity);
    }
    return GrocyObjectCache.caches.get(entity)?.cache.get(id);
  }

  /** All cached objects for an entity, or undefined if never fetched. */
  private static toArray(
    entity: CacheableEntities,
  ): GrocyObject | undefined {
    const entry = GrocyObjectCache.caches.get(entity);
    return entry
      ? [...entry.cache.values()] as unknown as GrocyObject
      : undefined;
  }

  /**
   * Fill the cache without going to the server. For tests.
   *
   * Marked as freshly fetched, so a subsequent miss does not trigger a
   * request. Replaces whatever the entity held.
   */
  public static seedForTesting(
    entity: CacheableEntities,
    objects: GrocyObject[],
  ): void {
    GrocyObjectCache.caches.set(entity, {
      cache: new Map(objects.map((obj) => [obj.id as number, obj])),
      lastFetchTime: Date.now(),
      getPromise: undefined,
    });
  }

  /**
   * Empty the cache. For tests, which would otherwise leak seeded objects
   * into one another through this module-level state.
   */
  public static clearForTesting(): void {
    GrocyObjectCache.caches.clear();
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
  const STOCK_LOG_LIMIT = 7 * 24 * 60 * 60 * 1000;
  const timestampLimit = new Date(Date.now() -  STOCK_LOG_LIMIT).toISOString();
  return await GrocyClient.getEntity("stock_log", [
    `product_id=${productId}`,
    `undone=0`,
    `row_created_timestamp>=${timestampLimit}`
  ], "row_created_timestamp:desc") as GrocyStockLogEntry[];
}

/** The product's items across every shopping list. */
export async function fetchProductShoppingListItems(
  productId: number,
): Promise<GrocyShoppingListItem[]> {
  // Omitting the list filter already spans every list, so there is no need
  // to query them one at a time.
  return await GrocyClient.getShoppingListItems(productId);
}
