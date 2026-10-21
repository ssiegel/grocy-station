<!--
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
A titled, collapsible block of the product view. The header is a quiet
container bar rather than a button, so a stack of sections reads as
structure rather than controls; only the title chunk toggles, leaving the
actions beside it operable without collapsing what they act on.
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        title: string;
        /** Stands in for the collapsed contents. Hidden while expanded. */
        summary?: string;
        expanded: boolean;
        /** Rendered at the trailing edge of the header, usually buttons. */
        actions?: Snippet;
        onclose?: () => void;
        children: Snippet;
    }

    let {
        title,
        summary,
        expanded = $bindable(),
        actions,
        onclose,
        children,
    }: Props = $props();

    function toggle() {
        if (expanded) {
            onclose?.();
        }
        expanded = !expanded;
    }
</script>

<div class="header">
    <button class="title" onclick={toggle} aria-expanded={expanded}>
        <svg
            inline-src="chevron"
            class="chevron"
            class:expanded
            height="0.75em"
        />
        <span class="label">{title}</span>
        {#if summary !== undefined && !expanded}
            <span class="summary">· {summary}</span>
        {/if}
    </button>
    {#if actions}
        <div class="actions">
            {@render actions()}
        </div>
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
        padding: 0.25rem 0.5rem;
        color: var(--color-container-fg);
        background-color: var(--color-container-bg-default);
    }

    .title {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        /* Takes the leftover width so that the actions sit at the trailing
         * edge and the summary has room to be truncated in. */
        flex: 1;
        align-items: center;
        min-width: 0;
        text-align: left;
    }

    .chevron {
        flex-shrink: 0;
        transition: transform 0.12s linear;
    }

    .chevron.expanded {
        transform: rotate(90deg);
    }

    .label {
        white-space: nowrap;
    }

    /* The summary yields first when the header runs out of width: the title
     * identifies the section, the summary merely previews it. */
    .summary {
        overflow: hidden;
        min-width: 0;
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
        color: var(--color-label-fg);
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .actions {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        flex-shrink: 0;
        align-items: center;
        /* Lets the buttons fill the bar height. */
        align-self: stretch;
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        .title:hover .label {
            color: var(--color-primary-lighter);
        }
    }
</style>
