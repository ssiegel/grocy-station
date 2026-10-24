<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { setupMqtt, disconnectMqtt } from '$lib/mqtt';
	import { setupDbEvents, disconnectDbEvents } from '$lib/db-events';
	import { screenOn, onScreenOff } from '$lib/screen';
	import { GrocyObjectCache } from '$lib/grocy';
	import { ErrorState, MessageState, ProductState, Page } from '$lib/state.svelte';
	import ProductStock from '$lib/components/ProductStock.svelte';
	import Clock from '$lib/components/Clock.svelte';
	import { startAutoReload, stopAutoReload } from '$lib/auto-reload';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).reEnableScreen = () => {
		screenOn(3000);
	};

	const page = new Page();
	const pageState = $derived(page.state);

	const unsubscribeScreenOff = onScreenOff(() => page.toWaitingState());

	//$inspect(pageState.progress).with(console.trace)

	$effect(() => {
		if (pageState instanceof ProductState) {
			void pageState.consumeAmount;
			untrack(() => pageState.reAllot());
		}
	});

	// Clear the bar shortly after completion. The cleanup is required: a
	// reset left pending would fire into the next refresh and blank the bar
	// mid-flight.
	$effect(() => {
		if (pageState.progress === 100) {
			const reset = setTimeout(() => (pageState.progress = 0), 300);
			return () => clearTimeout(reset);
		}
	});

	onMount(() => {
		// @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
		window.fully?.bind('screenOff', 'globalThis.reEnableScreen();');
		screenOn(5_000);

		pageState.progress = 1;
		GrocyObjectCache.getObject('locations');
		GrocyObjectCache.getObject('quantity_units');
		GrocyObjectCache.getObject('product_groups');
		GrocyObjectCache.getObject('shopping_lists');

		setupMqtt(page);
		setupDbEvents(page);

		pageState.progress = 100;
		//setTimeout(() => page.progress = 0, 300);
		startAutoReload();
		page.toWaitingState();
	});

	onDestroy(() => {
		stopAutoReload();
		disconnectDbEvents();
		disconnectMqtt(page);
		unsubscribeScreenOff();
	});
</script>

<div class="app">
	<!-- progressbar: the if makes reset (aka 100 => 0) transition more natural. -->
	{#if pageState.progress}
		<div class="progress">
			<div class="progress-bar" style="width: {pageState.progress}%"></div>
		</div>
	{/if}
	<div class="titlebar">
		<div>Grocy Station</div>
		<Clock />
	</div>

	{#if pageState instanceof ErrorState}
		<div class="message error">
			{pageState.message}
		</div>
	{:else if pageState instanceof MessageState}
		<div class="message" role="button" tabindex="0" onpointerdown={() => screenOn(5_000)}>
			{pageState.message}
		</div>
	{:else if pageState instanceof ProductState}
		<ProductStock {pageState} />
	{/if}
</div>

<div class="version">
	v{__APP_VERSION__}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: stretch;
		min-height: 100vh;
		min-height: 100dvh; /* ignored by pre-108 WebView */
		font-size: var(--text-2xl);
		line-height: var(--text-2xl--line-height);
	}

	.progress {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 50;
		width: 100%;
		height: 2px;
		pointer-events: none;
	}

	.progress-bar {
		height: 100%;
		background-color: var(--color-yellow-500);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.titlebar {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0.5rem;
		color: var(--color-container-fg);
		background-color: var(--color-container-bg-default);
	}

	.message {
		display: flex;
		flex-grow: 1;
		align-items: center;
		justify-content: center;
		padding-inline: 0.5rem;
		text-align: center;
		color: var(--color-label-fg);
	}

	.message.error {
		color: var(--color-red-400);
	}

	.version {
		position: fixed;
		right: 0.5rem;
		bottom: 0.25rem;
		font-size: var(--text-xs);
		line-height: var(--text-xs--line-height);
		color: var(--color-label-fg);
		opacity: 0.3;
		pointer-events: none;
		user-select: none;
	}
</style>
