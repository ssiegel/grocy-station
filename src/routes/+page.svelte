<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script lang="ts">
    import { onMount, onDestroy, untrack } from "svelte";
    import { setupMqtt, disconnectMqtt } from "$lib/mqtt";
    import { screenOn } from "$lib/screen";
    import {
        GrocyObjectCache,
    } from "$lib/grocy";
    import { ErrorState, MessageState, ProductState, Page} from "$lib/state.svelte";
    import ProductStock from "$lib/components/ProductStock.svelte";

    (globalThis as any).reEnableScreen = () => {
        screenOn(3000);
    };

    const page = new Page();
    const pageState = $derived(page.state);


    //$inspect(pageState.progress).with(console.trace)

    $effect(() => {
        if (pageState instanceof ProductState) {
            void pageState.consumeAmount;
            untrack(() => pageState.reAllot());
        }
    });

    $effect(() => {
        if (pageState.progress === 100) {
            setTimeout(() => pageState.progress = 0, 300);
        };
    })

    onMount(() => {
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.bind("screenOff", "globalThis.reEnableScreen();");
        screenOn(5_000);

        pageState.progress = 1
        GrocyObjectCache.getObject("locations");
        GrocyObjectCache.getObject("quantity_units");
        GrocyObjectCache.getObject("product_groups");

        setupMqtt(page);

        pageState.progress = 100
        //setTimeout(() => page.progress = 0, 300);
        page.toWaitingState();
    });

    onDestroy(() => {
        disconnectMqtt(page);
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

    {#if pageState instanceof ErrorState}
        <div
            class="text-label-fg px-2 grow flex items-center justify-center text-center text-red-400"
        >
            {pageState.message}
        </div>
    {:else if pageState instanceof MessageState}
        <div class="text-label-fg px-2 grow flex items-center justify-center text-center">
            {pageState.message}
        </div>
    {:else if pageState instanceof ProductState}
        <ProductStock productState={pageState} />
    {/if}
</div>

<style>
</style>
