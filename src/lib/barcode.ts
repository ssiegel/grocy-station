// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Aim,
  type BarcodeData,
  Detector,
  GS1,
} from "@point-of-sale/barcode-parser";

export function parseBarcode(payload: Buffer): BarcodeData {
  let result: BarcodeData = {
    value: payload.toString(),
    bytes: Array.from(payload),
    grocy: undefined,
  };
  if (result.value.startsWith("]")) {
    result.aim = result.value.slice(0, 3);
    result.value = result.value.slice(3);
    result = Object.assign(result, Aim.decode(result.aim, result.value));
  } else {
    result = Object.assign(result, Detector.detect(result.value));
  }

  // There is an internal mismatch between Aim.decode() and GS1.parse regarding ITF barcode
  // format. Work around the issue by temporarily renaiming interleaved-2-of-5 to it
  if (result.symbology === "interleaved-2-of-5") {
    result.symbology = "itf";
  }

  let gs1 = GS1.parse(result);
  if (gs1) {
    result.data = gs1;
  }

  if (result.symbology === "itf") {
    result.symbology = "interleaved-2-of-5";
  }

  if (result.data?.gtin) {
    const zerocount = result.data.gtin.match(/^0*/)?.[0].length ?? 0;
    if (zerocount >= 6) {
      result.grocy = result.data.gtin.slice(6);
    } else if (zerocount >= 1) {
      result.grocy = result.data.gtin.slice(1);
    } else {
      result.grocy = result.data.gtin;
    }
  } else if (
    result.symbology === "data-matrix" && !result.fnc1 &&
    result.value.startsWith("grcy:")
  ) {
    // Grocy seems to choke on slashes in the barcode, so substitute them
    result.grocy = result.value.replace(/\//g, "\u2044");
  }
  return result;
}
