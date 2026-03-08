// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { components } from "$lib/types/grocy-api";

// type GrocyObject = paths['/objects/{entity}/{objectId}']['get']['responses'][200]['content']['application/json'];
// type GrocyObject = Record<string, unknown>;
type GrocyObject = Record<string, any>;
type GrocyProduct = components["schemas"]["Product"] & {
  qu_id_stock: number;
  qu_id_purchase: number;
  qu_id_consume: number;
  qu_id_price: number;
  quick_open_amount: number;
  quick_consume_amount: number;
  due_type: 1 | 2;
};
type GrocyUnit = components["schemas"]["QuantityUnit"];
export type GrocyProductDetails =
  & components["schemas"]["ProductDetailsResponse"]
  & {
    product: GrocyProduct;
    product_barcodes: GrocyBarcode[];
    quantity_unit_stock: GrocyUnit;
    default_quantity_unit_purchase: GrocyUnit;
    default_quantity_unit_consume: GrocyUnit;
    quantity_unit_price: GrocyUnit;
  };
export type GrocyStockEntry = components["schemas"]["StockEntry"] & {
  /** In GrocyProduct.qu_id_stock units. */
  amount: number;
  amount_allotted: number;
};

export type GrocyStockLogEntry = components["schemas"]["StockLogEntry"] & {
  amount: number;
  product_id: number;
};
type GrocyQUConversion = {
  id: number;
  from_qu_id: number;
  to_qu_id: number;
  factor: number;
  //product_id?: number;
};
export type GrocyBarcode = components["schemas"]["ProductBarcode"] & {
  id: number;
  product_id: number;
  barcode: string;
  userfields?: Record<string, string>;
};

export type GrocyShoppingListItem =
  & components["schemas"]["ShoppingListItem"]
  & {
    id: number;
    shopping_list_id: number;
    product_id: number;
    done: number;
  };
export type GrocyProductGroup = {
  id: number;
  name: string;
};

export type GrocyShoppingList = {
  id: number;
  name: string;
};

/** Product purchasing or consumption packaging units.
 *
 * eg.: A *Box* of cerial contains x *Bags* of cerial.
 * Thus *Box* and *Bag* are packaging units of the product cerial.
 * *Box* is the purchase pu and *Bag* is the consumption pu.
 */
export type GrocyPackagingUnit = {
  name: string;
  /** In GrocyProduct.qu_id_stock units. */
  amount: number;
  /** Packaging unit amount formated for display */
  amount_display: string;
};
export type GrocyData = {
  barcode: GrocyBarcode;
  /** In increasing order of PackagingUnit.amount
   * with the default consume *Packaging Unit* at index 0.
   */
  packaging_units: GrocyPackagingUnit[];
  product_details: GrocyProductDetails;
  product_group: GrocyProductGroup;
  stock: GrocyStockEntry[];
  stock_log: GrocyStockLogEntry[];
  shopping_list_items: GrocyShoppingListItem[];
  timestamp?: string;
};

type GrocyErrorReply =
  | components["schemas"]["Error400"]
  | components["schemas"]["Error500"];
