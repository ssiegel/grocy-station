<!--
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Which shopping lists the product is on, and how much of it each wants. Only
the lists holding the product get a row, so the common case of one list or
none does not fill the section with empty rows.
-->

<script lang="ts">
    import { formatNumber } from "$lib/format";
    import {
        DEFAULT_SHOPPING_LIST_ID,
        type ProductState,
    } from "$lib/state.svelte";
    import type { GrocyShoppingListEntry } from "$lib/types/grocy";
    import ActionButton from "$lib/components/ActionButton.svelte";
    import CollapsibleSection from "$lib/components/CollapsibleSection.svelte";
    import SplitAddButton from "$lib/components/SplitAddButton.svelte";

    let { productState }: { productState: ProductState } = $props();

    const entries = $derived(productState.shoppingListEntries);
    const listed = $derived(entries.filter((entry) => entry.item !== undefined));
    const stockUnitId = $derived(
        productState.grocyData.product_details.quantity_unit_stock.id,
    );

    // The list the single-press half of the add button targets. Grocy's
    // default, falling back to the first list on an instance that somehow
    // lacks it.
    const primary = $derived(
        entries.find((entry) => entry.list.id === DEFAULT_SHOPPING_LIST_ID) ??
            entries[0],
    );
    const others = $derived(
        entries.filter((entry) => entry.list.id !== primary?.list.id),
    );

    function formatAmount(entry: GrocyShoppingListEntry): string | undefined {
        return entry.item === undefined
            ? undefined
            : formatNumber(entry.item.amount, stockUnitId);
    }

    // Stands in for the rows while collapsed. Naming one or two lists is
    // more use than counting them; beyond that the names stop fitting.
    const summary = $derived.by(() => {
        if (entries.length === 0) {
            return undefined;
        }
        if (listed.length === 0) {
            return `not on any of ${entries.length} lists`;
        }
        if (listed.length <= 2) {
            return `on ${listed.map((entry) => entry.list.name).join(" + ")}`;
        }
        return `on ${listed.length} of ${entries.length} lists`;
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
            {formatAmount}
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
    {#if listed.length}
        <div class="grid">
            <div class="indent align-end">Amt</div>
            <div>List</div>
            <div></div>
            {#each listed as entry, i (entry.list.id)}
                <div
                    style="grid-area: {i + 2} / 1 / {i + 3} / 4"
                    class="stripe"
                    class:odd={i % 2}
                ></div>
                <div
                    style="grid-area: {i + 2} / 1"
                    class="indent align-end nowrap"
                    class:done={entry.item?.done}
                >
                    {formatAmount(entry)}
                </div>
                <div
                    style="grid-area: {i + 2} / 2"
                    class="name"
                    class:done={entry.item?.done}
                >
                    {entry.list.name}
                </div>
                <div style="grid-area: {i + 2} / 3" class="remove">
                    <ActionButton
                        danger
                        disabled={productState.progress != 0}
                        onclick={() =>
                            productState.removeFromShoppingList(entry.list.id)}
                        label="Remove from {entry.list.name}"
                    >
                        − Remove
                    </ActionButton>
                </div>
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

    /* Already bought, but still on the list. Struck through rather than
     * hidden: the row is why adding to this list raises an amount that
     * appears to be spent already. */
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
