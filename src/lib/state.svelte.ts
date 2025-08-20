// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { fetchDbChanged, fetchProductStateInfo } from "$lib/grocy";
import type { GrocyData } from "$lib/grocy";

abstract class State {
  /** Statefull */
  public progress = $state(0);
}

export class InitState extends State {
  public readonly message = "Initializing…";

  constructor() {
    super();
  }
}

export class ErrorState implements State {
  public progress: number;
  public readonly message: string;
  //private timeout?: ReturnType<typeof setTimeout>

  constructor(message: string) {
    pageInfo.state.progress = 0;
    this.progress = pageInfo.state.progress;
    this.message = message;
    setPageState(this);
  }
}

export class WaitingState implements State {
  public progress: number;
  public readonly message = "Please scan a barcode.";

  constructor() {
    pageInfo.state.progress = 0;
    this.progress = pageInfo.state.progress;
    setPageState(this);
  }

  product(barcode: string) {
  }
}

export class ProductState implements State {
  public progress: number;
  /** Statefull */
  public grocyData: GrocyData;
  /** Statefull */
  public inputQuantity: string;
  /** Statefull */
  public inputUnitSize: string;
  public readonly consumeAmount: number;
  /** Statefull */
  public consumeValid = $state(false);
  public lastchanged = {
    timestamp: undefined as string | undefined,
    interval: undefined as ReturnType<typeof setInterval> | undefined,
  };
  public selected_stock_entry_index: number | undefined = $state(undefined)

  constructor(grocyData: GrocyData, inputUnitSize: string) {
    pageInfo.state.progress = 0;
    this.progress = pageInfo.state.progress;

    this.grocyData = $state(grocyData);

    this.inputQuantity = $state('1');
    this.inputUnitSize = $state(inputUnitSize);

    this.consumeAmount = $derived(this.quantity() * this.unitSize());

    setPageState(this);
  }

  public quantity(): number {
    return Number(this.inputQuantity)
  }

  public unitSize(): number {
    return Number(this.inputUnitSize)
  }

  public static async build(barcode: string) {
    if (
      pageInfo.state instanceof ProductState &&
      (pageInfo.state.grocyData.barcode?.barcode === barcode) &&
      Number.isFinite(pageInfo.state.quantity())
    ) {
      return pageInfo.state.increaseQuantity();
    }

    let productStateInfo = await fetchProductStateInfo(barcode);
    let state = new ProductState(
      productStateInfo.grocyData,
      String(productStateInfo.unitSize),
    );

    state.setDbChangeInterval();
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

/** Statefull */
export let pageInfo: {
  state: State;
  stateTimeout: ReturnType<typeof setTimeout> | undefined;
} = $state({ state: new InitState(), stateTimeout: undefined });
const setPageState = (state: State) => {
  clearTimeout(pageInfo.stateTimeout);
  pageInfo.state = state;
};

export let setWaitingStateOnTimeout = (ms: number) => {
  pageInfo.stateTimeout = setTimeout(() => {
    new WaitingState();
  }, ms);
};
