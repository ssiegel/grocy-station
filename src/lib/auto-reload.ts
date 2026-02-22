// SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Auto-reload functionality to detect server restarts and refresh the page.
 *
 * This module embeds the server version into the client code.
 * It periodically checks if the running server version matches the client's embedded version.
 * If they differ, the page is reloaded to fetch the new client code.
 */

const HEALTH_CHECK_INTERVAL = 10_000;
const HEALTH_ENDPOINT = '/api/health';
const CLIENT_VERSION = __APP_VERSION__;

let checkInterval: ReturnType<typeof setInterval>;

async function checkServerVersion() {
    try {
        const response = await fetch(HEALTH_ENDPOINT, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok)
            throw new Error(`Health check failed: ${response.status}`);

        const data = await response.json();

        if (data.version !== CLIENT_VERSION) {
            console.log('Server version mismatch detected, reloading page...', {
                clientVersion: CLIENT_VERSION,
                serverVersion: data.version
            });
            window.location.reload();
        }
    } catch (error) {
        console.warn('Health check error:', error);
    }
}

export function startAutoReload() {
    if (checkInterval) {
        console.warn('Auto-reload already started');
        return;
    }

    checkInterval = setInterval(checkServerVersion, HEALTH_CHECK_INTERVAL);

    console.log('Auto-reload monitoring started', {
        clientVersion: CLIENT_VERSION, checkInterval: HEALTH_CHECK_INTERVAL
    });
}

export function stopAutoReload() {
    clearInterval(checkInterval);
    console.log('Auto-reload monitoring stopped');
}
