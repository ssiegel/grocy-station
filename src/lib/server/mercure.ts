// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Server-side Mercure SSE client.
 *
 * Maintains a single SSE connection to Grocy's built-in Mercure hub and
 * fans out `db-changed` notifications to registered listeners.
 * Handles JWT token refresh (we reconnect 2 minutes before expiry).
 */

import { env } from "$env/dynamic/private";
import { EventSource } from "eventsource";

let eventSource: EventSource | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
let pollInterval: ReturnType<typeof setInterval> | undefined;
let lastKnownChangedTime: string | undefined;
const DEBOUNCE_MS = 200;
const POLL_INTERVAL_MS = 15_000;
const listeners = new Set<(changedTime: string) => void>();

function notifyListeners(changedTime: string) {
    for (const listener of listeners) {
        // Isolate listeners: a throw from one client's stream must not stop
        // delivery to the others, nor escape the timer that called us.
        try {
            listener(changedTime);
        } catch (e) {
            console.error("Mercure: listener failed:", e);
        }
    }
}

function startFallbackPolling() {
    if (pollInterval) return;
    console.log("Mercure: starting fallback polling.");
    pollInterval = setInterval(() => void pollDbChanged(), POLL_INTERVAL_MS);
}

function stopFallbackPolling() {
    if (!pollInterval) return;
    clearInterval(pollInterval);
    pollInterval = undefined;
    void pollDbChanged(); // Final poll to catch any changes before SSE connection was restored.
    console.log("Mercure: stopped fallback polling.");
}

async function pollDbChanged(): Promise<void> {
    try {
        const res = await fetch(
            `${env.GROCY_BASE_URL}/system/db-changed-time`,
            { headers: { "GROCY-API-KEY": env.GROCY_API_KEY ?? "" } },
        );
        if (!res.ok) return;
        const { changed_time } = (await res.json()) as { changed_time: string };
        if (changed_time && changed_time !== lastKnownChangedTime) {
            lastKnownChangedTime = changed_time;
            notifyListeners(changed_time);
        }
    } catch (e) {
        console.warn("Mercure: fallback poll failed:", e);
    }
}

async function fetchSubscriberToken(): Promise<{ token: string; exp: number }> {
    const res = await fetch(`${env.GROCY_BASE_URL}/system/mercure-auth`, {
        headers: { "GROCY-API-KEY": env.GROCY_API_KEY ?? "" },
    });
    if (!res.ok) {
        throw new Error(
            `Failed to fetch Mercure subscriber token: ${res.status} ${res.statusText}`,
        );
    }
    const { token } = (await res.json()) as { token: string };

    // Decode exp from JWT payload (middle segment, base64url-encoded)
    const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
    ) as { exp: number };
    return { token, exp: payload.exp };
}

async function connect(): Promise<void> {
    if (!env.GROCY_BASE_URL) {
        console.warn("Mercure: GROCY_BASE_URL not set, skipping SSE connection.");
        return;
    }

    try {
        const { token, exp } = await fetchSubscriberToken();

        // Schedule token refresh: reconnect 2 minutes before expiry,
        // but no later than in 7.5 minutes and no sooner than in 1 minute.
        clearTimeout(refreshTimeout);
        const refreshInSeconds = Math.min(450, Math.max(60,
            (exp - Math.floor(Date.now() / 1000) - 120)
        ));
        refreshTimeout = setTimeout(() => void connect(), refreshInSeconds * 1000);

        const url = new URL("/.well-known/mercure", env.GROCY_BASE_URL);
        url.searchParams.set("topic", "grocy/db-changed");
        url.searchParams.set("authorization", token);

        const newEventSource = new EventSource(url.toString());

        newEventSource.onopen = () => {
            // New connection is confirmed alive, stop any fallback polling and close the old connection.
            stopFallbackPolling();
            if (eventSource) {
                eventSource.onmessage = null;
                eventSource.onerror = null;
                eventSource.close();
            } else {
                console.log(
                    `Mercure: SSE connection established (token refresh in ${refreshInSeconds}s)`,
                );
            }
            eventSource = newEventSource;
        };

        newEventSource.onmessage = (event: MessageEvent) => {
            try {
                const { changed_time } = JSON.parse(event.data as string) as {
                    changed_time: string;
                };
                // Debounce: the server often fires multiple events in rapid succession
                // (e.g. two writes per transaction, or event before commit finishes).
                // We wait DEBOUNCE_MS after the *last* event before notifying listeners.
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    lastKnownChangedTime = changed_time;
                    notifyListeners(changed_time);
                }, DEBOUNCE_MS);
            } catch (e) {
                console.error("Mercure: failed to parse event:", e);
            }
        };

        newEventSource.onerror = () => {
            console.warn("Mercure: SSE connection error, reconnecting in 5s...");
            newEventSource.onmessage = null;
            newEventSource.onerror = null;
            newEventSource.close();
            if (eventSource === newEventSource) {
                eventSource = null;
            }
            startFallbackPolling();
            clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => void connect(), 5_000);
        };
    } catch (e) {
        console.error("Mercure: failed to connect:", e);
        startFallbackPolling();
        clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => void connect(), 5_000);
    }
}

/**
 * Register a callback that fires whenever Grocy's database changes.
 * Returns an unsubscribe function.
 */
export function onDbChanged(
    callback: (changedTime: string) => void,
): () => void {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

// Start the connection when the module is first imported (server startup).
void connect();
