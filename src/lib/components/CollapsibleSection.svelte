<script lang="ts">
    import type { Snippet } from "svelte";
    import WhiteButton from "./WhiteButton.svelte";

    interface Props {
        header: string;
        onclose: () => void;
        children: Snippet;
        buttons?: Snippet[];
    }
    let {header, onclose, children, buttons}: Props  = $props();
    let expanded = $state(false)

    function onClick() {
        // on close
        if (expanded) {
            onclose()
        }
        expanded = !expanded
    }
</script>

<div class="flex flex-row gap-2 items-center justify-start">
    <WhiteButton
        onclick={onClick}
        selected={expanded}
        modifiers="self-stretch"
        >
        {header}
    </WhiteButton>
    {#if buttons}
        {#each buttons as button}
            {@render button()}
        {/each}
    {/if}
</div>
<div hidden={!expanded}>
        {@render children()}
</div>
