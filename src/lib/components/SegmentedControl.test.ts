// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SegmentedControl from '$lib/components/SegmentedControl.svelte';

const options = [
	{ label: 'Glass', sublabel: '0.2 l' },
	{ label: 'Carton', sublabel: '1 l' },
	{ label: 'Pack', sublabel: '4 l' }
];

function renderControl(props: Partial<{ selectedIndex: number; defaultIndex: number }> = {}) {
	const onselect = vi.fn();
	render(SegmentedControl, {
		options,
		selectedIndex: props.selectedIndex ?? 1,
		defaultIndex: props.defaultIndex,
		onselect
	});
	return { onselect };
}

/** The marker dot, which has no accessible role of its own. */
function marker(cell: HTMLElement): Element | null {
	return cell.querySelector("[aria-label='default']");
}

describe('SegmentedControl', () => {
	test('renders a cell per option, with its sublabel', () => {
		renderControl();
		const cells = screen.getAllByRole('radio');
		expect(cells).toHaveLength(3);
		expect(cells[0].textContent).toContain('Glass');
		expect(cells[0].textContent).toContain('0.2 l');
	});

	test('marks only the selected cell as checked', () => {
		renderControl({ selectedIndex: 1 });
		const checked = screen.getAllByRole('radio').map((c) => c.getAttribute('aria-checked'));
		expect(checked).toEqual(['false', 'true', 'false']);
	});

	test('checks nothing when the value matches no option', () => {
		renderControl({ selectedIndex: -1 });
		expect(
			screen.getAllByRole('radio').every((c) => c.getAttribute('aria-checked') === 'false')
		).toBe(true);
	});

	test('reports the index pressed, not the value', () => {
		const { onselect } = renderControl();
		screen.getAllByRole('radio')[2].click();
		expect(onselect).toHaveBeenCalledExactlyOnceWith(2);
	});

	test('puts the marker on the default cell', () => {
		renderControl({ selectedIndex: 0, defaultIndex: 1 });
		const cells = screen.getAllByRole('radio');
		expect(marker(cells[1])).not.toBeNull();
		expect(marker(cells[0])).toBeNull();
		expect(marker(cells[2])).toBeNull();
	});

	test('keeps the marker when the default is itself selected', () => {
		// It goes dark rather than away: it still says which cell is the
		// default, which is worth knowing having just returned to it.
		renderControl({ selectedIndex: 1, defaultIndex: 1 });
		expect(marker(screen.getAllByRole('radio')[1])).not.toBeNull();
	});

	test('shows no marker when there is no default', () => {
		renderControl({ selectedIndex: 1, defaultIndex: undefined });
		expect(screen.getAllByRole('radio').every((c) => marker(c) === null)).toBe(true);
	});
});
