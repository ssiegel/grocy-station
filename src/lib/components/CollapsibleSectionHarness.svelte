<!--
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<!--
Test wrapper for CollapsibleSection: its snippet props and bindable state
cannot be supplied from a test directly.
-->

<script lang="ts">
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';

	interface Props {
		expanded?: boolean;
		summary?: string;
		onclose?: () => void;
		/** Given a handler, the header renders an action calling it. */
		onaction?: () => void;
	}

	let { expanded = $bindable(true), summary, onclose, onaction }: Props = $props();
</script>

{#snippet actions()}
	<button onclick={onaction}>Consume</button>
{/snippet}

<CollapsibleSection
	title="Stock"
	{summary}
	bind:expanded
	actions={onaction ? actions : undefined}
	{onclose}
>
	<div data-testid="body">2 entries</div>
</CollapsibleSection>
