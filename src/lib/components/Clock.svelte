<!--
SPDX-FileCopyrightText: © 2026 Stefan Siegel <ssiegel@sdas.net>
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        class?: string;
    }

    let { class: className = "" }: Props = $props();

    let currentTime = $state(Date.now());
    let updateClockTimer: ReturnType<typeof setTimeout>;
    function updateClock() {
        currentTime = Date.now();
        updateClockTimer = setTimeout(updateClock, 1000 - (currentTime % 1000));
    }

    onMount(() => {
        setTimeout(updateClock, 0);
        return () => {
            clearTimeout(updateClockTimer);
        };
    });
</script>

<div class={className}>
    {new Date(currentTime + 500)
        .toLocaleString("en-CA", {
            weekday: "long",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            hour12: false,
            minute: "2-digit",
            second: "2-digit",
        })
        .replaceAll(", ", "\u2002")}
</div>
