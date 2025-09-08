// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fetchDbChanged, fetchProductStateInfo } from "$lib/grocy";
import type { GrocyData } from "$lib/grocy";

export abstract class State {
  /** *Statefull* */
  public progress = $state(0);
  stateTimeout: ReturnType<typeof setTimeout> | undefined;
  
  constructor() {
    this.progress = 0;
    clearTimeout(this.stateTimeout);
  }

  setWaitingStateOnTimeout(ms: number) {
    this.stateTimeout = setTimeout(() => {
      pageState.current = new WaitingState();
    }, ms);
  }
}

export class InitState extends State {
  public readonly message = "Initializing…";

  constructor() {
    super();
  }
}

export class ErrorState extends State {
  public readonly message: string;

  constructor(message: string) {
    super();
    this.message = message;
  }
}

export class WaitingState extends State {
  public readonly message = "Please scan a barcode.";

  constructor() {
    super();
  }
}

export class ProductState extends State {
  /** *Statefull* */
  public grocyData: GrocyData;
  /** Number of units selected.
   * 
   * *Statefull* */
  inputQuantity: string;
  /** In S.I. units.
   * 
   * *Statefull* */
  inputUnitSize: string;
  public readonly consumeAmount: number;
  /** *Statefull* */
  public consumeValid = $state(false);
  public lastchanged = {
    timestamp: undefined as string | undefined,
    interval: undefined as ReturnType<typeof setInterval> | undefined,
  };
  public selected_stock_entry_index: number | undefined = $state(undefined)

  constructor(grocyData: GrocyData, inputUnitSize: string) {
    super();

    this.grocyData = $state(grocyData);

    this.inputQuantity = $state('1');
    this.inputUnitSize = $state(inputUnitSize);

    this.consumeAmount = $derived(this.quantity() * this.unitSize());
  }

  public quantity(): number {
    return Number(this.inputQuantity)
  }

  /** Returns {@link inputQuantity} as numeric.  */
  public unitSize(): number {
    return Number(this.inputUnitSize)
  }

  public async build(barcode: string): Promise<State> {
    if (
      (this.grocyData.barcode?.barcode === barcode) &&
      Number.isFinite(this.quantity())
    ) {
      this.increaseQuantity();
      return this
    }

    let productStateInfo = await fetchProductStateInfo(barcode);
    let state = new ProductState(
      productStateInfo.grocyData,
      String(productStateInfo.unitSize),
    );

    state.setDbChangeInterval();
    return state
  }

  setDbChangeInterval() {
    const GROCY_POLL_INTERVAL_MS = 15_000;
    this.lastchanged.interval = setInterval(
      fetchDbChanged,
      GROCY_POLL_INTERVAL_MS,
    );
  }

  reAllot(skipOpen: boolean) {
    if (
      !Number.isFinite(this.consumeAmount) || this.consumeAmount <= 0 ||
      this.grocyData?.stock === undefined
    ) {
      this.consumeValid = false;
      return;
    }

    let remaining = this.consumeAmount;
    for (const [idx, entry] of this.grocyData.stock.entries()) {
      if ((skipOpen && entry.open === 1) || (this.selected_stock_entry_index !== undefined && idx < this.selected_stock_entry_index)) {
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
      this.inputQuantity = String(Math.max(0, Number(this.quantity())) - 1);
    }
  }
}

/** *Statefull* */
export let pageState = $state({current: new InitState() as State})
/* export let pageInfo: {
  state: State;
  stateTimeout: ReturnType<typeof setTimeout> | undefined;
} = $state({ state: new InitState(), stateTimeout: undefined }); */
/* const setPageState = (state: State) => {
  clearTimeout(pageInfo.stateTimeout);
  pageInfo.state = state;
}; */
