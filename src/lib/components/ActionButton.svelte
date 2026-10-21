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
    }

    let {
        children,
        onclick,
        label,
        disabled = false,
        hidden = false,
    }: Props = $props();
</script>

<button
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

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        button:not(:disabled):hover {
            background-color: var(--color-shade-default);
        }
    }
</style>
