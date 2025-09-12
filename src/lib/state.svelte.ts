// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fetchDbChanged, type GrocyData } from "$lib/grocy";

export abstract class State {
  /** *Statefull* */
  public progress: number = $state(0)
}

export class InitState extends State {
  public readonly message = "Initializing…";
}

abstract class NotInitState extends State {
  constructor() {
    super();
    clearTimeout(pageState.timeout)
  }
}

abstract class TimedState extends NotInitState {
  constructor(ms: number | undefined ) {
    super();
    pageState.timeout = setTimeout(() => {

      pageState.current = new WaitingState();
    }, ms);
  }
}

export class ErrorState extends TimedState {
  public readonly message: string;

  constructor(message: string, ms?: number) {
    super(ms);
    this.message = message;
  }
}

export class WaitingState extends NotInitState {
  public readonly message = "Please scan a barcode.";

  constructor() {
    super();
  }
}

const GROCY_POLL_INTERVAL_MS = 15_000;
export class ProductState extends NotInitState {
  /** *Statefull* */
  public grocyData: GrocyData;

  /** Number of units selected.
   * 
   * *Statefull* */
  inputQuantity: string;
  /** Size of product unit in GrocyProduct.qu_id_stock units.
   * 
   * *Statefull* */
  inputUnitSize: string;
  public readonly consumeAmount: number;

  /** *Statefull* */
  public consumeValid = $state(false);
  public selectedStockEntryIndex: number = $state(0)

  public lastchanged: {
    timestamp: string | undefined,
    interval: ReturnType<typeof setInterval> | undefined,
  };

  constructor(grocyData: GrocyData) {
    super();

    this.grocyData = $state(grocyData);
    this.inputQuantity = $state('1');
    // grocyData.packaging_units shouldn't be null 
    // contains at least the "Quick C" pu.
    // inputUnitSize is set to amount of base pu at 
    // index zero in GrocyProduct.qu_id_stock units .
    this.inputUnitSize = $state(String(grocyData.packaging_units![0].amount));
    this.consumeAmount = $derived(this.unitSize() * this.quantity());
    this.lastchanged = {timestamp: undefined, interval: setInterval(fetchDbChanged, GROCY_POLL_INTERVAL_MS)}
  }

  /** Returns currents state of ProductState.inputQuantity as numeric. */
  public quantity(): number {
    return Number(this.inputQuantity)
  }

  /** Returns currents state of ProductState.inputUnitSize 
   * as numeric in GrocyProduct.qu_id_stock units.
  */
  public unitSize(): number {
    return Number(this.inputUnitSize)
  }

  reAllot() {
    if (
      !Number.isFinite(this.consumeAmount) || this.consumeAmount <= 0 ||
      this.grocyData?.stock === undefined
    ) {
      this.consumeValid = false;
      return;
    }

    if (this.selectedStockEntryIndex >= this.grocyData.stock?.length){
      this.selectedStockEntryIndex = 0
    }

    let remaining = this.consumeAmount;
    for (const [idx, entry] of this.grocyData.stock.entries()) {
      if (idx < this.selectedStockEntryIndex) {
        entry.amount_allotted = 0;
      } else {
        entry.amount_allotted = Math.min(entry.amount, remaining);
        remaining -= entry.amount_allotted;
      }
    }

    this.consumeValid = remaining === 0;
  }

  increaseQuantity() {
    if (Number.isFinite(this.quantity())) {
      this.inputQuantity = String(Math.max(0, this.quantity()) + 1);
    }
  }

  decreaseQuantity() {
    if (Number.isFinite(this.quantity())) {
      this.inputQuantity = String(Math.max(0, Number(this.quantity()) - 1));
    }
  }
}

/** *Statefull* */
export let pageState = $state({current: new InitState() as State, timeout: undefined as ReturnType<typeof setTimeout> | undefined})

