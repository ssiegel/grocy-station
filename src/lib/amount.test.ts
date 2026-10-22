// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from "vitest";
import { amountsEqual, formatFactor, quantizeAmount } from "$lib/amount";

describe("quantizeAmount", () => {
  test("clears the error in a product of decimals", () => {
    // 0.2 * 3 is 0.6000000000000001 in binary floating point.
    expect(quantizeAmount(0.2 * 3)).toBe(0.6);
    expect(quantizeAmount(0.1 * 3)).toBe(0.3);
    expect(quantizeAmount(1.1 * 3)).toBe(3.3);
  });

  test("clears the error in a difference of decimals", () => {
    expect(quantizeAmount(0.3 - 0.1)).toBe(0.2);
    expect(quantizeAmount(1 - 0.9)).toBe(0.1);
  });

  test("leaves a value that is already exact alone", () => {
    expect(quantizeAmount(0)).toBe(0);
    expect(quantizeAmount(1)).toBe(1);
    expect(quantizeAmount(2.5)).toBe(2.5);
  });

  test("rounds away precision beyond the kept places", () => {
    expect(quantizeAmount(1 / 3)).toBe(0.3333);
    expect(quantizeAmount(0.00004)).toBe(0);
    expect(quantizeAmount(0.00006)).toBe(0.0001);
  });

  test("passes a non-finite value through rather than turning it into NaN", () => {
    expect(quantizeAmount(Infinity)).toBe(Infinity);
    expect(quantizeAmount(-Infinity)).toBe(-Infinity);
    expect(quantizeAmount(NaN)).toBeNaN();
  });
});

describe("amountsEqual", () => {
  test("treats representation error as equal", () => {
    expect(amountsEqual(0.2 * 3, 0.6)).toBe(true);
    expect(amountsEqual(0.1 + 0.2, 0.3)).toBe(true);
  });

  test("separates amounts that differ by a kept place", () => {
    expect(amountsEqual(0.6, 0.6001)).toBe(false);
    expect(amountsEqual(1, 2)).toBe(false);
  });

  test("is the zero test the allotment loop needs", () => {
    // The residue left by composing 3 x 0.2 against a stock of 0.6.
    expect(amountsEqual(0.2 * 3 - 0.6, 0)).toBe(true);
  });
});

describe("formatFactor", () => {
  test("trims representation error from a whole result", () => {
    // 0.6 / 0.2 is 2.9999999999999996.
    expect(formatFactor(0.6 / 0.2)).toBe("3");
    expect(formatFactor(2.1 / 0.7)).toBe("3");
    expect(formatFactor(0.35 / 0.05)).toBe("7");
  });

  test("keeps the precision a repeating factor needs", () => {
    // Must NOT round to 4 places: see the round-trip test below.
    expect(formatFactor(1.5 / 9)).toBe("0.166666666666667");
    expect(formatFactor(1 / 3)).toBe("0.333333333333333");
  });

  test("leaves a plain value readable", () => {
    expect(formatFactor(1)).toBe("1");
    expect(formatFactor(0.5)).toBe("0.5");
    expect(formatFactor(1000)).toBe("1000");
  });

  test("passes a non-finite value through", () => {
    expect(formatFactor(Infinity)).toBe("Infinity");
    expect(formatFactor(NaN)).toBe("NaN");
  });
});

// The bugs that prompted this module, kept as the cases that must not come
// back. Each is a composition that has to land exactly on the stock amount
// it was derived from.
describe("composing an amount against the stock it must match", () => {
  test.for([
    // [stock, unit size]
    [0.6, 0.2],
    [0.3, 0.1],
    [2.1, 0.7],
    [3.3, 1.1],
    [0.9, 0.3],
    [1.0, 0.25],
    [0.8, 0.1],
    [0.35, 0.05],
    // Ratios that do not divide evenly: the long-press case that rounding
    // the quantity to four places broke, by composing 1.5 l of stock over a
    // 9 l unit into 1.5003.
    [1.5, 9],
    [1.0, 3],
    [1.0, 7],
    [5.0, 3],
  ])("stock %s in units of %s", ([stock, unitSize], { expect }) => {
    // The quantity the long-press gesture fills in, as the field would hold
    // it, then read back the way the composer reads it.
    const quantity = Number(formatFactor(stock / unitSize));
    const composed = quantizeAmount(unitSize * quantity);

    expect(composed).toBe(stock);
    // Grocy rejects an amount greater than the stock without rounding
    // first, so overshooting by any margin at all is a failed booking.
    expect(composed).not.toBeGreaterThan(stock);
    expect(amountsEqual(composed - stock, 0)).toBe(true);
  });
});
