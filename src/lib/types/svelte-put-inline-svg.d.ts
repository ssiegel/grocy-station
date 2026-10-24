// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

declare global {
	namespace svelteHTML {
		interface SVGAttributes<T> {
			'inline-src'?: string;
		}
	}
}

export {};
