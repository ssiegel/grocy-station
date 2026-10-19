<!--
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    type ButtonInput = {
        children: Snippet;
        onclick: () => void;
        hidden?: boolean;
    };

    type ActionButtonInput = ButtonInput & {
        disabled: boolean;
        label: string;
    };

    type SelectButtonInput = ButtonInput & {
        selected: boolean;
    };

    type Props = ActionButtonInput | SelectButtonInput;

    let props: Props = $props();

    const selected = $derived("selected" in props ? props.selected : undefined);
    const isActionButton = $derived(
        "disabled" in props || ("label" in props && selected === undefined),
    );
</script>

<button
    class:action={isActionButton}
    class:select={!isActionButton}
    class:selected={!isActionButton && selected}
    disabled={"disabled" in props ? props.disabled : undefined}
    aria-label={"label" in props ? props.label : undefined}
    hidden={props.hidden ?? false}
    onclick={props.onclick}
>
    {@render props.children()}
</button>

<style>
    button {
        border-radius: 0.25rem;
    }

    /* Action buttons carry the icon actions; they fill their wrapper. */
    .action {
        height: 100%;
        padding: 1rem;
        color: var(--color-btn-fg);
        background-color: var(--color-btn-bg-default);
    }

    .action:disabled {
        color: var(--color-btn-bg-focus);
    }

    .action:focus {
        background-color: var(--color-btn-bg-focus);
    }

    .action:active {
        background-color: var(--color-btn-bg-active);
    }

    /* Select buttons toggle between the input and the button palette. */
    .select {
        padding: 0.25rem 0.5rem;
        border: 2px solid var(--color-btn-bg-default);
        color: var(--color-input-fg);
        background-color: var(--color-input-bg-default);
    }

    .select:focus {
        border-color: var(--color-btn-bg-focus);
        background-color: var(--color-input-bg-focus);
    }

    .select:active {
        border-color: var(--color-btn-bg-active);
        background-color: var(--color-input-bg-active);
    }

    .select.selected {
        color: var(--color-btn-fg);
        background-color: var(--color-btn-bg-default);
    }

    .select.selected:focus {
        background-color: var(--color-btn-bg-focus);
    }

    .select.selected:active {
        background-color: var(--color-btn-bg-active);
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        .action:hover {
            background-color: var(--color-btn-bg-hover);
        }

        .select:hover {
            border-color: var(--color-btn-bg-hover);
            background-color: var(--color-input-bg-hover);
        }

        .select.selected:hover {
            background-color: var(--color-btn-bg-hover);
        }
    }
</style>
