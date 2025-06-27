import { untrack } from 'svelte';
import createClient from "openapi-fetch";
import type { paths, components } from '$lib/types/grocy.d.ts';

function screenOff() {
    // Calling window.fully?.turnScreenOff?.() here would be straightforward, but we're
    // running into (deep) sleep and reactivation issues, so just turn off the backlight.
    // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
    window.fully?.runSuCommand?.('printf 0 > /sys/class/leds/lcd-backlight/brightness');
}
const screenOn = (() => {
    let screentimeout = undefined as ReturnType<typeof setTimeout> | undefined;
    return function(timeout?: number) {
        clearTimeout(screentimeout);
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.turnScreenOn?.();
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.runSuCommand?.('printf 255 > /sys/class/leds/lcd-backlight/brightness');
        if (timeout)
            screentimeout = setTimeout(screenOff, timeout);
    };
})();

export function AbortTimeoutController() {
    const API_TIMEOUT_MS = 10_000;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    return ctrl;
}

export let grocy = createClient<paths>({ baseUrl: "/api/grocy/"});

// type GrocyObject = paths['/objects/{entity}/{objectId}']['get']['responses'][200]['content']['application/json'];
// type GrocyObject = Record<string, unknown>;
type GrocyObject = Record<string, any>;
type GrocyProduct = components["schemas"]["Product"] & {
    qu_id_stock: number,
    qu_id_purchase: number,
    qu_id_consume: number,
    qu_id_price: number,
    quick_open_amount: number,
    quick_consume_amount: number,
    due_type: 1 | 2,
};
type GrocyProductDetails = components["schemas"]["ProductDetailsResponse"] & {
    product: GrocyProduct,
    product_barcodes: GrocyBarcode[],
    quantity_unit_stock: GrocyUnit,
    default_quantity_unit_purchase: GrocyUnit,
    default_quantity_unit_consume: GrocyUnit,
    quantity_unit_price: GrocyUnit,
};
type GrocyStockEntry = components['schemas']['StockEntry'] & {
    amount: number;
    amount_allotted: number;
};
type GrocyUnit = components['schemas']['QuantityUnit'];
type GrocyQUConversion = {
    id: number,
    from_qu_id: number,
    to_qu_id: number,
    factor: number,
    product_id?: number
};
type GrocyBarcode = components['schemas']['ProductBarcode'] & {
    id: number,
    product_id: number,
    barcode: string,
    userfields?: Record<string, string>
}
type PackagingUnit = {
    name: string,
    amount_display: string,
    amount_stock: number
};
export type GrocyData = {
    barcode?: GrocyBarcode,
    packaging_units?: Array<PackagingUnit>,
    product_details?: GrocyProductDetails,
    product_group?: GrocyObject,
    stock?: Array<GrocyStockEntry>,
};

export let lastchanged = { timestamp: undefined as string | undefined, interval: undefined as ReturnType<typeof setInterval> | undefined };
export let progress = $state({ current: 0 });
export let error = $state({ message: '', timeout: undefined as ReturnType<typeof setTimeout> | undefined });
export let grocyData = $state(undefined as GrocyData | undefined);
export let standbyMessage = $state('Initializing…');

export let inputUnitsize = $state({ current: 0 });
export let inputQuantity = $state({ current: 0 });
export let consumeAmount = $derived(inputUnitsize.current * inputQuantity.current);
export let consumeValid = $state(false);

$effect(() => {
    void consumeAmount;
    untrack(() => reAllot(false));
});
export function reAllot(skipOpen: Boolean) {
    if(!Number.isFinite(consumeAmount) || consumeAmount <= 0 || grocyData?.stock === undefined) {
        consumeValid = false;
        return;
    }

    let remaining = consumeAmount;
    for (const entry of grocyData.stock) {
        if (skipOpen && entry.open === 1) {
            entry.amount_allotted = 0;
        } else {
            entry.amount_allotted = Math.min(entry.amount, remaining);
            remaining -= entry.amount_allotted;
        }
    }

    consumeValid = remaining === 0;
}

export function showError(message?: string, timeout?: number) {
    clearTimeout(error.timeout);
    progress.current = 0;
    if (message) {
        error.message = message;
    } else {
        error.message = '';
        standbyMessage = 'Please scan a barcode.';
    }
    if (timeout) {
        error.timeout = setTimeout(() => {
            error.message = '';
            error.timeout = undefined;
            standbyMessage = 'Please scan a barcode.';
        }, timeout);
    }
}

export function formatNumber(amount: number, unitId?: number): string {
    let formatted = Intl.NumberFormat("en-US", {
        style: "decimal",
        maximumSignificantDigits: 5,
        useGrouping: false,
    }).format(amount).toString();
    const unit = unitId !== undefined ? GrocyObjectCache.getCachedObject('quantity_units', unitId) : undefined;
    if (unit !== undefined) {
        formatted += ' ';
        if (unit.userfields?.symbol)
            formatted += unit.userfields?.symbol;
        else if (unit.name_plural !== undefined && Math.abs(amount-1.0) >= 1e-6)
            formatted += unit.name_plural;
        else
            formatted += unit.name;
    }
    return formatted;
}

