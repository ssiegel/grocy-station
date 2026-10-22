// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Amount arithmetic that clears binary floating point representation error.
 *
 * A unit size and a quantity are factors rather than amounts and must keep
 * full precision instead, since any rounding error in one is scaled up by
 * whatever it is multiplied with.
 */

/**
 * Decimal places kept for an amount. Not Grocy's `stock_decimal_places_amounts`,
 * which is a display setting there rather than a storage or validation one.
 */
const AMOUNT_DECIMAL_PLACES = 4;

const AMOUNT_SCALE = 10 ** AMOUNT_DECIMAL_PLACES;

/**
 * Round a composed amount to the amount precision, clearing float
 * representation error. Never for a unit size or a quantity - see above.
 */
export function quantizeAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return amount;
  }
  return Math.round(amount * AMOUNT_SCALE) / AMOUNT_SCALE;
}

/**
 * True when the two amounts denote the same amount, tolerant to half of the
 * last kept place so that representation error alone does not fail it.
 */
export function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5 / AMOUNT_SCALE;
}

/**
 * Render a factor - a unit size or a quantity - for an input field, trimming
 * representation error without rounding to a fixed number of places.
 */
export function formatFactor(factor: number): string {
  if (!Number.isFinite(factor)) {
    return String(factor);
  }
  // 15 significant digits is the most a double is guaranteed to carry.
  return String(Number(factor.toPrecision(15)));
}
