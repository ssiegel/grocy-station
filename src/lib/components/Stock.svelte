<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import { pressaction } from "$lib/pressaction.svelte";
    import { formatNumber, formatDate } from "$lib/format";
    import { GrocyObjectCache, type GrocyStockEntry } from "$lib/grocy";
    import { ProductState } from "$lib/state.svelte";

    let { productState: productState }: { productState: ProductState } = $props();
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
    <div class="bg-container-bg-default text-container-fg px-2 py-1">
        {#if productDetails?.stock_amount}
            Stock amount: {formatNumber(
                productDetails.stock_amount,
                productDetails.quantity_unit_stock.id,
            )}
            {#if productDetails.stock_amount_opened}({formatNumber(
                    productDetails.stock_amount_opened,
                )} opened)
            {/if}
        {:else if productData.stock?.length}
            Stock
        {:else}
            Not in stock
        {/if}
    </div>
    {#if productData.stock?.length}
        <div
            class="text-label-fg px-0 grid grid-cols-[max-content_max-content_max-content_max-content_1fr] gap-x-2 text-lg"
        >
            <div class="pl-2 justify-self-end">Qty</div>
            <div class="justify-self-end">Amt</div>
            <div>
                {productDetails?.product.due_type === 2 ? "Exp" : "Due"}
            </div>
            <div>Location</div>
            <div>Purchased</div>
            {#each productData.stock as entry, i (entry.id)}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                    class="opacity-20 {i % 2 ? 'bg-darken' : 'bg-shade-low'}"
                ></div>
                <div
                    style="grid-area: {i * 2 + 2} / 1"
                    class="pl-2 justify-self-end whitespace-nowrap"
                >
                    {#if entry.open === 1}
                        <svg
                            inline-src="open"
                            class="inline pb-1"
                            height="1em"
                            fill="currentColor"
                        />
                    {/if}
                    {formatNumber(entry.amount / productState.unitSize())}
                </div>
                <div
                    style="grid-area: {i * 2 + 2} / 2"
                    class="justify-self-end whitespace-nowrap"
                >
                    {formatNumber(entry.amount, productDetails?.quantity_unit_stock.id)}
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
                        class="col-start-2 col-span-3 px-4 italic"
                    >
                        {entry.note}
                    </div>
                {/if}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
                    class="hover:bg-shade-default z-10 border-yellow-500 border-l-4 border-{
                        productState.consumeValid && entry.amount_allotted > 0
                            ? entry.amount_allotted < entry.amount
                                ? 'dotted' 
                                : 'solid'
                            : 'none'
                    }"
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
