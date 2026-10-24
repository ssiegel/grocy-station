// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { quantizeAmount } from '$lib/amount';
import { GrocyObjectCache } from '$lib/grocy';
import {
	barcodePackagingUnits,
	productDetailsPackagingUnits,
	type QutoStockQuConversionFactorMap
} from '$lib/packaging';
import type { GrocyBarcode, GrocyProductDetails } from '$lib/types/grocy';

const LITRE = 1;
const BOTTLE = 2;

// The display strings go through formatNumber, which reads the unit cache.
beforeEach(() => {
	GrocyObjectCache.seedForTesting('quantity_units', [
		{
			id: LITRE,
			name: 'Litre',
			name_plural: 'Litres',
			userfields: { symbol: 'l' }
		},
		{ id: BOTTLE, name: 'Bottle', name_plural: 'Bottles' }
	]);
});

afterEach(() => {
	GrocyObjectCache.clearForTesting();
});

/** One litre to one stock unit, so amounts read directly. */
const factors: QutoStockQuConversionFactorMap = new Map([
	[LITRE, 1],
	[BOTTLE, 0.75]
]);

function barcode(overrides: Partial<GrocyBarcode> = {}): GrocyBarcode {
	return {
		id: 1,
		product_id: 1,
		barcode: '1234567890123',
		amount: 1,
		qu_id: LITRE,
		...overrides
	} as GrocyBarcode;
}

function packagingUnits(lines: string): GrocyBarcode {
	return barcode({ userfields: { packaging_units: lines } });
}

describe('barcodePackagingUnits', () => {
	test('declines a barcode carrying no amount', () => {
		expect(barcodePackagingUnits(barcode({ amount: undefined }), factors)).toBeUndefined();
		expect(barcodePackagingUnits(barcode({ qu_id: undefined }), factors)).toBeUndefined();
	});

	test("yields the barcode's own amount when no userfield names it", () => {
		const pus = barcodePackagingUnits(barcode({ amount: 2 }), factors)!;
		expect(pus.units).toHaveLength(1);
		expect(pus.units[0]).toMatchObject({ name: 'Barcode PU', amount: 2 });
		expect(pus.baseIndex).toBe(0);
		expect(pus.firstIndex).toBe(0);
	});

	test('converts the amount into stock units', () => {
		// 2 bottles at 0.75 l each.
		const pus = barcodePackagingUnits(barcode({ amount: 2, qu_id: BOTTLE }), factors)!;
		expect(pus.units[0].amount).toBe(1.5);
		expect(pus.units[0].amount_display).toBe('2 Bottles');
	});

	test('names the base unit from a factor-of-one line', () => {
		const pus = barcodePackagingUnits(packagingUnits('1 Carton'), factors)!;
		expect(pus.units).toHaveLength(1);
		expect(pus.units[0].name).toBe('Carton');
	});

	test('adds a unit per line and orders them by amount', () => {
		const pus = barcodePackagingUnits(packagingUnits('1 Carton\n4 Pack\n1/5 Glass'), factors)!;
		expect(pus.units.map((u) => [u.name, u.amount])).toEqual([
			['Glass', 0.2],
			['Carton', 1],
			['Pack', 4]
		]);
	});

	test("points baseIndex at the barcode's own amount after ordering", () => {
		const pus = barcodePackagingUnits(packagingUnits('1 Carton\n4 Pack\n1/5 Glass'), factors)!;
		// Carton is the base, and ordering has moved it off the front.
		expect(pus.baseIndex).toBe(1);
		expect(pus.units[pus.baseIndex].name).toBe('Carton');
		expect(pus.firstIndex).toBe(1);
	});

	test('points firstIndex at the unit declared first even when it is not the base', () => {
		const pus = barcodePackagingUnits(packagingUnits('4 Pack\n1 Carton\n1/5 Glass'), factors)!;
		expect(pus.units[pus.baseIndex].name).toBe('Carton');
		expect(pus.units[pus.firstIndex].name).toBe('Pack');
		expect(pus.baseIndex).not.toBe(pus.firstIndex);
	});

	test('puts the implicit base unit last when no line names it', () => {
		const pus = barcodePackagingUnits(packagingUnits('4 Pack\n1/5 Glass'), factors)!;
		expect(pus.units[pus.baseIndex].name).toBe('Barcode PU');
		expect(pus.units[pus.firstIndex].name).toBe('Pack');
	});

	test('ignores lines it cannot parse', () => {
		const pus = barcodePackagingUnits(packagingUnits('4 Pack\n\nnonsense\n   \n2 Twin'), factors)!;
		expect(pus.units.map((u) => u.name)).toEqual(['Barcode PU', 'Twin', 'Pack']);
	});

	test('keeps a fractional unit precise enough to compose back', () => {
		// The bug a rounded packaging unit caused: a third of a litre that can
		// never make a whole one again.
		const pus = barcodePackagingUnits(packagingUnits('1/3 Third'), factors)!;
		const third = pus.units.find((u) => u.name === 'Third')!;
		expect(quantizeAmount(third.amount * 3)).toBe(1);
	});

	test('keeps units of equal amount in the order declared', () => {
		const pus = barcodePackagingUnits(packagingUnits('1/2 First\n1/2 Second'), factors)!;
		expect(pus.units.map((u) => u.name)).toEqual(['First', 'Second', 'Barcode PU']);
		expect(pus.units[pus.firstIndex].name).toBe('First');
	});
});

describe('productDetailsPackagingUnits', () => {
	function details(quickConsume: number, quickOpen: number): GrocyProductDetails {
		return {
			product: {
				id: 1,
				qu_id_stock: LITRE,
				qu_id_consume: LITRE,
				quick_consume_amount: quickConsume,
				quick_open_amount: quickOpen
			}
		} as unknown as GrocyProductDetails;
	}

	test('yields the quick consume amount as the base unit', () => {
		const pus = productDetailsPackagingUnits(details(0.5, 0.5), factors);
		expect(pus.units).toHaveLength(1);
		expect(pus.units[0]).toMatchObject({ name: 'Quick C', amount: 0.5 });
		expect(pus.baseIndex).toBe(0);
		expect(pus.firstIndex).toBe(0);
	});

	test('adds the quick open amount when it differs', () => {
		const pus = productDetailsPackagingUnits(details(0.5, 2), factors);
		expect(pus.units.map((u) => u.name)).toEqual(['Quick C', 'Quick O']);
	});

	test('keeps Quick C as the base and first once ordering moves it', () => {
		// Opening less than is consumed puts Quick O first in amount order.
		const pus = productDetailsPackagingUnits(details(2, 0.5), factors);
		expect(pus.units.map((u) => u.name)).toEqual(['Quick O', 'Quick C']);
		expect(pus.units[pus.baseIndex].name).toBe('Quick C');
		expect(pus.units[pus.firstIndex].name).toBe('Quick C');
	});
});
