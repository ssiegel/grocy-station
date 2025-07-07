function screenOff() {
    // Calling window.fully?.turnScreenOff?.() here would be straightforward, but we're
    // running into (deep) sleep and reactivation issues, so just turn off the backlight.
    // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
    window.fully?.runSuCommand?.('printf 0 > /sys/class/leds/lcd-backlight/brightness');
}
export const screenOn = (() => {
    let screentimeout = undefined as ReturnType<typeof setTimeout> | undefined;
    return function (timeout?: number) {
        clearTimeout(screentimeout);
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.turnScreenOn?.();
        // @ts-expect-error TS2339: window.fully is Fully Kiosk Browser proprietary
        window.fully?.runSuCommand?.('printf 255 > /sys/class/leds/lcd-backlight/brightness');
        if (timeout)
            screentimeout = setTimeout(screenOff, timeout);
    };
})();