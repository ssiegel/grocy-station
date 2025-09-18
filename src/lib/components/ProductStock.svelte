<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import { formatUnit, formatNumber } from "$lib/format";
    import Stock from "$lib/components/Stock.svelte";
    import { type ProductState, doConsume, doShoppingList } from "$lib/state.svelte";

    let { productState }: { productState: ProductState } = $props();
    const productData = $derived(productState.grocyData);
    const productDetails = $derived(productData.product_details)
</script>

<div
    class="bg-container-bg-default text-container-fg px-2 py-1 flex flex-row items-center justify-between"
>
    <div>{productDetails?.product.name ?? "\u00a0"}</div>
    {#if productData.product_group?.name}
        <div class="text-xl whitespace-nowrap">
            {productData.product_group.name}
        </div>
    {/if}
</div>

<div class="text-label-fg px-2 flex flex-col gap-1 items-stretch text-2xl">
    {#if productData.barcode !== undefined && !productData.barcode.barcode.startsWith("grcy:p:")}
        <div class="text-xl">
            {productData.barcode.barcode}
            <span class="italic">{productData.barcode.note}</span>
        </div>
    {/if}
    {#if productDetails !== undefined}
        {#if productData.packaging_units !== undefined}
            <div class="flex flex-row gap-4 items-stretch justify-start">
                {#each productData.packaging_units as pu}
                    <button
                        class="{'bg-@-bg-default hover:bg-@-bg-hover focus:bg-@-bg-focus active:bg-@-bg-active text-@-fg'.replaceAll(
                            '@',
                            productState.unitSize() === pu.amount ? 'btn' : 'input',
                        )} border-btn-bg-default hover:border-btn-bg-hover focus:border-btn-bg-focus active:border-btn-bg-active border-2 px-2 py-1 rounded"
                        onclick={() => (productState.inputUnitSize = String(pu.amount))}
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
                        bind:value={productState.inputUnitSize}
                        type="text"
                        inputmode="numeric"
                        size="4"
                        class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(
                            productState.unitSize(),
                        )
                            ? 'text-input-fg'
                            : 'text-red-500'}"
                    />
                    {formatUnit(productDetails.quantity_unit_stock.id)}
                </label>
            </div>
            <div><span>×</span></div>
            <div>
                <label>
                    <span class="text-xl">Quantity</span>
                    <br />
                    <input
                        bind:value={productState.inputQuantity}
                        type="text"
                        inputmode="numeric"
                        size="4"
                        class="px-2 py-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active {Number.isFinite(
                            productState.quantity(),
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
                        if (Number.isFinite(productState.quantity()))
                            productState.increaseQuantity();
                    }}>+</button
                >
                <button
                    class="flex-1 bg-input-bg-default hover:bg-input-bg-hover focus:bg-input-bg-focus active:bg-input-bg-active text-input-fg disabled:text-input-bg-focus px-2 py-0"
                    onclick={() => {
                        if (Number.isFinite(productState.quantity()))
                            productState.decreaseQuantity();
                    }}>−</button
                >
            </div>
            {#if Number.isFinite(productState.consumeAmount)}
                <div><span>=</span></div>
                <div>
                    <span class={productState.consumeValid ? "" : "text-red-500"}
                        >{formatNumber(
                            productState.consumeAmount,
                            productDetails.quantity_unit_stock.id,
                        )}</span
                    >
                </div>
            {/if}
            <div class="ml-auto self-stretch">
                <button
                        disabled={!productState.addShoppingListValid || productState.progress != 0}
                        class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded"
                        aria-label="Enlist"
                        onclick={async () => doShoppingList(productState)}
                    >
                        <svg inline-src="shoppinglist-fa" height="1.5em" fill="currentColor" />
                </button>
            </div>
            <div class="self-stretch">
                <button
                    disabled={!productState.consumeValid || productState.progress != 0}
                    class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded"
                    aria-label="Open"
                    onclick={async () => doConsume(productState, true)}
                >
                    <svg inline-src="open" height="1.5em" fill="currentColor" />
                </button>
            </div>
            <div class="self-stretch">
                <button
                    disabled={!productState.consumeValid || productState.progress != 0}
                    class="bg-btn-bg-default hover:bg-btn-bg-hover focus:bg-btn-bg-focus active:bg-btn-bg-active text-btn-fg disabled:text-btn-bg-focus px-4 py-4 h-full rounded"
                    aria-label="Consume"
                    onclick={async () => doConsume(productState, false)}
                >
                    <svg inline-src="consume" height="1.5em" fill="currentColor" />
                </button>
            </div>
        </div>
    {/if}
    <Stock {productState} />
</div>
