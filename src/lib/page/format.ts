import { GrocyObjectCache } from "$lib/page/page.svelte";

export function formatDate(date?: string): string {
        date ??= 'unknown';
        return date === '2999-12-31' ? 'never' : date;
}

export function formatUnit(unitId?: number): string {
        const unit = unitId !== undefined ? GrocyObjectCache.getCachedObject('quantity_units', unitId) : undefined;
        if (unit === undefined)
            return '';
        else if (unit.userfields?.symbol)
            return unit.userfields.symbol;
        // else if (unit.name_plural !== undefined)
        //     return unit.name_plural;
        else
            return unit.name;
    }