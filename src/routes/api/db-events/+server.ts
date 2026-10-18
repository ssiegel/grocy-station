// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * SSE endpoint that fans out Grocy db-changed notifications to browser clients.
 *
 * The server maintains a single Mercure subscription (see $lib/server/mercure.ts)
 * and pushes events to all connected browsers through this endpoint.
 * This keeps the Grocy API key and Mercure tokens server-side.
 */

import { onDbChanged } from "$lib/server/mercure";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ request }) => {
    const encoder = new TextEncoder();
    let unlisten: (() => void) | undefined;
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    // SSE comment lines (starting with ':') are ignored by EventSource clients
    // but keep the TCP connection alive through reverse proxies that would
    // otherwise close idle connections.
    const KEEPALIVE_INTERVAL_MS = 30_000;

    const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        unlisten?.();
    };

    const stream = new ReadableStream({
        start(controller) {
            if (request.signal.aborted) {
                closed = true;
                controller.close();
                return;
            }
            request.signal.addEventListener("abort", cleanup);

            // An errored stream never invokes cancel(), so enqueue() must
            // guard itself instead.
            const send = (text: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(text));
                } catch {
                    cleanup();
                }
            };

            // Flush headers immediately; clients and proxies would otherwise
            // see no response at all until the first keepalive.
            send(": connected\n\n");

            unlisten = onDbChanged((changedTime) => {
                send(
                    `data: ${JSON.stringify({ changed_time: changedTime })}\n\n`,
                );
            });

            keepalive = setInterval(() => {
                send(": keepalive\n\n");
            }, KEEPALIVE_INTERVAL_MS);
        },
        cancel() {
            cleanup();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
};
