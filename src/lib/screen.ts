// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
// SPDX-FileCopyrightText: © 2025 Tiago Sanona <tsanona@gmail.com>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

type ScreenOffListener = () => void;
const screenOffListeners = new Set<ScreenOffListener>();

/**
 * Registers *listener* to run whenever the backlight turns off.
 * Returns a function that unregisters it.
 */
export function onScreenOff(listener: ScreenOffListener): () => void {
	screenOffListeners.add(listener);
	return () => screenOffListeners.delete(listener);
}

function screenOff() {
	// Calling window.fully?.turnScreenOff?.() here would be straightforward, but we're
	// running into (deep) sleep and reactivation issues, so just turn off the backlight.
	// @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
	window.fully?.runSuCommand?.('printf 0 > /sys/class/leds/lcd-backlight/brightness');
	for (const listener of screenOffListeners) {
		listener();
	}
}
export const screenOn = (() => {
	let screentimeout = undefined as ReturnType<typeof setTimeout> | undefined;
	return function (timeout?: number) {
		clearTimeout(screentimeout);
		// @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
		window.fully?.turnScreenOn?.();
		// @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
		window.fully?.runSuCommand?.('printf 255 > /sys/class/leds/lcd-backlight/brightness');
		if (timeout) {
			screentimeout = setTimeout(screenOff, timeout);
		}
	};
})();
