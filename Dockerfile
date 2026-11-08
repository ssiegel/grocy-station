# SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
#
# SPDX-License-Identifier: AGPL-3.0-or-later

FROM docker.io/denoland/deno:debian-2.9.7 as sources
WORKDIR /work

COPY package.json deno.lock ./
RUN deno install

COPY . .
ARG GIT_HEAD
RUN if [ -n "$GIT_HEAD" ]; then mkdir -p .git && echo "$GIT_HEAD" > .git/HEAD; fi

# Formatting, linting, type check and unit tests. Nothing copies from this
# stage, so it is not in the dependency graph of the default target and a plain
# `docker build` skips it; `docker build --target test` runs it and fails the
# build on a red test.
#
# Keeping it here rather than in the pipeline means the checks are defined
# once, run identically on a laptop and in CI, and need no language-specific
# setup from whatever workflow invokes them.
FROM sources AS test
RUN deno task format:check . \
    && deno task lint \
    && deno task check \
    && deno task test

FROM sources AS builder
RUN deno task build && cd build && deno install

FROM docker.io/denoland/deno:distroless-2.9.7
WORKDIR /app
COPY --from=builder /work/build .

CMD ["--no-prompt", "--allow-env", "--allow-net", "--allow-read", "index.js"]
