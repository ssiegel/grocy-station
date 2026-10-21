<!--
SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script lang="ts">
    import { formatUnit, formatNumber } from "$lib/format";
    import { type ProductState } from "$lib/state.svelte";
    import Stock from "$lib/components/Stock.svelte";
    import StockJournal from "$lib/components/StockJournal.svelte";
    import ActionButton from "$lib/components/ActionButton.svelte";
    import SegmentedControl from "$lib/components/SegmentedControl.svelte";

    let { pageState: productState }: { pageState: ProductState } = $props();
    const productData = $derived(productState.grocyData);
    const productDetails = $derived(productData.product_details)
    const packagingUnits = $derived(productData.packaging_units);

    // The unit size is a free-text field, so the selection follows the
    // amount rather than the other way round: typing an amount by hand
    // highlights the matching unit, and typing one that belongs to no unit
    // highlights nothing. Units sharing an amount cannot be told apart this
    // way, so the first of them stands in for the rest.
    const selectedPackagingUnitIndex = $derived(
        packagingUnits.units.findIndex(
            (pu) => pu.amount === productState.unitSize(),
        ),
    );
</script>

<div class="titlebar">
    <div>{productDetails.product.name ?? "\u00a0"}</div>
    {#if productData.product_group?.name}
        <div class="product-group">
            {productData.product_group.name}
        </div>
    {/if}
</div>

<div class="panel">
    {#if productData.barcode !== undefined && !productData.barcode.barcode.startsWith("grcy:p:")}
        <div class="barcode">
            {productData.barcode.barcode}
            <span class="note">{productData.barcode.note}</span>
        </div>
    {/if}
    <SegmentedControl
        options={packagingUnits.units.map((pu) => ({
            label: pu.name,
            sublabel: pu.amount_display,
        }))}
        selectedIndex={selectedPackagingUnitIndex}
        defaultIndex={packagingUnits.baseIndex}
        onselect={(i) =>
            (productState.inputUnitSize = String(packagingUnits.units[i].amount))}
    />
    <div class="amount-row">
        <div>
            <label>
                <span class="field-label">Unit size</span>
                <br />
                <input
                    bind:value={productState.inputUnitSize}
                    type="text"
                    inputmode="numeric"
                    size="4"
                    class:invalid={!Number.isFinite(productState.unitSize())}
                />
                {formatUnit(productDetails.quantity_unit_stock.id)}
            </label>
        </div>
        <div><span>×</span></div>
        <div>
            <label>
                <span class="field-label">Quantity</span>
                <br />
                <input
                    bind:value={productState.inputQuantity}
                    type="text"
                    inputmode="numeric"
                    size="4"
                    class:invalid={!Number.isFinite(productState.quantity())}
                />
            </label>
        </div>
        <div class="stepper">
            <button
                disabled={!Number.isFinite(productState.quantity())}
                onclick={() => productState.increaseQuantity()}>+</button
            >
            <button
                disabled={!Number.isFinite(productState.quantity())}
                onclick={() => productState.decreaseQuantity()}>−</button
            >
        </div>
        {#if Number.isFinite(productState.consumeAmount)}
            <div><span>=</span></div>
            <div>
                <span class:invalid={!productState.consumeValid}
                    >{formatNumber(
                        productState.consumeAmount,
                        productDetails.quantity_unit_stock.id,
                    )}</span
                >
            </div>
        {/if}
        <div class="action push-right">
            <ActionButton 
                disabled={!productState.addShoppingListValid || productState.progress != 0}
                onclick={async () => productState.doShoppingList()}
                label="Enlist"
                >
                <svg inline-src="shoppinglist-fa" height="1.5em" fill="currentColor" />
            </ActionButton>    
        </div>
        <div class="action">
            <ActionButton 
                disabled={!productState.consumeValid || productState.progress != 0}
                onclick={async () => productState.doConsume(true)}
                label="Open"
                >
                <svg inline-src="open" height="1.5em" fill="currentColor" />
            </ActionButton>
        </div>
        <div class="action">
            <ActionButton 
                disabled={!productState.consumeValid || productState.progress != 0}
                onclick={async () => productState.doConsume(false)}
                label="Consume"
                >
                <svg inline-src="consume" height="1.5em" fill="currentColor" />
            </ActionButton>
        </div>
    </div>
    <Stock {productState} />
    <StockJournal {productState} />
</div>

<style>
    .titlebar {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: 0.25rem 0.5rem;
        color: var(--color-container-fg);
        background-color: var(--color-container-bg-default);
    }

    .product-group {
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
        white-space: nowrap;
    }

    .panel {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: stretch;
        padding-inline: 0.5rem;
        font-size: var(--text-2xl);
        line-height: var(--text-2xl--line-height);
        color: var(--color-label-fg);
    }

    .barcode {
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
    }

    .note {
        font-style: italic;
    }

    .amount-row {
        display: flex;
        flex-direction: row;
        gap: 0.5rem;
        align-items: center;
        justify-content: flex-start;
    }

    .field-label {
        font-size: var(--text-xl);
        line-height: var(--text-xl--line-height);
    }

    input {
        padding: 0.25rem 0.5rem;
        color: var(--color-input-fg);
        background-color: var(--color-input-bg-default);
    }

    input:focus {
        background-color: var(--color-input-bg-focus);
    }

    input:active {
        background-color: var(--color-input-bg-active);
    }

    .invalid {
        color: var(--color-red-500);
    }

    .stepper {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-self: stretch;
    }

    .stepper button {
        flex: 1;
        padding-inline: 0.5rem;
        color: var(--color-input-fg);
        background-color: var(--color-input-bg-default);
    }

    .stepper button:disabled {
        color: var(--color-input-bg-focus);
    }

    .stepper button:focus {
        background-color: var(--color-input-bg-focus);
    }

    .stepper button:active {
        background-color: var(--color-input-bg-active);
    }

    /* Wrappers: scoped styles cannot reach the button inside ActionButton. */
    .action {
        align-self: stretch;
    }

    .push-right {
        margin-left: auto;
    }

    /* Guarded so a tap on the kiosk tablet does not leave a stuck highlight. */
    @media (hover: hover) {
        input:hover,
        .stepper button:not(:disabled):hover {
            background-color: var(--color-input-bg-hover);
        }
    }
</style>
