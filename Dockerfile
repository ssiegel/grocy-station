# SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
#
# SPDX-License-Identifier: AGPL-3.0-or-later

FROM denoland/deno:debian-2.6.10 as builder
WORKDIR /work

COPY package.json deno.lock ./
RUN deno install

COPY . .
ARG GIT_HEAD
RUN if [ -n "$GIT_HEAD" ]; then mkdir -p .git && echo "$GIT_HEAD" > .git/HEAD; fi
RUN deno task build && cd build && deno install

FROM denoland/deno:distroless-2.6.10
WORKDIR /app
COPY --from=builder /work/build .

CMD ["--no-prompt", "--allow-env", "--allow-net", "--allow-read", "index.js"]
