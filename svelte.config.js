// SPDX-FileCopyrightText: © 2024 [these people](https://github.com/sveltejs/cli/graphs/contributors)
// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import adapter from "@sveltejs/adapter-node";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import fs from "node:fs";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  compilerOptions: {
    experimental: {
      async: true,
    },
  },

  kit: {
    adapter: (() => {
      const nodeAdapter = adapter();
      return {
        ...nodeAdapter,
        adapt: async (builder) => {
          await nodeAdapter.adapt(builder);

          // In the production server we don't need the devDependencies,
          // but currently there is no way to skip them in "deno install"
          // cf. https://github.com/denoland/deno/issues/26121
          // this is a brute force workaround to remove them from package.json
          fs.copyFileSync("deno.lock", "build/deno.lock");
          const packageData = JSON.parse(
            fs.readFileSync("package.json", "utf-8"),
          );
          delete packageData.devDependencies;
          fs.writeFileSync(
            "build/package.json",
            JSON.stringify(packageData),
            "utf-8",
          );
        },
      };
    })(),
  },
};

export default config;
