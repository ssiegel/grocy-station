<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import { env } from '$env/dynamic/public';
    import { pressaction } from '$lib/pressaction.svelte';
    import mqtt from 'mqtt';
    import { parseBarcode } from '$lib/barcode';
    import createClient from "openapi-fetch";
    import type { paths, components } from '$lib/types/grocy.d.ts';

    const GROCY_POLL_INTERVAL_MS = 15_000;

    (globalThis as any).reEnableScreen = () => {
        screenOn(3000);
    };
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

    function AbortTimeoutController() {
        const API_TIMEOUT_MS = 10_000;
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
        return ctrl;
    }

    let mqttclient: mqtt.MqttClient;
    let grocy = createClient<paths>({ baseUrl: "/api/grocy/"});

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
    type GrocyData = {
        barcode?: GrocyBarcode,
        packaging_units?: Array<PackagingUnit>,
        product_details?: GrocyProductDetails,
        product_group?: GrocyObject,
        stock?: Array<GrocyStockEntry>,
    };

    let lastchanged = { timestamp: undefined as string | undefined, interval: undefined as ReturnType<typeof setInterval> | undefined };
    let progress = $state(0);
    let error = $state({ message: '', timeout: undefined as ReturnType<typeof setTimeout> | undefined });
    let grocyData = $state(undefined as GrocyData | undefined);
    let standbyMessage = $state('Initializing…');

    let inputUnitsize = $state(0);
    let inputQuantity = $state(0);
    let consumeAmount = $derived(Number(inputUnitsize)*Number(inputQuantity));
    let consumeValid = $state(false);

    $effect(() => {
        void consumeAmount;
        untrack(() => reAllot(false));
    });
    function reAllot(skipOpen: Boolean) {
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

    function showError(message?: string, timeout?: number) {
        clearTimeout(error.timeout);
        progress = 0;
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

    function formatUnit(unitId?: number): string {
        const unit = unitId !== undefined ? GrocyObjectCache.getCachedObject('quantity_units', unitId) : undefined;
        if (unit === undefined)
            return '';
        else if (unit.userfields?.symbol)
            return unit.userfields.symbol;
        // else if (unit.name_plural !== undefined)
        //     return unit.name_plural;
        else
            return unit.name;
    }

    function formatNumber(amount: number, unitId?: number): string {
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

    function formatDate(date?: string): string {
        date ??= 'unknown';
        return date === '2999-12-31' ? 'never' : date;
    }

    function unwrapOFData<D, E>({ data, error }: { data?: D, error?: E }): D {
        if (data !== undefined)
            return data;
        throw (error as any)?.error_message ?? Error('Grocy Communication Error');
    }

    type CacheableEntities = 'locations' | 'quantity_units' | 'shopping_locations' | 'product_groups';
    class GrocyObjectCache {
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

    async function doConsume(open: Boolean) {
        if (grocyData?.stock === undefined || !consumeValid || progress !== 0) return;

        if (open && grocyData.stock.some((entry) =>
            entry.open === 1 &&
            entry.amount_allotted !== 0
        )) {
            reAllot(true);
            return;
        }

        progress = 1;

        const actrl = AbortTimeoutController();
        const to_consume = grocyData.stock.filter((entry) =>
            entry.amount_allotted !== 0 &&
            entry.product_id !== undefined
        );

        const total = to_consume.length + 1;  // +1 for the final fetchStock()
        let count = 0;
        await Promise.all(to_consume.map((entry) =>
            grocy.POST(`/stock/products/{productId}/${open ? 'open' : 'consume'}`, {
                params: {
                    path: { productId: entry.product_id! }
                },
                body: {
                    amount: entry.amount_allotted,
                    stock_entry_id: entry.stock_id
                },
                signal: actrl.signal
            }).then(() => {
                progress = Math.max(1, Math.round(++count/total*100));
            })
        ));

        await fetchStock();
        progress = 100;

        setTimeout(() => progress = 0, 300);
    }

    function stockEntryPressed(entry: GrocyStockEntry) {
    }

    async function fetchDbChanged() {
        const timestamp = unwrapOFData(await grocy.GET('/system/db-changed-time', {
            signal: AbortTimeoutController().signal
        })).changed_time;
        if (timestamp === undefined || timestamp === lastchanged.timestamp || progress !== 0 || grocyData?.product_details?.product.id === undefined)
            return;

        lastchanged.timestamp = timestamp;

        progress = 1;
        await fetchStock();

        progress = 100;
        setTimeout(() => progress = 0, 300);
    }

    async function fetchStock(product_id?: number, signal?: AbortSignal) {
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
        inputQuantity = 0;
        await Promise.resolve();
        inputQuantity = 1;
    }

    async function showGrocyProduct(barcode: string) {
        if (barcode === grocyData?.barcode?.barcode && Number.isFinite(Number(inputQuantity))) {
            inputQuantity = Math.max(0, Number(inputQuantity)) + 1;
            return;
        }

        progress = 1;
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
        progress = 25;

        const fetchStockPromise = fetchStock(fetchedBarcode.product_id, actrl.signal);

        const fetchedProduct = unwrapOFData(await grocy.GET('/stock/products/{productId}', {
            params: {
                path: { productId: fetchedBarcode.product_id },
            },
            signal: actrl.signal
        })) as GrocyProductDetails;
        grocyData.product_details = fetchedProduct;
        progress = 50;

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
            inputUnitsize = initial_unit;
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
            inputUnitsize = fetchedProduct.product!.quick_consume_amount;
        }
        grocyData.packaging_units = Array.from(pus.entries()).sort(([a], [b]) => a-b).map(([, pu]) => pu);

        const fetchedGroup = await GrocyObjectCache.getObject('product_groups', fetchedProduct.product?.product_group_id)
        grocyData.product_group = fetchedGroup;
        progress = 75;

        await dbChangedPromise;
        await fetchStockPromise;
        progress = 100;

        setTimeout(() => progress = 0, 300);
    }

    onMount(() => {
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.bind('screenOff','globalThis.reEnableScreen();')
        screenOn(5_000);
        GrocyObjectCache.getObject('locations');
        GrocyObjectCache.getObject('quantity_units');
        GrocyObjectCache.getObject('product_groups');

        setTimeout(fetchDbChanged, 0);
        lastchanged.interval = setInterval(fetchDbChanged, GROCY_POLL_INTERVAL_MS);

        if (env.PUBLIC_BROKER_URL === undefined || env.PUBLIC_TOPIC === undefined) {
            showError(`MQTT not configured`);
            return;
        }

        mqttclient = mqtt.connect(env.PUBLIC_BROKER_URL);

        mqttclient.on('connect', () => {
            if (env.PUBLIC_TOPIC !== undefined)
            mqttclient.subscribe(env.PUBLIC_TOPIC, (err) => {
                if (err)
                    showError(`Subscription error: ${err}`);
            });
        });

        mqttclient.on('message', async (topic: string, payload: Buffer) => {
            if (topic !== env.PUBLIC_TOPIC)
                return;

            let parsed = parseBarcode(payload);
            if (!parsed.grocy)
                return;

            showError();
            screenOn(600_000);

            try {
                await showGrocyProduct(parsed.grocy);
            } catch (e) {
                if (typeof e === 'string')
                    showError(e, 10_000);
                else if (e instanceof Error)
                    showError(`${e.name}: ${e.message}`);
                else
                    throw e;
            }
        });

        mqttclient.on('error', (err) => {
            showError(`MQTT error: ${err}`);
        });

        showError();
    });

    onDestroy(() => {
        if (mqttclient && mqttclient.connected) {
            mqttclient.end();
            showError('Disconnected from MQTT broker');
        }
    });

</script>

<style>
</style>

<div class="text-2xl flex flex-col gap-2 items-stretch min-h-screen">
{#if progress}
    <div class="fixed top-0 left-0 w-full h-[2px] z-50 pointer-events-none">
        <div class="bg-yellow-500 h-full transition-all duration-300" style="width: {progress}%"></div>
    </div>
{/if}
    <div class="bg-container-bg-default text-container-fg px-2 py-1">
        Grocy Station
    </div>

{#if error.message}
    <div class="text-label-fg px-2 grow flex items-center justify-center text-center text-red-400">
        {error.message}
    </div>
{:else if !grocyData || !Object.keys(grocyData).length}
    <div class="text-label-fg px-2 grow flex items-center justify-center text-center">
        {standbyMessage}
    </div>
{:else}
    <div class="bg-container-bg-default text-container-fg px-2 py-1 flex flex-row items-center justify-between">
        <div>{grocyData.product_details?.product.name ?? '\u00a0'}</div>
        {#if grocyData.product_group?.name}<div class="text-xl whitespace-nowrap">{grocyData.product_group.name}</div>{/if}
    </div>

    <div class="text-label-fg px-2 flex flex-col gap-1 items-stretch text-2xl">
        {#if grocyData.barcode !== undefined && !grocyData.barcode.barcode.startsWith('grcy:p:')}<div class="text-xl">{grocyData.barcode.barcode} <span class="italic">{grocyData.barcode.note}</span></div>{/if}
        {#if grocyData.product_details !== undefined}
            {#if grocyData.packaging_units !== undefined}
                <div class="flex flex-row gap-4 items-stretch justify-start">
                    {#each grocyData.packaging_units as pu}
                        <button class="{'bg-@-bg-default hover:bg-@-bg-hover focus:bg-@-bg-focus active:bg-@-bg-active text-@-fg'.replaceAll('@', Number(inputUnitsize) === pu.amount_stock ? 'btn' : 'input')} border-btn-bg-default hover:border-btn-bg-hover focus:border-btn-bg-focus active:border-btn-bg-active border-2 px-2 py-1 rounded" onclick={() => inputUnitsize = pu.amount_stock}>{pu.name}<br/>{pu.amount_display}</button>
                    {/each}
                </div>
            {/if}
            <div class="flex flex-row gap-2 items-center justify-start">
                <div><label>
                    <span class="text-xl">Unit size</span><br />
                    <input bind:value={inputUnitsize} type="text" inputmode="decimal" size="4" class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(Number(inputUnitsize)) ? 'text-input-fg' : 'text-red-500'}" />
                    {formatUnit(grocyData.product_details.quantity_unit_stock.id)}
                </label></div>
                <div><span>×</span></div>
                <div><label>
                    <span class="text-xl">Quantity</span><br />
                    <input bind:value={inputQuantity} type="text" inputmode="numeric" size="4" class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(Number(inputQuantity)) ? 'text-input-fg' : 'text-red-500'}" />
                </label></div>
                <div class="self-stretch flex flex-col gap-2 text-md">
                    <button class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0" onclick={() => {if (Number.isFinite(Number(inputQuantity))) inputQuantity = Math.max(0, Number(inputQuantity))+1;}}>+</button>
                    <button class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0" onclick={() => {if (Number.isFinite(Number(inputQuantity))) inputQuantity = Math.max(0, Number(inputQuantity)-1);}}>−</button>
                </div>
                {#if Number.isFinite(consumeAmount)}
                    <div><span>=</span></div>
                    <div><span class="{consumeValid ? '' : 'text-red-500'}">{formatNumber(consumeAmount, grocyData.product_details.quantity_unit_stock.id)}</span></div>
                {/if}
                <div class="ml-auto self-stretch">
                    <button disabled={!consumeValid || progress != 0} class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded" aria-label="Open" onclick={async () => doConsume(true)}>
                        <svg inline-src="open" height="1.5em" fill="currentColor" />
                    </button>
                </div>
                <div class="self-stretch">
                    <button disabled={!consumeValid || progress != 0} class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded" aria-label="Consume" onclick={async () => doConsume(false)}>
                        <svg inline-src="consume" height="1.5em" fill="currentColor" />
                    </button>
                </div>
            </div>
        {/if}
    </div>

    {#if grocyData.stock !== undefined || grocyData.product_details !== undefined}
        <div class="bg-container-bg-default text-container-fg px-2 py-1">
            {#if grocyData.product_details?.stock_amount}
                Stock amount: {formatNumber(grocyData.product_details.stock_amount, grocyData.product_details.quantity_unit_stock.id)}
                {#if grocyData.product_details.stock_amount_opened}({formatNumber(grocyData.product_details.stock_amount_opened)} opened){/if}
            {:else if grocyData.stock?.length}
                Stock
            {:else}
                Not in stock
            {/if}
        </div>
        {#if grocyData.stock?.length}
            <div class="text-label-fg px-0 grid grid-cols-[max-content_max-content_max-content_1fr] gap-x-2 text-lg">
                <div class="pl-2">Qty</div><div>{grocyData.product_details?.product.due_type === 2 ? 'Exp' : 'Due'}</div><div>Location</div><div>Purchased</div>
                {#each grocyData.stock as entry, i (entry.id)}
                    <div style="grid-area: {i*2+2} / 1 / {i*2+4} / 5" class="opacity-20 {i%2 ? 'bg-darken' : 'bg-shade-low'}"></div>
                    <div style="grid-area: {i*2+2} / 1" class="pl-2 justify-self-end whitespace-nowrap">
                        {#if entry.open === 1}<svg inline-src="open" class="inline pb-1" height="1em" fill="currentColor" />{/if}
                        {formatNumber(entry.amount)}
                    </div>
                    <div style="grid-area: {i*2+2} / 2">{formatDate(entry.best_before_date)}</div>
                    <div style="grid-area: {i*2+2} / 3">{GrocyObjectCache.getCachedObject('locations', entry.location_id)?.name ?? `Location #${entry.location_id}`}</div>
                    <div style="grid-area: {i*2+2} / 4">{formatDate(entry.purchased_date)}</div>
                    {#if entry.note}<div style="grid-area: {i*2+3} / 2 / {i*2+4} / 5" class="col-start-2 col-span-3 px-4 italic">{entry.note}</div>{/if}
                        <div style="grid-area: {i*2+2} / 1 / {i*2+4} / 5" class="hover:bg-shade-default z-10 border-yellow-500 border-l-4 border-{entry.amount_allotted > 0 ? entry.amount_allotted < entry.amount ? 'dotted' : 'solid' : 'none'}" use:pressaction onlongpress={() => stockEntryPressed(entry)} onshortpress={() => stockEntryPressed(entry)} role="button" tabindex="0"></div>
                {/each}
            </div>
        {/if}
    {/if}
{/if}
</div>
