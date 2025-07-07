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