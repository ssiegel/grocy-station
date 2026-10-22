<!--
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import CollapsibleSection from '$lib/components/CollapsibleSection.svelte'
    import { formatDate, formatNumber } from "$lib/format";
    import { pressaction } from "$lib/pressaction.svelte";
    import type { ProductState } from "$lib/state.svelte";
    import ActionButton from '$lib/components/ActionButton.svelte';

    let { productState: productState }: { productState: ProductState } = $props();

    const productData = $derived(productState.grocyData);
    const stockLog = $derived(productData.stock_log);

    // Stands in for the table while it is collapsed. The log is fetched
    // newest first, so the latest transaction is the leading entry.
    const summary = $derived.by(() => {
        const latest = stockLog[0];
        if (latest === undefined) {
            return undefined;
        }
        return `${stockLog.length} ${
            stockLog.length === 1 ? "entry" : "entries"
        } · last: ${latest.transaction_type} ${
            formatNumber(
                latest.amount,
                productData.product_details.quantity_unit_stock.id,
            )
        }`;
    });

    function stockLogEntryPressed(stockLogEntryId: number) {
        if (productState.selectedStockLogEntryIndex === stockLogEntryId) {
            productState.selectedStockLogEntryIndex = undefined
        } else {
            productState.selectedStockLogEntryIndex = stockLogEntryId
        }
    }
</script>

{#snippet actions()}
    <ActionButton
        subtle
        disabled={productState.progress != 0}
        onclick={async () => productState.doUndo()}
        label="Undo"
        >
        <svg inline-src="undo-fa" height="0.75em" fill="currentColor" />
        Undo
    </ActionButton>
{/snippet}

{#if stockLog.length > 0}
    <CollapsibleSection
        title="Journal"
        {summary}
        bind:expanded={productState.journalExpanded}
        actions={
            productState.journalExpanded &&
            productState.selectedStockLogEntryIndex !== undefined
                ? actions
                : undefined
        }
        onclose={() => productState.selectedStockLogEntryIndex = undefined}
    >
        <div class="data-grid grid">
        <div class="indent align-start">Transaction</div>
        <div class="align-start">Amt</div>
        <div class="align-start">Time</div>
        {#each stockLog as entry, i (entry.id)}
            <div
                style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                class="stripe"
                class:odd={i % 2}
            ></div>
            <div
                style="grid-area: {i * 2 + 2} / 1"
                class="indent align-center nowrap"
            >
            {entry.transaction_type}
            </div>
            <div 
                style="grid-area: {i * 2 + 2} / 2"
                class="align-center nowrap"
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
                class="target"
                class:marked={productState.selectedStockLogEntryIndex === i}
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

<style>
    /* Type, Amt, Due, Time, then the user column taking the remainder. */
    .grid {
        grid-template-columns: max-content max-content max-content max-content 1fr;
    }

    /* The row marker means "selected, and the undo button acts on this". */
    .grid :global(.target) {
        color: var(--color-red-500);
    }
</style>
