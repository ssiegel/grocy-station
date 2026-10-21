// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { GrocyClient } from "$lib/grocy";
import type {
  GrocyBarcode,
  GrocyPackagingUnit,
  GrocyPackagingUnits,
  GrocyProductDetails,
} from "$lib/types/grocy";
import { formatNumber } from "$lib/format";

/**
 * Order the units by ascending amount and locate the base unit within them,
 * by object identity rather than amount since two units may share one.
 */
function orderPackagingUnits(
  units: GrocyPackagingUnit[],
  baseUnit: GrocyPackagingUnit,
): GrocyPackagingUnits {
  // Stable, so units of equal amount keep the order they were declared in.
  const ordered = [...units].sort((a, b) => a.amount - b.amount);
  return { units: ordered, baseIndex: ordered.indexOf(baseUnit) };
}

type QutoStockQuConversionFactorMap = Map<number, number>;
export class PackagingUnitsBuilder {
  barcode: GrocyBarcode;
  productDetails: GrocyProductDetails;
  quStockquConversionFactorMapPromise: Promise<QutoStockQuConversionFactorMap>;

  constructor(
    grocyBarcode: GrocyBarcode,
    grocyProductDetails: GrocyProductDetails,
  ) {
    this.barcode = grocyBarcode;
    this.productDetails = grocyProductDetails;
    this.quStockquConversionFactorMapPromise = this
      .buildQuStockquConversionFactorMap();
  }

  /** Maps *qu_id* to *conversion factor*
   * between *qu_id quantity units* and *stock quantity units* */
  private async buildQuStockquConversionFactorMap(): Promise<
    QutoStockQuConversionFactorMap
  > {
    const product = this.productDetails.product;
    const quStockquConversionFactorMap = new Map<number, number>([
      [
        product.qu_id_purchase,
        this.productDetails.qu_conversion_factor_purchase_to_stock!,
      ],
      [
        product.qu_id_price,
        this.productDetails.qu_conversion_factor_price_to_stock!,
      ],
      [product.qu_id_stock, 1.0],
    ]);

    if (
      [product.qu_id_consume, this.barcode.qu_id].some((
        x,
      ) => x != null && !quStockquConversionFactorMap.has(x))
    ) {
      for (
        const c of await GrocyClient.getQUConversions(
          product.id!,
          product.qu_id_stock,
        )
      ) {
        quStockquConversionFactorMap.set(c.from_qu_id, c.factor);
      }
    }

    return quStockquConversionFactorMap;
  }

  private buildBarcodePackagingUnits(
    quStockquConversionFactorMap: QutoStockQuConversionFactorMap,
  ): GrocyPackagingUnits | undefined {
    if (this.barcode.amount == null || this.barcode.qu_id == null) {
      return undefined;
    }
    const barcodeAmountStockUnits = this.barcode.amount *
      quStockquConversionFactorMap.get(this.barcode.qu_id)!;

    // get pu from barcode qu
    const basePu = {
      name: "Barcode PU",
      amount_display: formatNumber(
        this.barcode.amount,
        this.barcode.qu_id,
      ),
      amount: barcodeAmountStockUnits,
    };
    const pus = [basePu];

    // get pu from barcode userfields
    for (
      const line of (this.barcode.userfields?.packaging_units ?? "").split(
        /\r?\n/,
      )
    ) {
      const match = line.match(/^(\d+)(?:\/(\d+))?\s+(.*)$/);
      if (!match) {
        continue;
      }
      const factor = Number(match[1]) / Number(match[2] ?? 1);
      if (factor === 1) {
        basePu.name = match[3];
      } else {
        pus.push({
          name: match[3],
          amount_display: formatNumber(
            this.barcode.amount * factor,
            this.barcode.qu_id,
          ),
          amount: barcodeAmountStockUnits * factor,
        });
      }
    }
    return orderPackagingUnits(pus, basePu);
  }

  private buildProductDetailsPackagingUnits(
    quStockquConversionFactorMap: QutoStockQuConversionFactorMap,
  ): GrocyPackagingUnits {
    const quickCAmount = this.productDetails.product.quick_consume_amount;
    const quicksimplePus = [
      {
        name: "Quick C",
        amount: quickCAmount,
      },
    ];

    const quickOAmount = this.productDetails.product.quick_open_amount;
    if (quickOAmount !== quickCAmount) {
      quicksimplePus.push(
        {
          name: "Quick O",
          amount: quickOAmount,
        },
      );
    }

    const quickPus: GrocyPackagingUnit[] = quicksimplePus.map(
      (simplePu) => ({
        name: simplePu.name,
        amount_display: formatNumber(
          simplePu.amount /
            quStockquConversionFactorMap.get(
              this.productDetails.product.qu_id_consume,
            )!,
          this.productDetails.product.qu_id_consume,
        ),
        amount: simplePu.amount,
      }),
    );
    // "Quick C" is the consume default, so it is the base unit.
    return orderPackagingUnits(quickPus, quickPus[0]);
  }

  async build(): Promise<GrocyPackagingUnits> {
    const quStockquConversionFactorMap = await this
      .quStockquConversionFactorMapPromise;
    let pus = this.buildBarcodePackagingUnits(quStockquConversionFactorMap);
    if (pus === undefined) {
      pus = this.buildProductDetailsPackagingUnits(
        quStockquConversionFactorMap,
      );
    }
    return pus;
  }
}
