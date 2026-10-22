// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

// Named *.svelte.test.ts so that the runes in the code under test compile:
// Svelte only processes a file it recognises as its own.

import { beforeEach, describe, expect, test } from "vitest";
import { ProductState } from "$lib/state.svelte";
import type { GrocyData } from "$lib/types/grocy";
import {
  makeGrocyData,
  makePackagingUnit,
  makeStockEntry,
} from "$lib/test-fixtures";

/**
 * A ProductState over the given data.
 *
 * The constructor takes its data as an argument and reaches the network
 * nowhere, so the composing and allotting half of this class needs no
 * stubbing at all.
 */
function productState(grocyData: GrocyData): ProductState {
  return new ProductState(grocyData, undefined, 0, undefined);
}

describe("composing an amount", () => {
  let state: ProductState;

  beforeEach(() => {
    state = productState(makeGrocyData({
      packagingUnits: [
        makePackagingUnit("Glass", 0.2),
        makePackagingUnit("Carton", 1),
      ],
      baseIndex: 1,
    }));
  });

  test("preselects the base unit rather than the first one", () => {
    expect(state.unitSize()).toBe(1);
    expect(state.quantity()).toBe(1);
    expect(state.consumeAmount).toBe(1);
  });

  test("multiplies the unit size by the quantity", () => {
    state.inputUnitSize = "0.2";
    state.inputQuantity = "3";
    expect(state.consumeAmount).toBe(0.6);
  });

  test("reads a non-numeric input as not a number", () => {
    state.inputQuantity = "abc";
    expect(Number.isNaN(state.consumeAmount)).toBe(true);
  });

  test("steps the quantity without going below zero", () => {
    state.inputQuantity = "1";
    state.increaseQuantity();
    expect(state.quantity()).toBe(2);
    state.decreaseQuantity();
    state.decreaseQuantity();
    expect(state.quantity()).toBe(0);
    state.decreaseQuantity();
    expect(state.quantity()).toBe(0);
  });

  test("resetting returns to one base unit", () => {
    state.inputUnitSize = "0.2";
    state.inputQuantity = "7";
    state.resetQuantity();
    expect(state.unitSize()).toBe(1);
    expect(state.quantity()).toBe(1);
    expect(state.selectedStockEntryIndex).toBe(0);
  });
});

