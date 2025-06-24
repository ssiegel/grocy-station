// SPDX-FileCopyrightText: © 2025 Stefan Siegel <ssiegel@sdas.net>
//
// SPDX-License-Identifier: AGPL-3.0-or-later

declare global {
    namespace svelteHTML {
        interface HTMLAttributes<T> {
            'onlongpress'?: () => unknown;
            'onshortpress'?: () => unknown;
        }
    }
}

import type { Action } from "svelte/action";

export const pressaction: Action = (node) => {
    const LONG_PRESS_THRESHOLD_MS = 500;
    const MOVE_THRESHOLD_PX = 5;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = false;
    let startX = 0;
    let startY = 0;

    function clearTimer() {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    }

    function handleDown(event: Event) {
        event.preventDefault();
        clearTimer();
        active = true;
        if (event instanceof PointerEvent) {
            startX = event.clientX;
            startY = event.clientY;
        }
        timer = setTimeout(() => {
            active = false;
            node.dispatchEvent(new CustomEvent("longpress"));
        }, LONG_PRESS_THRESHOLD_MS);
    }

    function handleUp(event: Event) {
        void event;
        clearTimer();
        if (active) node.dispatchEvent(new CustomEvent("shortpress"));
        active = false;
    }

    function handleMove(event: Event) {
        if (
            active &&
            event instanceof PointerEvent &&
            Math.hypot(event.clientX - startX, event.clientY - startY) >=
                MOVE_THRESHOLD_PX
        ) {
            clearTimer();
            active = false;
        }
    }

    function handleLeave(event: Event) {
        void event;
        clearTimer();
        active = false;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleDown(event);
        }
    }

    function handleKeyup(event: KeyboardEvent) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleUp(event);
        }
    }

    $effect(() => {
        node.addEventListener("pointerdown",  handleDown);
        node.addEventListener("pointerup",    handleUp);
        node.addEventListener("pointermove",  handleMove);
        node.addEventListener("pointerleave", handleLeave);
        node.addEventListener("keydown",      handleKeydown);
        node.addEventListener("keyup",        handleKeyup);

        return () => {
            clearTimer();
            node.removeEventListener("pointerdown",  handleDown);
            node.removeEventListener("pointerup",    handleUp);
            node.removeEventListener("pointermove",  handleMove);
            node.removeEventListener("pointerleave", handleLeave);
            node.removeEventListener("keydown",      handleKeydown);
            node.removeEventListener("keyup",        handleKeyup);
        };
    });
};
