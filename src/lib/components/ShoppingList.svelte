<!--
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Which shopping lists the product is on, and how much of it each wants. Only
the lists holding the product get a row, so the common case of one list or
none does not fill the section with empty rows. A list holding the product
more than once gets a row per item, each a separate intention to buy.
-->

<script lang="ts">
    import { quantizeAmount } from "$lib/amount";
    import { formatNumber } from "$lib/format";
    import {
        DEFAULT_SHOPPING_LIST_ID,
        type ProductState,
    } from "$lib/state.svelte";
    import type { GrocyShoppingList } from "$lib/types/grocy";
    import ActionButton from "$lib/components/ActionButton.svelte";
    import CollapsibleSection from "$lib/components/CollapsibleSection.svelte";
    import SplitAddButton from "$lib/components/SplitAddButton.svelte";

    let { productState }: { productState: ProductState } = $props();

    const entries = $derived(productState.shoppingListItemEntries);
    const lists = $derived(productState.shoppingLists);
    const stockUnitId = $derived(
        productState.grocyData.product_details.quantity_unit_stock.id,
    );

    /** The lists holding the product at all, in the order they appear. */
    const listedIds = $derived(new Set(entries.map((entry) => entry.list.id)));

    // The list the single-press half of the add button targets. Grocy's
    // default, falling back to the first list on an instance that somehow
    // lacks it.
    const primary = $derived(
        lists.find((list) => list.id === DEFAULT_SHOPPING_LIST_ID) ?? lists[0],
    );
    const others = $derived(lists.filter((list) => list.id !== primary?.id));

    /** What the given list wants in total, for the add menu. */
    function formatListTotal(list: GrocyShoppingList): string | undefined {
        const items = entries.filter((entry) => entry.list.id === list.id);
        if (items.length === 0) {
            return undefined;
        }
        // Quantized: a sum of decimals drifts in binary floating point, and
        // three items of 0.1 should read as 0.3 rather than 0.30000000000000004.
        const total = quantizeAmount(
            items.reduce((sum, entry) => sum + entry.item.amount, 0),
        );
        const amount = formatNumber(total, stockUnitId);
        // The item count only earns its space when it is not 1, where the
        // amount already tells the whole story.
        return items.length === 1 ? amount : `${amount} in ${items.length}`;
    }

    // Stands in for the rows while collapsed. Naming one or two lists is
    // more use than counting them; beyond that the names stop fitting.
    const summary = $derived.by(() => {
        if (lists.length === 0) {
            return undefined;
        }
        if (listedIds.size === 0) {
            return `not on any of ${lists.length} lists`;
        }
        if (listedIds.size <= 2) {
            const names = lists
                .filter((list) => listedIds.has(list.id))
                .map((list) => list.name);
            return `on ${names.join(" + ")}`;
        }
        return `on ${listedIds.size} of ${lists.length} lists`;
    });
</script>

{#snippet actions()}
    {#if primary !== undefined}
        <SplitAddButton
            {primary}
            {others}
            disabled={!Number.isFinite(productState.consumeAmount) ||
                productState.consumeAmount <= 0 ||
                productState.progress != 0}
            formatAmount={formatListTotal}
            onadd={(listId) => productState.addToShoppingList(listId)}
        />
    {/if}
{/snippet}

<CollapsibleSection
    title="Shopping list"
    {summary}
    bind:expanded={productState.shoppingListExpanded}
    actions={productState.shoppingListExpanded ? actions : undefined}
>
    {#if entries.length}
        <div class="data-grid grid">
            <div class="indent align-end">Amt</div>
            <div>List</div>
            <div></div>
            {#each entries as entry, i (entry.item.id)}
                <div
                    style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 4"
                    class="stripe"
                    class:odd={i % 2}
                ></div>
                <div
                    style="grid-area: {i * 2 + 2} / 1"
                    class="indent align-end nowrap"
                    class:done={entry.item.done}
                >
                    {formatNumber(entry.item.amount, stockUnitId)}
                </div>
                <div
                    style="grid-area: {i * 2 + 2} / 2"
                    class="name"
                    class:done={entry.item.done}
                >
                    {entry.list.name}
                </div>
                <div style="grid-area: {i * 2 + 2} / 3" class="remove">
                    <ActionButton
                        danger
                        disabled={productState.progress != 0}
                        onclick={() =>
                            productState.removeShoppingListItem(entry.item.id)}
                        label="Remove from {entry.list.name}"
                    >
                        − Remove
                    </ActionButton>
                </div>
                {#if entry.item.note}
                    <div
                        style="grid-area: {i * 2 + 3} / 1 / {i * 2 + 4} / 4"
                        class="note"
                    >
                        {entry.item.note}
                    </div>
                {/if}
            {/each}
        </div>
    {:else}
        <div class="section-empty">Not on any list</div>
    {/if}
</CollapsibleSection>

<style>
    /* Amt, then the list name taking the remainder, then the remove button.
     * Centred, since a row's height is set by that button rather than by
     * the text beside it. */
    .grid {
        grid-template-columns: max-content 1fr max-content;
        align-items: center;
    }

    .name {
        color: var(--color-primary-default);
    }

    /* Already bought, but still on the list. Struck through rather than
     * hidden: the row is why the list's total counts an amount that appears
     * to be spent already. */
    .done {
        color: var(--color-label-fg);
        text-decoration: line-through;
        opacity: 0.6;
    }

    /* Positioned, which is what lifts the button clear of the striping
     * drawn across the row: a positioned element paints above every static
     * sibling, so no z-index is needed to get above a static backdrop. */
    .remove {
        position: relative;
        display: flex;
        /* Gives the button a definite height to stretch into, so it matches
         * the one in the header rather than shrinking to fit its label. */
        align-items: stretch;
        height: 1.75rem;
        padding: 0.125rem 0.25rem;
        justify-self: end;
    }
</style>
