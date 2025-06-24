# SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
#
# SPDX-License-Identifier: AGPL-3.0-or-later

FROM denoland/deno:debian-2.3.6 as builder
MAINTAINER Stefan Siegel <ssiegel@sdas.net>

WORKDIR /work
COPY package.json deno.lock .
RUN deno install
COPY . .
RUN deno task build && cd build && deno install

FROM denoland/deno:distroless-2.3.6
WORKDIR /app
COPY --from=builder /work/build .

CMD ["--no-prompt", "--allow-env", "--allow-net", "--allow-read", "index.js"]
