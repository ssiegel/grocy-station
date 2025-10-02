<!--
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import CollapsibleSection from '$lib/components/CollapsibleSection.svelte'
    import { formatDate, formatNumber } from "$lib/format";
    import { pressaction } from "$lib/pressaction.svelte";
    import type { ProductState } from "$lib/state.svelte";
    import WhiteButton from './WhiteButton.svelte';

    let { productState: productState }: { productState: ProductState } = $props();

    const productData = $derived(productState.grocyData);
    const stockLog = $derived(productData.stock_log);

    function stockLogEntryPressed(stockLogEntryId: number) {
        if (productState.selectedStockLogEntryIndex === stockLogEntryId) {
            productState.selectedStockLogEntryIndex = undefined
        } else {
            productState.selectedStockLogEntryIndex = stockLogEntryId
        }
    }
</script>

{#snippet button()}
    <WhiteButton 
        hidden={productState.selectedStockLogEntryIndex === undefined}
        modifiers="ml-auto self-stretch"
        onclick={async () => productState.doUndo()}
        label="Undo"
        >
        <svg class="self-stretch" inline-src="undo-fa" height=".5em" fill="currentColor" />
    </WhiteButton>
{/snippet}

{#if stockLog.length > 0}
    <CollapsibleSection header={"Journal"} buttons={[button]} onclose={() => productState.selectedStockLogEntryIndex = undefined}>
        <div
            class="text-label-fg px-0 grid grid-cols-[max-content_max-content_max-content_max-content_1fr] gap-x-2 text-lg"
        >
        <div class="pl-2 justify-self-start">Transaction</div>
        <div class="justify-self-start">Amt</div>
        <div class="justify-self-start">Time</div>
        {#each stockLog as entry, i (entry.id)}
            <div
                style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                class="opacity-20 {i % 2 ? 'bg-shade-low' : 'bg-darken'}"
            ></div>
            <div
                style="grid-area: {i * 2 + 2} / 1"
                class="pl-2 justify-self-center whitespace-nowrap"
            >
            {entry.transaction_type}
            </div>
            <div 
                style="grid-area: {i * 2 + 2} / 2"
                class="justify-self-center whitespace-nowrap"
            >
                {formatNumber(entry.amount, productData.product_details.quantity_unit_stock.id)}
            </div>
            <div 
                style="grid-area: {i * 2 + 2} / 3"
            >
                {formatDate(entry.row_created_timestamp)}
            </div>
            <div
                style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                class="hover:bg-shade-default z-10 border-red-500 border-l-4 border-{
                    productState.selectedStockLogEntryIndex === i
                        ? 'solid'
                        : 'none'
                }"
                use:pressaction
                onlongpress={() => stockLogEntryPressed(i)}
                onshortpress={() => stockLogEntryPressed(i)}
                role="button"
                tabindex="0"
            ></div>
        {/each}
    </div>
    </CollapsibleSection>
{/if}