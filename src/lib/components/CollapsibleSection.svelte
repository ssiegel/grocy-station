<!--
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import type { Snippet } from "svelte";
    import ActionButton from "$lib/components/ActionButton.svelte";

    interface Props {
        header: string;
        onclose: () => void;
        children: Snippet;
        buttons?: Snippet[];
    }
    let {header, onclose, children, buttons}: Props  = $props();
    let expanded = $state(false)

    function onClick() {
        // on close
        if (expanded) {
            onclose()
        }
        expanded = !expanded
    }
</script>

<div class="header">
    <div class="stretch">
        <ActionButton
            onclick={onClick}
            selected={expanded}
            >
            {header}
        </ActionButton>
    </div>
    {#if buttons}
        {#each buttons as button}
            {@render button()}
        {/each}
    {/if}
</div>
<div hidden={!expanded}>
        {@render children()}
</div>

<style>
    .header {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        align-items: center;
        justify-content: flex-start;
    }

    /* Wrapper: scoped styles cannot reach the button inside ActionButton. */
    .stretch {
        align-self: stretch;
    }
</style>
