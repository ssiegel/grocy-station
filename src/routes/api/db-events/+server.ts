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

export const GET: RequestHandler = () => {
    const encoder = new TextEncoder();
    let unlisten: (() => void) | undefined;

    const stream = new ReadableStream({
        start(controller) {
            unlisten = onDbChanged((changedTime) => {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ changed_time: changedTime })}\n\n`,
                    ),
                );
            });
        },
        cancel() {
            unlisten?.();
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
