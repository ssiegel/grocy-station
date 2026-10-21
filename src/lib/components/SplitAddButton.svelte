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
    import type { GrocyShoppingListEntry } from "$lib/types/grocy";

    interface Props {
        /** The list the main half adds to. */
        primary: GrocyShoppingListEntry;
        /** Offered by the menu, in display order. */
        others: GrocyShoppingListEntry[];
        disabled: boolean;
        /** Renders an entry's current amount for the menu. */
        formatAmount: (entry: GrocyShoppingListEntry) => string | undefined;
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
    <div class="split">
        <ActionButton
            subtle
            {disabled}
            onclick={() => add(primary.list.id)}
            label="Add to {primary.list.name}"
        >
            + {primary.list.name}
        </ActionButton>
        {#if others.length}
            <ActionButton
                subtle
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
            {#each others as entry (entry.list.id)}
                <button class="option" onclick={() => add(entry.list.id)}>
                    <span class="option-name">{entry.list.name}</span>
                    {#if formatAmount(entry) !== undefined}
                        <span class="option-amount">
                            on · {formatAmount(entry)}
                        </span>
                    {/if}
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .container {
        position: relative;
        display: flex;
    }

    /* The two halves read as one control, so they share an outline: each
     * button's own is collapsed into the gap between them. */
    .split {
        display: flex;
        flex-direction: row;
        gap: 1px;
        background-color: var(--color-separator);
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
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
        text-align: left;
    }

    .option-name {
        flex: 1;
    }

    .option-amount {
        color: var(--color-label-fg);
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
