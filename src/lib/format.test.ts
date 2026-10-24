// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { formatDate, formatNumber, formatUnit } from '$lib/format';
import { GrocyObjectCache } from '$lib/grocy';

const LITRE = 1;
const PIECE = 2;
const UNNAMED = 3;

beforeEach(() => {
	GrocyObjectCache.seedForTesting('quantity_units', [
		{
			id: LITRE,
			name: 'Litre',
			name_plural: 'Litres',
			userfields: { symbol: 'l' }
		},
		{ id: PIECE, name: 'Piece', name_plural: 'Pieces' },
		{ id: UNNAMED, name: 'Thing' }
	]);
});

afterEach(() => {
	// The cache is module-level state; without this it leaks between files.
	GrocyObjectCache.clearForTesting();
});

describe('formatDate', () => {
	test("reads Grocy's sentinel far-future date as never", () => {
		expect(formatDate('2999-12-31')).toBe('never');
	});

	test('passes a real date through', () => {
		expect(formatDate('2026-03-15')).toBe('2026-03-15');
	});

	test('names a missing date rather than rendering nothing', () => {
		expect(formatDate(undefined)).toBe('unknown');
	});
});

describe('formatUnit', () => {
	test('prefers the symbol userfield', () => {
		expect(formatUnit(LITRE)).toBe('l');
	});

	test('falls back to the name when there is no symbol', () => {
		expect(formatUnit(PIECE)).toBe('Piece');
	});

	test('is empty for an unknown or absent unit', () => {
		expect(formatUnit(undefined)).toBe('');
		expect(formatUnit(999)).toBe('');
	});
});

describe('formatNumber', () => {
	test('renders a number without a unit when none is given', () => {
		expect(formatNumber(2.5)).toBe('2.5');
	});

	test('appends a symbol where the unit has one', () => {
		expect(formatNumber(1.5, LITRE)).toBe('1.5 l');
		// A symbol does not inflect, so it is used for one as well.
		expect(formatNumber(1, LITRE)).toBe('1 l');
	});

	test('inflects a name by the amount', () => {
		expect(formatNumber(1, PIECE)).toBe('1 Piece');
		expect(formatNumber(2, PIECE)).toBe('2 Pieces');
		expect(formatNumber(0, PIECE)).toBe('0 Pieces');
	});

	test('uses the singular for a unit with no plural', () => {
		expect(formatNumber(2, UNNAMED)).toBe('2 Thing');
	});

	test('drops the trailing noise of a float', () => {
		// Composed amounts reach here unrounded in some paths.
		expect(formatNumber(0.2 * 3)).toBe('0.6');
		expect(formatNumber(1 / 3)).toBe('0.33333');
	});

	test('does not group thousands, which would read as a decimal comma', () => {
		expect(formatNumber(1234)).toBe('1234');
	});

	test('omits the unit it cannot name', () => {
		expect(formatNumber(5, 999)).toBe('5');
	});
});
