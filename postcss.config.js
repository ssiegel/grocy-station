// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import fontmagician from "@sbsiegel/postcss-font-magician";

/** @type {import('postcss-load-config').Config}*/
export default {
  plugins: [
    //Some plugins, like tailwindcss/nesting, need to run before Tailwind,
    tailwindcss(),
    //But others, like autoprefixer, need to run after,
    autoprefixer(),
    fontmagician({
      foundries: ["hosted"],
      hosted: ["./src/assets/fonts"],
      formats: ["woff", "woff2"],
      display: "block", // prefer FOIT (block) over the default (?) FOUT (swap)
    }),
  ],
};
