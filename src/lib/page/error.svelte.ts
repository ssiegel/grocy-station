import { progress, standbyMessage } from "$lib/page/page.svelte";

export let error = $state({ message: '', timeout: undefined as ReturnType<typeof setTimeout> | undefined });

export function showError(message?: string, timeout?: number) {
    clearTimeout(error.timeout);
    progress.current = 0;
    if (message) {
        error.message = message;
    } else {
        error.message = '';
        standbyMessage.current = 'Please scan a barcode.';
    }
    if (timeout) {
        error.timeout = setTimeout(() => {
            error.message = '';
            error.timeout = undefined;
            standbyMessage.current = 'Please scan a barcode.';
        }, timeout);
    }
}