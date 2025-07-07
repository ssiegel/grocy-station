// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { pageState } from "$lib/state.svelte";

export function showError(message?: string, timeout?: number) {
    clearTimeout(pageState.error.timeout);
    pageState.progress = 0;
    if (message) {
        pageState.error.message = message;
    } else {
        pageState.error.message = '';
        pageState.standbyMessage = 'Please scan a barcode.';
    }
    if (timeout) {
        pageState.error.timeout = setTimeout(() => {
            pageState.error.message = '';
            pageState.error.timeout = undefined;
            pageState.standbyMessage = 'Please scan a barcode.';
        }, timeout);
    }
}