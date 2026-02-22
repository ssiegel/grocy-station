// SPDX-FileCopyrightText: © 2024 [these people](https://github.com/sveltejs/cli/graphs/contributors)
// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: MIT

import inlineSvg from "@svelte-put/inline-svg/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { version } from './package.json';

let app_version: string = version;
if (existsSync(".git")) {
  // The git command may not be available in the build environment,
  // so we read the commit hash directly from the .git directory.
  // .git/HEAD can either contain the commit hash directly (detached HEAD)
  // or a reference to a branch (e.g. "ref: refs/heads/main")

  let commitHash = readFileSync(".git/HEAD", "utf-8").trim();
  if (commitHash.startsWith("ref: "))
    commitHash = readFileSync(`.git/${commitHash.substring(5)}`, "utf-8").trim();

  app_version += `-${commitHash.substring(0, 7)}`;
}

console.log(`Building Grocy Station version ${app_version}`);

export default defineConfig({
  plugins: [
    inlineSvg([{ directories: "src/assets/icons" }]),
    sveltekit(),
  ],
  define: {
    '__APP_VERSION__': JSON.stringify(app_version)
  },
});
