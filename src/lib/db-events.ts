// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Client-side SSE connection to the SvelteKit server's db-events endpoint.
 *
 * The server maintains a single Mercure subscription to Grocy and fans out
 * db-changed notifications through `/api/db-events`. This module connects
 * to that endpoint and forwards change events to the active ProductState.
 *
 * The browser-native EventSource auto-reconnects on transient failures.
 * An `onerror` handler covers the edge case where EventSource gives up
 * (readyState === CLOSED), e.g. if the server briefly returns non-200
 * during a restart.
 */

import { ProductState, type Page } from "$lib/state.svelte";

const RECONNECT_MS = 5_000;

let eventSource: EventSource | undefined;
let page: Page | undefined;

function attach(es: EventSource) {
  es.onmessage = (event) => {
    // const { changed_time } = JSON.parse(event.data) as { changed_time: string };
    if (page?.state instanceof ProductState) {
      void page.state.onDbChanged();
    }
  };

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      // Permanent failure — native auto-reconnect won't kick in.
      // Retry manually after a delay.
      console.warn("db-events: SSE closed permanently, retrying in 5s…");
      es.close();
      setTimeout(() => connect(), RECONNECT_MS);
    }
    // readyState === CONNECTING means native auto-reconnect is active.
  };
}

function connect() {
  eventSource = new EventSource("/api/db-events");
  attach(eventSource);
}

export function setupDbEvents(p: Page) {
  page = p;
  connect();
}

export function disconnectDbEvents() {
  eventSource?.close();
  eventSource = undefined;
  page = undefined;
}
