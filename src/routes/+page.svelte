<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { pressaction } from '$lib/pressaction.svelte';
    import { setupMqtt, disconnectMqtt } from '$lib/page/mqtt';
    import { screenOn } from '$lib/screen'
    import { formatDate, formatUnit } from '$lib/page/format'
    import { GrocyObjectCache, grocyData, consumeValid, progress, reAllot, AbortTimeoutController, grocy, fetchStock, error, standbyMessage, inputUnitsize, inputQuantity, consumeAmount, formatNumber, stockEntryPressed, fetchDbChanged, lastchanged, showError} from '$lib/page/page.svelte';
    import type { GrocyData } from '$lib/page/page.svelte';

    const GROCY_POLL_INTERVAL_MS = 15_000;

    (globalThis as any).reEnableScreen = () => {
    screenOn(3000);
    };

    async function doConsume(open: Boolean) {
        if (grocyData?.stock === undefined || !consumeValid || progress.current !== 0) return;

        if (open && grocyData.stock.some((entry) =>
            entry.open === 1 &&
            entry.amount_allotted !== 0
        )) {
            reAllot(true);
            return;
        }

        progress.current = 1;

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
                progress.current = Math.max(1, Math.round(++count/total*100));
            })
        ));

        await fetchStock();
        progress.current = 100;

        setTimeout(() => progress.current = 0, 300);
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

        setupMqtt()

        showError();
    });

    onDestroy(() => {
        disconnectMqtt()
    });
</script>

<style>
</style>

{#snippet product_view(grocyData: GrocyData)}
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
                        <button class="{'bg-@-bg-default hover:bg-@-bg-hover focus:bg-@-bg-focus active:bg-@-bg-active text-@-fg'.replaceAll('@', inputUnitsize.current === pu.amount_stock ? 'btn' : 'input')} border-btn-bg-default hover:border-btn-bg-hover focus:border-btn-bg-focus active:border-btn-bg-active border-2 px-2 py-1 rounded" onclick={() => inputUnitsize.current = pu.amount_stock}>{pu.name}<br/>{pu.amount_display}</button>
                    {/each}
                </div>
            {/if}
            <div class="flex flex-row gap-2 items-center justify-start">
                <div><label>
                    <span class="text-xl">Unit size</span><br />
                    <input bind:value={inputUnitsize.current} type="number" size="4" class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(inputUnitsize.current) ? 'text-input-fg' : 'text-red-500'}" />
                    {formatUnit(grocyData.product_details.quantity_unit_stock.id)}
                </label></div>
                <div><span>×</span></div>
                <div><label>
                    <span class="text-xl">Quantity</span><br />
                    <input bind:value={inputQuantity.current} type="number" size="4" class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(inputQuantity.current) ? 'text-input-fg' : 'text-red-500'}" />
                </label></div>
                <div class="self-stretch flex flex-col gap-2 text-md">
                    <button class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0" onclick={() => {if (Number.isFinite(inputQuantity.current)) inputQuantity.current = Math.max(0, inputQuantity.current)+1;}}>+</button>
                    <button class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0" onclick={() => {if (Number.isFinite(inputQuantity.current)) inputQuantity.current = Math.max(0, inputQuantity.current)-1;}}>−</button>
                </div>
                {#if Number.isFinite(consumeAmount)}
                    <div><span>=</span></div>
                    <div><span class="{consumeValid ? '' : 'text-red-500'}">{formatNumber(consumeAmount, grocyData.product_details.quantity_unit_stock.id)}</span></div>
                {/if}
                <div class="ml-auto self-stretch">
                    <button disabled={!consumeValid || progress.current != 0} class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded" aria-label="Open" onclick={async () => doConsume(true)}>
                        <svg inline-src="open" height="1.5em" fill="currentColor" />
                    </button>
                </div>
                <div class="self-stretch">
                    <button disabled={!consumeValid || progress.current != 0} class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded" aria-label="Consume" onclick={async () => doConsume(false)}>
                        <svg inline-src="consume" height="1.5em" fill="currentColor" />
                    </button>
                </div>
            </div>
        {/if}
    </div>
{/snippet}

<div class="text-2xl flex flex-col gap-2 items-stretch min-h-screen">
{#if progress.current}
    <div class="fixed top-0 left-0 w-full h-[2px] z-50 pointer-events-none">
        <div class="bg-yellow-500 h-full transition-all duration-300" style="width: {progress.current}%"></div>
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
    {@render product_view(grocyData)}

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
