// SPDX-FileCopyrightText: © 2024 [these people](https://github.com/sveltejs/cli/graphs/contributors)
// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: MIT

import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// Augmenting Svelte's svelteHTML interfaces requires a namespace, and the
		// type parameters of the augmented interfaces go unused by construction.
		files: ['**/*.d.ts', 'src/lib/pressaction.svelte.ts'],
		rules: {
			'@typescript-eslint/no-namespace': 'off',
			'@typescript-eslint/no-unused-vars': 'off'
		}
	},
	{
		ignores: ['.svelte-kit/', 'build/', 'src/lib/types/grocy-api.d.ts']
	}
);
