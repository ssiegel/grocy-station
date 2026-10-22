// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

// Unmounts whatever a test rendered once it finishes. Without it every
// render accumulates in the same document and a query for "the button"
// finds one per test that has run so far.
import "@testing-library/svelte/vitest";

// Matchers that assert against the DOM rather than against object shape,
// notably toBeVisible, which accounts for the hidden attribute a collapsed
// section uses.
import "@testing-library/jest-dom/vitest";
