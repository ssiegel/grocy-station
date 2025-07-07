<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { setupMqtt, disconnectMqtt } from "$lib/mqtt";
    import { screenOn } from "$lib/screen";
    import { showError } from "$lib/error";
    import {
        GrocyObjectCache,
        fetchDbChanged,
        reAllot,
    } from "$lib/grocy";
    import { pageState, lastchanged } from "$lib/state.svelte";
    import ProductStock from "$lib/components/ProductStock.svelte";

    const GROCY_POLL_INTERVAL_MS = 15_000;

    (globalThis as any).reEnableScreen = () => {
        screenOn(3000);
    };

    $effect(() => {
        void pageState.conumeAmount;
        untrack(() => reAllot(false));
    });

    onMount(() => {
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.bind("screenOff", "globalThis.reEnableScreen();");
        screenOn(5_000);
        GrocyObjectCache.getObject("locations");
        GrocyObjectCache.getObject("quantity_units");
        GrocyObjectCache.getObject("product_groups");

        setTimeout(fetchDbChanged);
        lastchanged.interval = setInterval(fetchDbChanged, GROCY_POLL_INTERVAL_MS);

        setupMqtt();

        showError();
    });

    onDestroy(() => {
        disconnectMqtt();
    });
</script>

<div class="text-2xl flex flex-col gap-2 items-stretch min-h-screen">
    {#if pageState.progress}
        <div class="fixed top-0 left-0 w-full h-[2px] z-50 pointer-events-none">
            <div
                class="bg-yellow-500 h-full transition-all duration-300"
                style="width: {pageState.progress}%"
            ></div>
        </div>
    {/if}
    <div class="bg-container-bg-default text-container-fg px-2 py-1">Grocy Station</div>

    {#if pageState.error.message}
        <div
            class="text-label-fg px-2 grow flex items-center justify-center text-center text-red-400"
        >
            {pageState.error.message}
        </div>
    {:else if !pageState.grocyData || !Object.keys(pageState.grocyData).length}
        <div class="text-label-fg px-2 grow flex items-center justify-center text-center">
            {pageState.standbyMessage}
        </div>
    {:else}
        <ProductStock product={pageState.grocyData} />
    {/if}
</div>

<style>
</style>
