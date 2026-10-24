// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CollapsibleSectionHarness from './CollapsibleSectionHarness.svelte';

/** The toggle, which is the only part of the header that collapses. */
function toggle(): HTMLElement {
	return screen.getByRole('button', { name: /Stock/ });
}

describe('CollapsibleSection', () => {
	test('shows its title and reports whether it is expanded', () => {
		render(CollapsibleSectionHarness, { expanded: true });
		expect(toggle().getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByTestId('body')).toBeTruthy();
	});

	test('hides the body when collapsed', () => {
		render(CollapsibleSectionHarness, { expanded: false });
		expect(toggle().getAttribute('aria-expanded')).toBe('false');
		// The body stays in the DOM behind the hidden attribute, so assert on
		// what the user can actually see.
		expect(screen.getByTestId('body')).not.toBeVisible();
	});

	test('collapses when the title is pressed', async () => {
		render(CollapsibleSectionHarness, { expanded: true });
		toggle().click();
		expect(await screen.findByTestId('body')).not.toBeVisible();
	});

	test('expands again when pressed a second time', async () => {
		render(CollapsibleSectionHarness, { expanded: false });
		toggle().click();
		expect(await screen.findByTestId('body')).toBeVisible();
	});

	test('shows the summary only while collapsed', async () => {
		render(CollapsibleSectionHarness, {
			expanded: false,
			summary: '1.5 l · 2 entries'
		});
		expect(screen.getByText(/1\.5 l · 2 entries/)).toBeTruthy();

		toggle().click();
		// Expanded, the body says it instead and the preview is redundant.
		await vi.waitFor(() => {
			expect(screen.queryByText(/1\.5 l · 2 entries/)).toBeNull();
		});
	});

	test('calls onclose when collapsing, but not when expanding', async () => {
		const onclose = vi.fn();
		render(CollapsibleSectionHarness, { expanded: true, onclose });

		toggle().click();
		await vi.waitFor(() => expect(onclose).toHaveBeenCalledOnce());

		toggle().click();
		await vi.waitFor(() => expect(screen.getByTestId('body')).toBeVisible());
		expect(onclose).toHaveBeenCalledOnce();
	});

	test('does not collapse when an action in the header is pressed', async () => {
		const onaction = vi.fn();
		render(CollapsibleSectionHarness, { expanded: true, onaction });

		// The actions act on the section's contents, so hitting one must not
		// put those contents away.
		screen.getByRole('button', { name: 'Consume' }).click();
		await vi.waitFor(() => expect(onaction).toHaveBeenCalledOnce());
		expect(screen.getByTestId('body')).toBeVisible();
		expect(toggle().getAttribute('aria-expanded')).toBe('true');
	});
});