describe("allotting stock", () => {
  test("takes a single entry whole when the amount matches it", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));
    state.inputUnitSize = "5";
    state.reAllot();

    expect(state.consumeValid).toBe(true);
    expect(state.grocyData.stock[0].amount_allotted).toBe(5);
  });

  test("takes part of an entry when the amount is smaller", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));
    state.inputUnitSize = "2";
    state.reAllot();

    expect(state.consumeValid).toBe(true);
    expect(state.grocyData.stock[0].amount_allotted).toBe(2);
  });

  test("spills over into later entries, oldest first", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(2), makeStockEntry(3), makeStockEntry(4)],
    }));
    state.inputUnitSize = "4";
    state.reAllot();

    expect(state.consumeValid).toBe(true);
    expect(state.grocyData.stock.map((e) => e.amount_allotted))
      .toEqual([2, 2, 0]);
  });

  test("is invalid when the stock cannot cover the amount", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(2)],
    }));
    state.inputUnitSize = "5";
    state.reAllot();

    expect(state.consumeValid).toBe(false);
  });

  test("is invalid with no stock at all", () => {
    const state = productState(makeGrocyData({ stock: [] }));
    state.reAllot();
    expect(state.consumeValid).toBe(false);
  });

  test("is invalid for a zero or negative amount", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));

    state.inputQuantity = "0";
    state.reAllot();
    expect(state.consumeValid).toBe(false);

    state.inputQuantity = "-1";
    state.reAllot();
    expect(state.consumeValid).toBe(false);
  });

  test("is invalid for an unparseable amount", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));
    state.inputQuantity = "";
    state.inputUnitSize = "x";
    state.reAllot();
    expect(state.consumeValid).toBe(false);
  });

  test("skips the entries before the selected one", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(2), makeStockEntry(3), makeStockEntry(4)],
    }));
    state.selectedStockEntryIndex = 1;
    state.inputUnitSize = "3";
    state.reAllot();

    expect(state.consumeValid).toBe(true);
    expect(state.grocyData.stock.map((e) => e.amount_allotted))
      .toEqual([0, 3, 0]);
  });

  test("cannot reach back past the selected entry to make up a shortfall", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(10), makeStockEntry(1)],
    }));
    state.selectedStockEntryIndex = 1;
    state.inputUnitSize = "5";
    state.reAllot();

    // Only the 1 behind the selection is reachable, so 5 does not fit even
    // though the product holds 11 in total.
    expect(state.consumeValid).toBe(false);
  });

  test("falls back to the first entry when the selection is out of range", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));
    state.selectedStockEntryIndex = 7;
    state.inputUnitSize = "5";
    state.reAllot();

    expect(state.selectedStockEntryIndex).toBe(0);
    expect(state.consumeValid).toBe(true);
  });

  // The bug this project hit: an amount composed of decimals missing the
  // stock it was meant to match by one bit, leaving the actions disabled.
  test.for([
    [0.6, 0.2, 3],
    [0.3, 0.1, 3],
    [2.1, 0.7, 3],
    [0.35, 0.05, 7],
    [3.3, 1.1, 3],
  ])(
    "composes %s out of %s x %s exactly",
    ([stock, unitSize, quantity], { expect }) => {
      const state = productState(makeGrocyData({
        stock: [makeStockEntry(stock)],
      }));
      state.inputUnitSize = String(unitSize);
      state.inputQuantity = String(quantity);
      state.reAllot();

      expect(state.consumeValid).toBe(true);
      expect(state.grocyData.stock[0].amount_allotted).toBe(stock);
    },
  );

  test("allots across entries whose amounts are decimals", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(0.1), makeStockEntry(0.2)],
    }));
    state.inputUnitSize = "0.1";
    state.inputQuantity = "3";
    state.reAllot();

    expect(state.consumeValid).toBe(true);
    expect(state.grocyData.stock.map((e) => e.amount_allotted))
      .toEqual([0.1, 0.2]);
  });

  // Grocy stores amounts as given, without rounding, so a stock entry can
  // hold a value with no short decimal form. Rounding each allotment to the
  // kept places used to lose a ten-thousandth per entry and make the whole
  // booking unreachable.
  test("covers a whole unit with three entries of a third", () => {
    const third = 1 / 3;
    const state = productState(makeGrocyData({
      stock: [
        makeStockEntry(third),
        makeStockEntry(third),
        makeStockEntry(third),
      ],
    }));
    state.inputUnitSize = "1";
    state.reAllot();

    expect(state.consumeValid).toBe(true);
    // Each allotment matches the entry it came from, since that is the
    // amount that would be posted against it.
    expect(state.grocyData.stock.map((e) => e.amount_allotted))
      .toEqual([third, third, third]);
  });
});

// The marker on a stock row, as the component derives it. Collapsing a
// three-valued attribute into these two classes has to preserve the mapping,
// and they must never both apply.
describe("the allotment marker a row shows", () => {
  function marker(state: ProductState, index: number) {
    const entry = state.grocyData.stock[index];
    const full = state.consumeValid && entry.amount_allotted > 0 &&
      entry.amount_allotted >= entry.amount;
    const partial = state.consumeValid && entry.amount_allotted > 0 &&
      entry.amount_allotted < entry.amount;
    expect(full && partial).toBe(false);
    return full ? "full" : partial ? "partial" : "none";
  }

  test("marks an entry taken whole", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));
    state.inputUnitSize = "5";
    state.reAllot();
    expect(marker(state, 0)).toBe("full");
  });

  test("marks an entry taken in part", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(5)],
    }));
    state.inputUnitSize = "2";
    state.reAllot();
    expect(marker(state, 0)).toBe("partial");
  });

  test("leaves an untouched entry unmarked", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(2), makeStockEntry(3)],
    }));
    state.inputUnitSize = "2";
    state.reAllot();
    expect(marker(state, 0)).toBe("full");
    expect(marker(state, 1)).toBe("none");
  });

  test("marks nothing while the amount does not fit", () => {
    const state = productState(makeGrocyData({
      stock: [makeStockEntry(2)],
    }));
    state.inputUnitSize = "5";
    state.reAllot();
    expect(marker(state, 0)).toBe("none");
  });
});