function unwrapOFData<D, E>({ data, error }: { data?: D, error?: E }): D {
    if (data !== undefined)
        return data;
    throw (error as any)?.error_message ?? Error('Grocy Communication Error');
}

type CacheableEntities = 'locations' | 'quantity_units' | 'shopping_locations' | 'product_groups';
export class GrocyObjectCache {
    private static readonly OBJECT_TTL = 60 * 60 * 1_000;       // 1 hour
    private static readonly OBJECT_MIN_INTERVAL = 5 * 60 * 1_000; // 5 minutes
    private static readonly caches = new Map<string, {
        cache: Map<number, GrocyObject>,
        lastFetchTime: number,
        fetchPromise: Promise<void> | undefined
    }>();

    private static async fetchObjects(entity: CacheableEntities): Promise<void> {
        const entry = GrocyObjectCache.caches.get(entity)!;
        // only issue a new request if there is none in-flight
        if (!entry.fetchPromise) {
            entry.fetchPromise = (async () => {
                try {
                    const data = unwrapOFData(await grocy.GET('/objects/{entity}', {
                        params: {
                            path: { entity: entity },
                        },
                        signal: AbortTimeoutController().signal
                    }));
                    entry.cache.clear();
                    for (const obj of data)
                        // @ts-expect-error TS2339: type information for '/objects/{entity}' is incomplete
                        entry.cache.set(obj.id, obj);
                    entry.lastFetchTime = Date.now();
                } catch (e) {
                    console.error(`Failed to fetch ${entity}:`, e);
                } finally {
                    entry.fetchPromise = undefined;
                }
            })();
        }
        return entry.fetchPromise;
    }

    /**
    * Asynchronously get a GrocyObject, fetching from the server if:
    *  - we've never fetched this entity before
    *  - the object isn't in cache and at least OBJECT_MIN_INTERVAL has passed
    */
    public static async getObject(entity: CacheableEntities, id?: number): Promise<GrocyObject | undefined> {
        if (!GrocyObjectCache.caches.has(entity)) {
            GrocyObjectCache.caches.set(entity, {
                cache: new Map<number, GrocyObject>(),
                lastFetchTime: 0,
                fetchPromise: undefined
            });
            await GrocyObjectCache.fetchObjects(entity);
            setInterval(() => GrocyObjectCache.fetchObjects(entity), GrocyObjectCache.OBJECT_TTL);
        }

        if (id === undefined)
            return undefined;

        const entry = GrocyObjectCache.caches.get(entity)!;
        if (!entry.cache.has(id) && Date.now() - entry.lastFetchTime > GrocyObjectCache.OBJECT_MIN_INTERVAL)
            await GrocyObjectCache.fetchObjects(entity);
        return entry.cache.get(id);
    }

    /**
    * Synchronous lookup: returns a cached object if present, or undefined.
    */
    public static getCachedObject(entity: CacheableEntities, id?: number): GrocyObject | undefined {
        if (id === undefined)
            return undefined;
        return GrocyObjectCache.caches.get(entity)?.cache.get(id);
    }
}

export function stockEntryPressed(entry: GrocyStockEntry) {
}

export async function fetchDbChanged() {
    const timestamp = unwrapOFData(await grocy.GET('/system/db-changed-time', {
        signal: AbortTimeoutController().signal
    })).changed_time;
    if (timestamp === undefined || timestamp === lastchanged.timestamp || progress.current !== 0 || grocyData?.product_details?.product.id === undefined)
        return;

    lastchanged.timestamp = timestamp;

    progress.current = 1;
    await fetchStock();

    progress.current = 100;
    setTimeout(() => progress.current = 0, 300);
}

export async function fetchStock(product_id?: number, signal?: AbortSignal) {
    if (grocyData === undefined)
        return;
    product_id ??= grocyData.product_details?.product.id;
    if (product_id === undefined) {
        grocyData.stock = undefined;
        return;
    }
    signal ??= AbortTimeoutController().signal;

    const fetchStockPromise = grocy.GET('/stock/products/{productId}/entries', {
        params: {
            path: { productId: product_id },
        },
        signal: signal
    });

    if (grocyData.product_details !== undefined) {
        const fetchedProduct = unwrapOFData(await grocy.GET('/stock/products/{productId}', {
            params: {
                path: { productId: product_id },
            },
            signal: signal
        })) as GrocyProductDetails;
        grocyData.product_details.stock_amount = fetchedProduct.stock_amount;
        grocyData.product_details.stock_amount_opened = fetchedProduct.stock_amount_opened;
    }

    const fetchedStock = unwrapOFData(await fetchStockPromise) as Array<GrocyStockEntry>;
    for (const entry of fetchedStock)
        entry.amount_allotted = 0;
    grocyData.stock = fetchedStock;

    // Force trigger recalculation of allotted amounts via $effect
    inputQuantity.current = 0;
    await Promise.resolve();
    inputQuantity.current = 1;
}

