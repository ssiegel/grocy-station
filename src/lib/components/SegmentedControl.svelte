<!--
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Single-select group of mutually exclusive options, drawn with one shared
outline. Options are addressed by index rather than value, since the
caller's values need not be distinct.
-->

<script lang="ts">
    interface Props {
        /** Cell labels. The second line, where given, is rendered smaller. */
        options: { label: string; sublabel?: string }[];
        /** Index of the selected option, or -1 when the value is not one of them. */
        selectedIndex: number;
        /** Index of the option marked as the default, if any. */
        defaultIndex?: number;
        onselect: (index: number) => void;
    }

    let { options, selectedIndex, defaultIndex, onselect }: Props = $props();
</script>

<div class="group" role="radiogroup">
    {#each options as option, i (i)}
        <button
            class="cell"
            class:selected={i === selectedIndex}
            role="radio"
            aria-checked={i === selectedIndex}
            onclick={() => onselect(i)}
        >
            {option.label}
            {#if option.sublabel !== undefined}
                <br />
                <span class="sublabel">{option.sublabel}</span>
            {/if}
            {#if i === defaultIndex}
                <span class="marker" aria-label="default"></span>
            {/if}
        </button>
    {/each}
</div>

<style>
    .group {
        display: inline-flex;
        flex-direction: row;
        align-self: flex-start;
        overflow: hidden;
        border: 2px solid var(--color-primary-default);
        border-radius: 0.25rem;
    }

    .cell {
        position: relative;
        padding: 0.25rem 1rem;
        color: var(--color-primary-lighter);
        text-align: center;
        background-color: transparent;
        /* Without this the cell background would paint over the shared
         * outline of the group. */
        background-clip: padding-box;
    }

    /* Cells share one outline, so they are divided by a hairline instead. */
    .cell + .cell {
        border-left: 1px solid var(--color-separator);
    }

    .cell.selected {
        color: var(--color-btn-fg);
        background-color: var(--color-btn-bg-default);
    }

    .cell:focus {
        background-color: var(--color-shade-default);
    }

    .cell.selected:focus {
        background-color: var(--color-btn-bg-focus);
    }

    .cell:active {
        background-color: var(--color-shade-high);
    }

    .cell.selected:active {
        background-color: var(--color-btn-bg-active);
    }

    .sublabel {
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
    }

    /* Marks the default option, so that a non-default selection is
     * recognisable as a departure from it. */
    .marker {
        position: absolute;
        top: 0.25rem;
        right: 0.25rem;
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 50%;
        background-color: var(--color-primary-dark);
        pointer-events: none;
    }

    .cell.selected .marker {
        background-color: var(--color-marker-on-selected);
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        .cell:hover {
            background-color: var(--color-shade-default);
        }

        .cell.selected:hover {
            background-color: var(--color-btn-bg-hover);
        }
    }
</style>
