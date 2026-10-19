<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import { pressaction } from "$lib/pressaction.svelte";
    import { formatNumber, formatDate } from "$lib/format";
    import { GrocyObjectCache } from "$lib/grocy";
    import type { GrocyStockEntry } from "$lib/types/grocy";
    import { ProductState } from "$lib/state.svelte";

    let { productState }: { productState: ProductState } = $props();
    const productData = $derived(productState.grocyData);
    const productDetails = $derived(productData.product_details);

    function stockEntryPressed(entryIndex: number) {
        productState.selectedStockEntryIndex = entryIndex;
        productState.reAllot();
    }

    function stockEntryLongPressed(entry: GrocyStockEntry) {
        productState.inputQuantity = (entry.amount / productState.unitSize()).toString();
    }
</script>

{#if productData.stock !== undefined || productDetails !== undefined}
    <div class="header">
        {#if productDetails.stock_amount}
            Stock amount: {formatNumber(
                productDetails.stock_amount,
                productDetails.quantity_unit_stock.id,
            )}
            {#if productDetails.stock_amount_opened}({formatNumber(
                    productDetails.stock_amount_opened,
                )} opened)
            {/if}
        {:else if productData.stock.length}
            Stock
        {:else}
            Not in stock
        {/if}
    </div>
    {#if productData.stock.length}
        <div class="grid">
            <div class="indent align-end">Qty</div>
            <div class="align-end">Amt</div>
            <div>
                {productDetails.product.due_type === 2 ? "Exp" : "Due"}
            </div>
            <div>Location</div>
            <div>Purchased</div>
            {#each productData.stock as entry, i (entry.id)}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                    class="stripe"
                    class:odd={i % 2}
                ></div>
                <div
                    style="grid-area: {i * 2 + 2} / 1"
                    class="indent align-end nowrap"
                >
                    {#if entry.open === 1}
                        <svg
                            inline-src="open"
                            class="open-icon"
                            height="1em"
                            fill="currentColor"
                        />
                    {/if}
                    {formatNumber(entry.amount / productState.unitSize())}
                </div>
                <div
                    style="grid-area: {i * 2 + 2} / 2"
                    class="align-end nowrap"
                >
                    {formatNumber(entry.amount, productDetails.quantity_unit_stock.id)}
                </div>
                <div style="grid-area: {i * 2 + 2} / 3">
                    {formatDate(entry.best_before_date)}
                </div>
                <div style="grid-area: {i * 2 + 2} / 4">
                    {GrocyObjectCache.getCachedObject("locations", entry.location_id)?.name ??
                        `Location #${entry.location_id}`}
                </div>
                <div style="grid-area: {i * 2 + 2} / 5">
                    {formatDate(entry.purchased_date)}
                </div>
                {#if entry.note}
                    <div
                        style="grid-area: {i * 2 + 3} / 3 / {i * 2 + 4} / 6"
                        class="note"
                    >
                        {entry.note}
                    </div>
                {/if}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                    class="target"
                    data-allot={
                        productState.consumeValid && entry.amount_allotted > 0
                            ? entry.amount_allotted < entry.amount
                                ? 'partial'
                                : 'full'
                            : 'none'
                    }
                    use:pressaction
                    onlongpress={() => {stockEntryPressed(i); stockEntryLongPressed(entry)}}
                    onshortpress={() => stockEntryPressed(i)}
                    role="button"
                    tabindex="0"
                ></div>
            {/each}
        </div>
    {/if}
{/if}

<style>
    .header {
        padding: 0.25rem 0.5rem;
        color: var(--color-container-fg);
        background-color: var(--color-container-bg-default);
    }

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

    .align-end {
        justify-self: end;
    }

    .nowrap {
        white-space: nowrap;
    }

    .open-icon {
        display: inline;
        padding-bottom: 0.25rem;
    }

    .note {
        grid-column: 2 / span 3;
        padding-inline: 1rem;
        font-style: italic;
    }

    /* Zebra striping, drawn as a backdrop spanning the full row. */
    .stripe {
        background-color: var(--color-shade-low);
        opacity: 0.2;
    }

    .stripe.odd {
        background-color: var(--color-darken);
    }

    /* Press target overlaying the row; the left border marks allotment. */
    .target {
        z-index: 10;
        border-left: 4px none var(--color-yellow-500);
    }

    .target[data-allot="full"] {
        border-left-style: solid;
    }

    .target[data-allot="partial"] {
        border-left-style: dotted;
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        .target:hover {
            background-color: var(--color-shade-default);
        }
    }
</style>
