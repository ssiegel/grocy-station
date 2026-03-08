<script lang="ts">
    import type { Snippet } from "svelte";

    type ButtonInput = {
        children: Snippet;
        onclick: () => void;
        hidden?: boolean;
        modifiers?: string;
    }

    type ActionButtonInput = ButtonInput & {
        disabled: boolean;
        label: string;
    }

    type SelectButtonInput = ButtonInput & {
        selected: boolean;
    }

    const props = $props()
    let {children, onclick, modifiers}: ActionButtonInput | SelectButtonInput = props
    const selected = $derived(props.selected);
    const isActionButton = $derived(props.disabled !== undefined || props.label !== undefined && selected === undefined)
    const style = $derived((isActionButton || selected)?'btn':'input')
</script>


<button
    disabled={props.disabled}
    class="{'bg-@-bg-default hover:bg-@-bg-hover focus:bg-@-bg-focus active:bg-@-bg-active text-@-fg'.replaceAll(
        '@',
        style,
    )}
    {modifiers}
    {isActionButton?'disabled:text-btn-bg-focus px-4 py-4 h-full':'border-btn-bg-default hover:border-btn-bg-hover focus:border-btn-bg-focus active:border-btn-bg-active border-2 px-2 py-1 rounded'}
    rounded"
    aria-label={props.label}
    onclick={onclick}
    hidden={props.hidden??false}
>
    {@render children()}
</button>


<!-- btn | input
"border-btn-bg-default 
hover:border-btn-bg-hover
focus:border-btn-bg-focus
active:border-btn-bg-active
border-2 px-2 py-1 rounded"

btn
disabled:text-btn-bg-focus 
px-4 py-4 h-full rounded" -->