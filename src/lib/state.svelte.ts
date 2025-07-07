import type { GrocyData } from "$lib/grocy"

export let lastchanged = { timestamp: undefined as string | undefined, interval: undefined as ReturnType<typeof setInterval> | undefined };

type error = {
    message: string,
    timeout?: ReturnType<typeof setTimeout>
}

class PageState {
    progress = $state(0);
    grocyData?: GrocyData = $state(undefined);
    inputQuantity = $state('0');
    quantity = $derived(Number(this.inputQuantity));
    inputUnitsize = $state('0');
    unitSize = $derived(Number(this.inputUnitsize));
    conumeAmount = $derived(this.unitSize * this.quantity);
    consumeValid = $state(false);
    error: error = $state({
        message: '',
        timeout: undefined
    });
    standbyMessage = $state('Initializing…');
}

export const pageState = new PageState()