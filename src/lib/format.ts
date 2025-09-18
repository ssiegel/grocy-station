// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { GrocyObjectCache } from "$lib/grocy";

export function formatDate(date?: string): string {
  date ??= "unknown";
  return date === "2999-12-31" ? "never" : date;
}

export function formatUnit(unitId?: number): string {
  const unit = unitId !== undefined
    ? GrocyObjectCache.getCachedObject("quantity_units", unitId)
    : undefined;
  if (unit === undefined) {
    return "";
  } else if (unit.userfields?.symbol) {
    return unit.userfields.symbol;
  } // else if (unit.name_plural !== undefined)
  //     return unit.name_plural;
  else {
    return unit.name;
  }
}

export function formatNumber(amount: number, unitId?: number): string {
  let formatted = Intl.NumberFormat("en-US", {
    style: "decimal",
    maximumSignificantDigits: 5,
    useGrouping: false,
  }).format(amount).toString();
  const unit = unitId !== undefined
    ? GrocyObjectCache.getCachedObject("quantity_units", unitId)
    : undefined;
  if (unit !== undefined) {
    formatted += " ";
    if (unit.userfields?.symbol) {
      formatted += unit.userfields?.symbol;
    } else if (
      unit.name_plural !== undefined && Math.abs(amount - 1.0) >= 1e-6
    ) {
      formatted += unit.name_plural;
    } else {
      formatted += unit.name;
    }
  }
  return formatted;
}
