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

    let journalExpanded = $state(false);

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
        hidden={productState.selectedStockLogEntryIndex === undefined}
        disabled={productState.progress != 0}
        onclick={async () => productState.doUndo()}
        label="Undo"
        >
        <svg inline-src="undo-fa" height=".5em" fill="currentColor" />
    </ActionButton>
{/snippet}

{#if stockLog.length > 0}
    <CollapsibleSection
        title="Journal"
        bind:expanded={journalExpanded}
        {actions}
        onclose={() => productState.selectedStockLogEntryIndex = undefined}
    >
        <div class="grid">
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
                data-selected={productState.selectedStockLogEntryIndex === i}
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
    .grid {
        display: grid;
        grid-template-columns: max-content max-content max-content max-content 1fr;
        column-gap: 0.5rem;
        font-size: var(--text-lg);
        line-height: var(--text-lg--line-height);
        color: var(--color-label-fg);
    }

    .indent {
        padding-left: 0.5rem;
    }

    .align-start {
        justify-self: start;
    }

    .align-center {
        justify-self: center;
    }

    .nowrap {
        white-space: nowrap;
    }

    /* Zebra striping, drawn as a backdrop spanning the full row.
     * Note the phase is inverted relative to the stock table. */
    .stripe {
        background-color: var(--color-darken);
        opacity: 0.2;
    }

    .stripe.odd {
        background-color: var(--color-shade-low);
    }

    /* Press target overlaying the row; the left border marks the selection. */
    .target {
        z-index: 10;
        border-left: 4px none var(--color-red-500);
    }

    .target[data-selected="true"] {
        border-left-style: solid;
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        .target:hover {
            background-color: var(--color-shade-default);
        }
    }
</style>
