// SPDX-FileCopyrightText: © 2024 [these people](https://github.com/sveltejs/cli/graphs/contributors)
//
// SPDX-License-Identifier: MIT

/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte'],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};

export default config;