export async function showGrocyProduct(barcode: string) {
    if (barcode === grocyData?.barcode?.barcode && Number.isFinite(inputQuantity.current)) {
        inputQuantity.current = Math.max(0, inputQuantity.current) + 1;
        return;
    }

    progress.current = 1;
    standbyMessage = '';
    grocyData = {};

    const actrl = AbortTimeoutController();

    const dbChangedPromise = fetchDbChanged();

    // We fetch 'grcy:p:'-Barcodes from product_barcodes_view because only this view provides them.
    // Other barcodes we fetch directly from product_barcodes because we want the userfields and
    // they are returned only from there.
    // (The 'grcy:p:'-Barcodes never have userfields, so no problem there.)
    const [fetchedBarcode, ...fetchedExtraBarcodes] = unwrapOFData(await grocy.GET('/objects/{entity}', {
        params: {
            path: { entity: barcode.startsWith('grcy:p:') ? 'product_barcodes_view' : 'product_barcodes' },
            query: { 'query[]': [`barcode=${barcode}`] }
        },
        signal: actrl.signal
    })) as Array<GrocyBarcode>;
    if (fetchedBarcode === undefined)
        throw `No product with barcode ${barcode} found`;
    if (fetchedExtraBarcodes.length)
        throw `Multiple products with barcode ${barcode} found`;
    grocyData.barcode = fetchedBarcode;
    progress.current = 25;

    const fetchStockPromise = fetchStock(fetchedBarcode.product_id, actrl.signal);

    const fetchedProduct = unwrapOFData(await grocy.GET('/stock/products/{productId}', {
        params: {
            path: { productId: fetchedBarcode.product_id },
        },
        signal: actrl.signal
    })) as GrocyProductDetails;
    grocyData.product_details = fetchedProduct;
    progress.current = 50;

    let conv = new Map<number, number>([
        [fetchedProduct.product!.qu_id_purchase!, fetchedProduct.qu_conversion_factor_purchase_to_stock!],
        [fetchedProduct.product!.qu_id_price!, fetchedProduct.qu_conversion_factor_price_to_stock!],
        [fetchedProduct.product!.qu_id_stock!, 1.0],
    ]);
    if ([fetchedProduct.product!.qu_id_consume!, fetchedBarcode.qu_id].some(x => x != null && !conv.has(x))) {
        for(const c of unwrapOFData(await grocy.GET('/objects/{entity}', {
            params: {
                path: { entity: 'quantity_unit_conversions_resolved' },
                query: { 'query[]': [`product_id=${fetchedProduct.product!.id}`, `to_qu_id=${fetchedProduct.product!.qu_id_stock}`] }
            },
            signal: actrl.signal
        })) as Array<GrocyQUConversion>) {
            conv.set(c.from_qu_id, c.factor);
        }
    }
    const pus = new Map<number, PackagingUnit>();
    if (fetchedBarcode.amount != null && fetchedBarcode.qu_id != null) {
        const initial_unit = fetchedBarcode.amount * conv.get(fetchedBarcode.qu_id)!;
        for (const line of (fetchedBarcode.userfields?.packaging_units ?? '').split(/\r?\n/)) {
            const match = line.match(/^(\d+)(?:\/(\d+))?\s+(.*)$/);
            if (!match)
                continue;
            const factor = Number(match[1])/Number(match[2] ?? 1);
            pus.set(initial_unit * factor, {
                name: match[3],
                amount_display: formatNumber(fetchedBarcode.amount * factor, fetchedBarcode.qu_id),
                amount_stock: initial_unit * factor
            });
        }
        if (!pus.has(initial_unit)) {
            pus.set(initial_unit, {
                name: "Barcode PU",
                amount_display: formatNumber(fetchedBarcode.amount, fetchedBarcode.qu_id),
                amount_stock: initial_unit
            });
        }
        inputUnitsize.current = initial_unit;
    } else {
        for (const pu of [
            { name: "Quick C", amount: fetchedProduct.product.quick_consume_amount },
            { name: "Quick O", amount: fetchedProduct.product.quick_open_amount }
        ]) {
            if (!pus.has(pu.amount)) {
                pus.set(pu.amount, {
                    name: pu.name,
                    amount_display: formatNumber(pu.amount / conv.get(fetchedProduct.product.qu_id_consume)!, fetchedProduct.product.qu_id_consume),
                    amount_stock: pu.amount
                });
            }
        }
        inputUnitsize.current = fetchedProduct.product!.quick_consume_amount;
    }
    grocyData.packaging_units = Array.from(pus.entries()).sort(([a], [b]) => a-b).map(([, pu]) => pu);

    const fetchedGroup = await GrocyObjectCache.getObject('product_groups', fetchedProduct.product?.product_group_id)
    grocyData.product_group = fetchedGroup;
    progress.current = 75;

    await dbChangedPromise;
    await fetchStockPromise;
    progress.current = 100;

    setTimeout(() => progress.current = 0, 300);
}