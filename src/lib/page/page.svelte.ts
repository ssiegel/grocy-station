export let progress = $state({ current: 0 });
export let standbyMessage = $state({ current: 'Initializing…' });

export function AbortTimeoutController() {
    const API_TIMEOUT_MS = 10_000;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    return ctrl;
}