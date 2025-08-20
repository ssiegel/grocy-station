<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import { doConsume } from "$lib/grocy";
    import { formatUnit, formatNumber } from "$lib/format";
    import Stock from "$lib/components/Stock.svelte";
    import type { ProductState } from "$lib/state.svelte";

    let { state }: { state: ProductState } = $props();
    let product = $derived(state.grocyData);
</script>

<div
    class="bg-container-bg-default text-container-fg px-2 py-1 flex flex-row items-center justify-between"
>
    <div>{product.product_details?.product.name ?? "\u00a0"}</div>
    {#if product.product_group?.name}
        <div class="text-xl whitespace-nowrap">
            {product.product_group.name}
        </div>
    {/if}
</div>

<div class="text-label-fg px-2 flex flex-col gap-1 items-stretch text-2xl">
    {#if product.barcode !== undefined && !product.barcode.barcode.startsWith("grcy:p:")}
        <div class="text-xl">
            {product.barcode.barcode}
            <span class="italic">{product.barcode.note}</span>
        </div>
    {/if}
    {#if product.product_details !== undefined}
        {#if product.packaging_units !== undefined}
            <div class="flex flex-row gap-4 items-stretch justify-start">
                {#each product.packaging_units as pu}
                    <button
                        class="{'bg-@-bg-default hover:bg-@-bg-hover focus:bg-@-bg-focus active:bg-@-bg-active text-@-fg'.replaceAll(
                            '@',
                            state.unitSize() === pu.amount_stock ? 'btn' : 'input',
                        )} border-btn-bg-default hover:border-btn-bg-hover focus:border-btn-bg-focus active:border-btn-bg-active border-2 px-2 py-1 rounded"
                        onclick={() => (state.inputUnitSize = String(pu.amount_stock))}
                    >
                        {pu.name}
                        <br />
                        {pu.amount_display}
                    </button>
                {/each}
            </div>
        {/if}
        <div class="flex flex-row gap-2 items-center justify-start">
            <div>
                <label>
                    <span class="text-xl">Unit size</span>
                    <br />
                    <input
                        bind:value={state.inputUnitSize}
                        type="text"
                        inputmode="numeric"
                        size="4"
                        class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(
                            state.unitSize(),
                        )
                            ? 'text-input-fg'
                            : 'text-red-500'}"
                    />
                    {formatUnit(product.product_details.quantity_unit_stock.id)}
                </label>
            </div>
            <div><span>×</span></div>
            <div>
                <label>
                    <span class="text-xl">Quantity</span>
                    <br />
                    <input
                        bind:value={state.inputQuantity}
                        type="text"
                        inputmode="numeric"
                        size="4"
                        class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(
                            state.quantity(),
                        )
                            ? 'text-input-fg'
                            : 'text-red-500'}"
                    />
                </label>
            </div>
            <div class="self-stretch flex flex-col gap-2 text-md">
                <button
                    class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0"
                    onclick={() => {
                        if (Number.isFinite(state.quantity()))
                            state.increaseQuantity();
                    }}>+</button
                >
                <button
                    class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0"
                    onclick={() => {
                        if (Number.isFinite(state.quantity()))
                            state.decreaseQuantity();
                    }}>−</button
                >
            </div>
            {#if Number.isFinite(state.consumeAmount)}
                <div><span>=</span></div>
                <div>
                    <span class={state.consumeValid ? "" : "text-red-500"}
                        >{formatNumber(
                            state.consumeAmount,
                            product.product_details.quantity_unit_stock.id,
                        )}</span
                    >
                </div>
            {/if}
            <div class="ml-auto self-stretch">
                <button
                    disabled={!state.consumeValid || state.progress != 0}
                    class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded"
                    aria-label="Open"
                    onclick={async () => doConsume(true)}
                >
                    <svg inline-src="open" height="1.5em" fill="currentColor" />
                </button>
            </div>
            <div class="self-stretch">
                <button
                    disabled={!state.consumeValid || state.progress != 0}
                    class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded"
                    aria-label="Consume"
                    onclick={async () => doConsume(false)}
                >
                    <svg inline-src="consume" height="1.5em" fill="currentColor" />
                </button>
            </div>
        </div>
    {/if}
    <Stock {product} />
</div>
