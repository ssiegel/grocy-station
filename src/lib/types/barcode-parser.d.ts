// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

declare module '@point-of-sale/barcode-parser' {
    interface GS1Element {
        ai: string;
        label: string;
        value: string;
    }

    interface GS1Data {
        gtin: string;
        elements: Array<GS1Element>;
    }

    interface BarcodeData {
        value: string;
        bytes: Array<number>;
        aim?: string;
        symbology?: string;
        fnc1?: number | boolean;
        data?: GS1Data;
        grocy?: string;
    }

    class Aim {
        static decode(aim: string, value: string): BarcodeData;
    }

    class Detector {
        static detect(barcode: string): BarcodeData;
    }

    class GS1 {
        static parse(result: BarcodeData): GS1Data;
    }
}
