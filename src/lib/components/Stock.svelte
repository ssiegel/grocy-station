<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
	import { pressaction } from '$lib/pressaction.svelte';
	import { formatFactor, quantizeAmount } from '$lib/amount';
	import { formatNumber, formatDate } from '$lib/format';
	import { GrocyObjectCache } from '$lib/grocy';
	import type { GrocyStockEntry } from '$lib/types/grocy';
	import { ProductState } from '$lib/state.svelte';
	import ActionButton from '$lib/components/ActionButton.svelte';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';

	let { productState }: { productState: ProductState } = $props();
	const productData = $derived(productState.grocyData);
	const productDetails = $derived(productData.product_details);

	const stockUnitId = $derived(productDetails.quantity_unit_stock.id);

	// Stands in for the table while it is collapsed, so the amount in stock
	// stays visible without it.
	const summary = $derived.by(() => {
		if (!productDetails.stock_amount) {
			// Entries without a stock amount leave nothing worth previewing,
			// so the header shows the title alone.
			return productData.stock.length ? undefined : 'Not in stock';
		}
		const parts = [
			formatNumber(productDetails.stock_amount, stockUnitId),
			`${productData.stock.length} ${productData.stock.length === 1 ? 'entry' : 'entries'}`
		];
		if (productDetails.stock_amount_opened) {
			parts.push(`${formatNumber(productDetails.stock_amount_opened)} opened`);
		}
		return parts.join(' · ');
	});

	function stockEntryPressed(entryIndex: number) {
		productState.selectedStockEntryIndex = entryIndex;
		productState.reAllot();
	}

	function stockEntryLongPressed(entry: GrocyStockEntry) {
		// The quantity that consumes this entry exactly, as a factor rather
		// than a quantized amount: rounding it would overshoot the entry
		// it was derived from.
		productState.inputQuantity = formatFactor(entry.amount / productState.unitSize());
	}
</script>

{#snippet actions()}
	<!-- Spoiled leads, so that Consume keeps the trailing edge it has always
	     had: it is the action reached for most often, and a moving target is
	     the one thing worse than a small one. -->
	<ActionButton
		danger
		compact
		disabled={!productState.consumeValid || productState.progress != 0}
		onclick={async () => productState.doConsume(false, true)}
		label="Consume as spoiled"
	>
		<svg inline-src="spoiled-fa" height="1em" fill="currentColor" />
		Spoiled
	</ActionButton>
	<ActionButton
		compact
		disabled={!productState.consumeValid || productState.progress != 0}
		onclick={async () => productState.doConsume(true)}
		label="Open"
	>
		<svg inline-src="open" height="1em" fill="currentColor" />
		Open
	</ActionButton>
	<ActionButton
		compact
		disabled={!productState.consumeValid || productState.progress != 0}
		onclick={async () => productState.doConsume(false)}
		label="Consume"
	>
		<svg inline-src="consume" height="1em" fill="currentColor" />
		Consume
	</ActionButton>
{/snippet}

{#if productData.stock !== undefined || productDetails !== undefined}
	<CollapsibleSection
		title="Stock"
		{summary}
		bind:expanded={productState.stockExpanded}
		actions={productState.stockExpanded ? actions : undefined}
	>
		{#if productData.stock.length}
			<div class="data-grid grid">
				<div class="indent align-end">Qty</div>
				<div class="align-end">Amt</div>
				<div>
					{productDetails.product.due_type === 2 ? 'Exp' : 'Due'}
				</div>
				<div>Location</div>
				<div>Purchased</div>
				{#each productData.stock as entry, i (entry.id)}
					<div
						style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
						class="stripe"
						class:odd={i % 2}
					></div>
					<div style="grid-area: {i * 2 + 2} / 1" class="indent align-end nowrap">
						{#if entry.open === 1}
							<svg inline-src="open" class="open-icon" height="1em" fill="currentColor" />
						{/if}
						{formatNumber(quantizeAmount(entry.amount / productState.unitSize()))}
					</div>
					<div style="grid-area: {i * 2 + 2} / 2" class="align-end nowrap">
						{formatNumber(entry.amount, productDetails.quantity_unit_stock.id)}
					</div>
					<div style="grid-area: {i * 2 + 2} / 3">
						{formatDate(entry.best_before_date)}
					</div>
					<div style="grid-area: {i * 2 + 2} / 4">
						{GrocyObjectCache.getCachedObject('locations', entry.location_id)?.name ??
							`Location #${entry.location_id}`}
					</div>
					<div style="grid-area: {i * 2 + 2} / 5">
						{formatDate(entry.purchased_date)}
					</div>
					{#if entry.note}
						<div style="grid-area: {i * 2 + 3} / 3 / {i * 2 + 4} / 6" class="note">
							{entry.note}
						</div>
					{/if}
					<div
						style="grid-area: {i * 2 + 2} / 1 / {i * 2 + 4} / 6"
						class="target"
						class:marked={productState.consumeValid &&
							entry.amount_allotted > 0 &&
							entry.amount_allotted >= entry.amount}
						class:marked-partial={productState.consumeValid &&
							entry.amount_allotted > 0 &&
							entry.amount_allotted < entry.amount}
						use:pressaction
						onlongpress={() => {
							stockEntryPressed(i);
							stockEntryLongPressed(entry);
						}}
						onshortpress={() => stockEntryPressed(i)}
						role="button"
						tabindex="0"
					></div>
				{/each}
			</div>
		{:else}
			<div class="section-empty">Not in stock</div>
		{/if}
	</CollapsibleSection>
{/if}

<style>
	/* Qty, Amt, Due, Location, then the note column taking the remainder. */
	.grid {
		grid-template-columns: max-content max-content max-content max-content 1fr;
	}

	.open-icon {
		display: inline;
		padding-bottom: 0.25rem;
	}

	/* The row marker means "allotted for the pending consumption", solid
     * when the entry is taken whole and dotted when only partly. */
	.grid :global(.target) {
		color: var(--color-yellow-500);
	}
</style>
