// SPDX-FileCopyrightText: © 2024 [these people](https://github.com/sveltejs/cli/graphs/contributors)
//
// SPDX-License-Identifier: MIT

import { inlineSvg } from "@svelte-put/inline-svg/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    inlineSvg([{ directories: "src/assets/icons" }]),
    sveltekit(),
  ],
});
