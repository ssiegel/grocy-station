<!--
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
A one-shot operation. Reads as "operate this": an outline over the body,
quiet enough that a screenful of them does not shout.
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children: Snippet;
        onclick: () => void;
        /** Names the action, which is otherwise carried only by an icon. */
        label: string;
        disabled?: boolean;
        hidden?: boolean;
        /**
         * Quieter, smaller variant for an action that corrects or annotates
         * rather than advances: it should not read as a peer of the actions
         * that commit something.
         */
        subtle?: boolean;
        /**
         * Destructive variant. Tinted, and `subtle` besides, so that it
         * cannot be hit by muscle memory aimed at the action beside it.
         */
        danger?: boolean;
        /**
         * Drops the button's own outline and corners, for use as one cell of
         * a group that draws a single outline around the whole of itself.
         */
        cell?: boolean;
    }

    let {
        children,
        onclick,
        label,
        disabled = false,
        hidden = false,
        subtle = false,
        danger = false,
        cell = false,
    }: Props = $props();
</script>

<button
    class:subtle={subtle || danger}
    class:danger
    class:cell
    {disabled}
    {hidden}
    {onclick}
    aria-label={label}
>
    {@render children()}
</button>

<style>
    button {
        display: inline-flex;
        gap: 0.5rem;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 0.75rem 1rem;
        border: 2px solid var(--color-primary-dark);
        border-radius: 0.25rem;
        color: var(--color-primary-lighter);
        background-color: transparent;
    }

    button:disabled {
        border-color: var(--color-shade-default);
        color: var(--color-shade-high);
    }

    button:focus {
        background-color: var(--color-shade-default);
    }

    button:active {
        background-color: var(--color-shade-high);
    }

    .subtle {
        height: auto;
        padding: 0.25rem 0.75rem;
        border-width: 1px;
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
    }

    .danger {
        color: var(--color-red-400);
    }

    .danger:disabled {
        color: var(--color-shade-high);
    }

    /* The enclosing group owns the outline and the corners. The hairline
     * dividing the cells is the group's business too, since only it knows
     * which cells have a neighbour, so this must not out-specify it. */
    .cell {
        border: none;
        border-radius: 0;
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        button:not(:disabled):hover {
            background-color: var(--color-shade-default);
        }
    }
</style>
