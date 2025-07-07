<script lang="ts">
    import { pressaction } from "$lib/pressaction.svelte";
    import { formatNumber, formatDate } from "$lib/format";
    import { GrocyObjectCache } from "$lib/page/grocy.svelte";
    import type { GrocyData, GrocyStockEntry } from "$lib/page/grocy.svelte";

    let { product }: { product: GrocyData } = $props();

    function stockEntryPressed(entry: GrocyStockEntry) {}
</script>

{#if product.stock !== undefined || product.product_details !== undefined}
    <div class="bg-container-bg-default text-container-fg px-2 py-1">
        {#if product.product_details?.stock_amount}
            Stock amount: {formatNumber(
                product.product_details.stock_amount,
                product.product_details.quantity_unit_stock.id,
            )}
            {#if product.product_details.stock_amount_opened}({formatNumber(
                    product.product_details.stock_amount_opened,
                )} opened){/if}
        {:else if product.stock?.length}
            Stock
        {:else}
            Not in stock
        {/if}
    </div>
    {#if product.stock?.length}
        <div
            class="text-label-fg px-0 grid grid-cols-[max-content_max-content_max-content_1fr] gap-x-2 text-lg"
        >
            <div class="pl-2">Qty</div>
            <div>
                {product.product_details?.product.due_type === 2 ? "Exp" : "Due"}
            </div>
            <div>Location</div>
            <div>Purchased</div>
            {#each product.stock as entry, i (entry.id)}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 5"
                    class="opacity-20 {i % 2 ? 'bg-darken' : 'bg-shade-low'}"
                ></div>
                <div
                    style="grid-area: {i * 2 + 2} / 1"
                    class="pl-2 justify-self-end whitespace-nowrap"
                >
                    {#if entry.open === 1}<svg
                            inline-src="open"
                            class="inline pb-1"
                            height="1em"
                            fill="currentColor"
                        />{/if}
                    {formatNumber(entry.amount)}
                </div>
                <div style="grid-area: {i * 2 + 2} / 2">
                    {formatDate(entry.best_before_date)}
                </div>
                <div style="grid-area: {i * 2 + 2} / 3">
                    {GrocyObjectCache.getCachedObject("locations", entry.location_id)?.name ??
                        `Location #${entry.location_id}`}
                </div>
                <div style="grid-area: {i * 2 + 2} / 4">
                    {formatDate(entry.purchased_date)}
                </div>
                {#if entry.note}
                    <div
                        style="grid-area: {i * 2 + 3} / 2 / {i * 2 + 4} / 5"
                        class="col-start-2 col-span-3 px-4 italic"
                    >
                        {entry.note}
                    </div>
                {/if}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 5"
                    class="hover:bg-shade-default z-10 border-yellow-500 border-l-4 border-{entry.amount_allotted >
                    0
                        ? entry.amount_allotted < entry.amount
                            ? 'dotted'
                            : 'solid'
                        : 'none'}"
                    use:pressaction
                    onlongpress={() => stockEntryPressed(entry)}
                    onshortpress={() => stockEntryPressed(entry)}
                    role="button"
                    tabindex="0"
                ></div>
            {/each}
        </div>
    {/if}
{/if}
