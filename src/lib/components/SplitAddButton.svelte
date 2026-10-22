<!--
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Adds to one list in a single press, with the remaining lists a press
further away.

Nearly every scan goes to the same list, so that case is a direct hit; the
menu keeps the others reachable without spending header width on a button
per list.
-->

<script lang="ts">
    import ActionButton from "$lib/components/ActionButton.svelte";
    import type { GrocyShoppingList } from "$lib/types/grocy";

    interface Props {
        /** The list the main half adds to. */
        primary: GrocyShoppingList;
        /** Offered by the menu, in display order. */
        others: GrocyShoppingList[];
        disabled: boolean;
        /** What a list already wants, or undefined if it wants nothing. */
        formatAmount: (list: GrocyShoppingList) => string | undefined;
        onadd: (listId: number) => void;
    }

    let { primary, others, disabled, formatAmount, onadd }: Props = $props();

    let menuOpen = $state(false);

    function add(listId: number) {
        menuOpen = false;
        onadd(listId);
    }

    // The menu is not a modal: a press meant for something else should
    // dismiss it rather than being swallowed by a backdrop.
    function closeOnOutsidePress(event: PointerEvent) {
        if (
            menuOpen && event.target instanceof Node &&
            !container.contains(event.target)
        ) {
            menuOpen = false;
        }
    }

    let container: HTMLDivElement;
</script>

<svelte:window onpointerdown={closeOnOutsidePress} />

<div class="container" bind:this={container}>
    <div class="split" class:disabled>
        <ActionButton
            compact
            cell
            {disabled}
            onclick={() => add(primary.id)}
            label="Add to {primary.name}"
        >
            + {primary.name}
        </ActionButton>
        {#if others.length}
            <ActionButton
                compact
                cell
                {disabled}
                onclick={() => (menuOpen = !menuOpen)}
                label="Add to another list"
            >
                <svg
                    inline-src="chevron"
                    class="chevron"
                    class:open={menuOpen}
                    height="0.75em"
                />
            </ActionButton>
        {/if}
    </div>
    {#if menuOpen}
        <div class="menu">
            {#each others as list (list.id)}
                <button class="option" onclick={() => add(list.id)}>
                    <span class="option-name">{list.name}</span>
                    {#if formatAmount(list) !== undefined}
                        <span class="option-amount">
                            on · {formatAmount(list)}
                        </span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* Both this and the group below stretch, so the cells inherit a definite
     * height from the header row rather than sizing themselves from their
     * labels. Without it they would collapse to their content and the split
     * button would stand shorter than the buttons beside it. */
    .container {
        position: relative;
        display: flex;
        /* Both are needed: align-self takes the height offered by the
         * surrounding row, align-items passes it on to the group inside.
         * Either one alone leaves the cells sized to their labels. */
        align-self: stretch;
        align-items: stretch;
    }

    /* The two halves read as one control, so the group draws the outline
     * and the cells go without, exactly as in SegmentedControl. Stacking two
     * outlined buttons instead would double the border down the middle. */
    .split {
        display: inline-flex;
        flex-direction: row;
        align-items: stretch;
        overflow: hidden;
        border: 2px solid var(--color-primary-dark);
        border-radius: 0.25rem;
    }

    .split.disabled {
        border-color: var(--color-shade-default);
    }

    /* Cells share one outline, so they are divided by a hairline instead.
     * Drawn by the group: a cell cannot know whether it has a neighbour.
     *
     * The doubled class out-specifies the rule in ActionButton that strips a
     * cell's borders, which would otherwise take this one with it depending
     * on the order the two components' styles happen to be emitted in. */
    .split.split :global(button + button) {
        border-left: 1px solid var(--color-separator);
    }

    .chevron {
        transition: transform 0.12s linear;
    }

    .chevron.open {
        transform: rotate(90deg);
    }

    .menu {
        position: absolute;
        top: calc(100% + 0.25rem);
        right: 0;
        z-index: 20;
        display: flex;
        flex-direction: column;
        min-width: 15rem;
        padding: 0.25rem;
        border: 2px solid var(--color-primary-dark);
        border-radius: 0.25rem;
        /* Opaque: the rows behind it must not read through the menu. The
         * container tint is translucent, so it is laid over the base. */
        background-color: var(--color-base-bg);
        background-image: linear-gradient(
            var(--color-container-bg-default),
            var(--color-container-bg-default)
        );
        box-shadow: 0 0.5rem 1.5rem var(--color-darken);
    }

    .option {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        align-items: center;
        /* Comfortably hittable on the kiosk tablet. */
        min-height: 2.75rem;
        padding-inline: 0.5rem;
        border-radius: 0.25rem;
        color: var(--color-primary-lighter);
        font-size: var(--text-lg);
        line-height: var(--text-lg--line-height);
        text-align: left;
    }

    .option-name {
        flex: 1;
    }

    .option-amount {
        color: var(--color-label-fg);
        font-size: var(--text-sm);
        font-style: italic;
        white-space: nowrap;
    }

    .option:focus {
        background-color: var(--color-shade-default);
    }

    .option:active {
        background-color: var(--color-shade-high);
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        .option:hover {
            background-color: var(--color-shade-default);
        }
    }
</style>
