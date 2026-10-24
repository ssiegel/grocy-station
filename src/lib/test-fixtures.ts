// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Fixtures for the tests.
 *
 * `GrocyData` mirrors a handful of Grocy API responses and is far wider than
 * any one test cares about, so these builders fill in whatever a test does
 * not mention. The fields a test does set are the ones that matter to it,
 * which keeps the interesting values visible instead of buried in a wall of
 * boilerplate.
 */

import type {
	GrocyData,
	GrocyPackagingUnit,
	GrocyShoppingList,
	GrocyShoppingListItem,
	GrocyStockEntry,
	GrocyStockLogEntry
} from '$lib/types/grocy';

/** Stock quantity unit id used throughout the fixtures. */
export const STOCK_QU_ID = 1;

export function makeStockEntry(
	amount: number,
	overrides: Partial<GrocyStockEntry> = {}
): GrocyStockEntry {
	return {
		id: 1,
		product_id: 1,
		amount,
		amount_allotted: 0,
		best_before_date: '2999-12-31',
		stock_id: `stock-${amount}`,
		open: 0,
		...overrides
	} as GrocyStockEntry;
}

export function makeStockLogEntry(overrides: Partial<GrocyStockLogEntry> = {}): GrocyStockLogEntry {
	return {
		id: 1,
		product_id: 1,
		amount: 1,
		transaction_type: 'purchase',
		row_created_timestamp: '2026-01-01 12:00:00',
		undone: 0,
		...overrides
	} as GrocyStockLogEntry;
}

export function makeShoppingListItem(
	overrides: Partial<GrocyShoppingListItem> = {}
): GrocyShoppingListItem {
	return {
		id: 1,
		shopping_list_id: 1,
		product_id: 1,
		amount: 1,
		done: 0,
		...overrides
	} as GrocyShoppingListItem;
}

export function makeShoppingList(id: number, name: string): GrocyShoppingList {
	return { id, name };
}

export function makePackagingUnit(name: string, amount: number): GrocyPackagingUnit {
	return { name, amount, amount_display: String(amount) };
}

interface GrocyDataOptions {
	stock?: GrocyStockEntry[];
	stockLog?: GrocyStockLogEntry[];
	shoppingListItems?: GrocyShoppingListItem[];
	/** Defaults to a single 1-unit packaging unit, which is also the base. */
	packagingUnits?: GrocyPackagingUnit[];
	baseIndex?: number;
	/** Defaults to the base unit, i.e. no separately-preselected unit. */
	firstIndex?: number;
	stockAmount?: number;
}

export function makeGrocyData(options: GrocyDataOptions = {}): GrocyData {
	const stock = options.stock ?? [];
	const units = options.packagingUnits ?? [makePackagingUnit('Piece', 1)];
	return {
		barcode: {
			id: 1,
			product_id: 1,
			barcode: '1234567890123'
		},
		packaging_units: {
			units,
			baseIndex: options.baseIndex ?? 0,
			firstIndex: options.firstIndex ?? options.baseIndex ?? 0
		},
		product_details: {
			product: {
				id: 1,
				name: 'Test Product',
				qu_id_stock: STOCK_QU_ID,
				qu_id_purchase: STOCK_QU_ID,
				qu_id_consume: STOCK_QU_ID,
				qu_id_price: STOCK_QU_ID,
				quick_open_amount: 1,
				quick_consume_amount: 1,
				due_type: 1
			},
			// Defaults to the sum of the stock entries, which is what Grocy
			// would report for them.
			stock_amount: options.stockAmount ?? stock.reduce((sum, entry) => sum + entry.amount, 0),
			stock_amount_opened: 0,
			quantity_unit_stock: { id: STOCK_QU_ID, name: 'Piece' }
		},
		product_group: { id: 1, name: 'Test Group' },
		stock,
		stock_log: options.stockLog ?? [],
		shopping_list_items: options.shoppingListItems ?? []
	} as unknown as GrocyData;
}
