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
        const total = items.reduce((sum, entry) => sum + entry.item.amount, 0);
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
        <div class="grid">
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
        <div class="empty">Not on any list</div>
    {/if}
</CollapsibleSection>

<style>
    .grid {
        display: grid;
        grid-template-columns: max-content 1fr max-content;
        column-gap: 0.5rem;
        align-items: center;
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

    .name {
        color: var(--color-primary-default);
    }

    /* Distinguishes two items on the same list, which are otherwise
     * identical rows. */
    .note {
        padding-inline: 1rem;
        font-style: italic;
    }

    /* Already bought, but still on the list. Struck through rather than
     * hidden: the row is why the list's total counts an amount that appears
     * to be spent already. */
    .done {
        color: var(--color-label-fg);
        text-decoration: line-through;
        opacity: 0.6;
    }

    /* Raised above the striping, which is drawn as a row-spanning backdrop. */
    .remove {
        position: relative;
        z-index: 10;
        padding: 0.125rem 0.25rem;
        justify-self: end;
    }

    .empty {
        padding: 0.25rem 0.5rem;
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
</style>
