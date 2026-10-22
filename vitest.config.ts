// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import inlineSvg from "@svelte-put/inline-svg/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately not the app's vite.config.ts: that one pulls in the SvelteKit
// plugin, which expects to be driving a real app and fights the test runner.
// The pieces the components actually need are the Svelte compiler and the
// icon inliner, so those are reproduced here and nothing else.
export default defineConfig({
  plugins: [
    inlineSvg([{ directories: "src/assets/icons" }]),
    svelte(),
  ],
  define: {
    // Referenced by auto-reload.ts, which some tests pull in transitively.
    "__APP_VERSION__": JSON.stringify("0.0.0-test"),
  },
  test: {
    // A rune only compiles in a file Svelte recognises as its own, which is
    // why the unit tests of rune-based state are named *.svelte.test.ts.
    include: ["src/**/*.{test,svelte.test}.ts"],
    // Component tests need a DOM; the pure ones do not care.
    environment: "jsdom",
  },
  resolve: {
    alias: {
      // Normally SvelteKit's plugin provides this. Spelled out because that
      // plugin is deliberately absent, see above.
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
    // Without this the testing library resolves Svelte's server build and
    // mounting a component fails.
    conditions: ["browser"],
  },
});
