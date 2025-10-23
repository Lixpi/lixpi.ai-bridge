<script>
    import { popOutTransition } from '../../constants/svelteAnimationTransitions';

    import {
        verticalTrippleDots,
        chevronDownIcon,
        chevronUpIcon,
    } from '../../svgIcons'

    let {
        selectedValue = {},
        submenuState = $bindable({}),
        toggleSubmenuHandler,
        id,
        theme = 'light',
        renderPosition = 'bottom',
        dropdownOptions = [],
        buttonIcon = chevronDownIcon
    } = $props();

    let submenuRef = $state()

    $effect(() => {
        // console.log('submenuState', selectedValue)
    });

const onClickHandler = (e, id, onClick) => {
    submenuState[id] = false
    console.log('onClickHandler', {id, onClick})
    onClick(e, id)
}

const handleWindowClick = e => {
    if (!e.composedPath().includes(submenuRef)) {
        submenuState[id] = false
    }
}

const injectFillColor = (svg, color) => {
    if (!svg || !color) {
        return false
    }
    const svgWithColor = svg.replace(/<svg([\s\S]*?)>/, `<svg$1 style="fill: ${color}">`);
    return svgWithColor;
};
</script>

<svelte:window onclick={handleWindowClick}/>

<div class="dropdown-menu-tag-pill-wrapper theme-{theme}">
    <span class="dots-dropdown-menu" class:is-active={submenuState[id]} onclick={(e) => { e.stopPropagation() }} bind:this={submenuRef}>
        <button class="flex justify-between items-center" onclick={(e)=> toggleSubmenuHandler(e, id)}>
            <span class="selected-option-icon flex items-center">
                <!-- {@html selectedValue?.icon } -->
                {@html injectFillColor(selectedValue?.icon, selectedValue?.color)}
            </span>
            <span class="title">{selectedValue?.title}</span>
            <span class="state-indicator flex items-center">
                {@html buttonIcon}
            </span>
        </button>
        {#if submenuState[id] && dropdownOptions.length > 0}
            <nav
                class="submenu-wrapper render-position-{renderPosition}"
                in:popOutTransition|global={{duration: 300}}
                out:popOutTransition|global={{duration: 300}}
            >
                <ul class="submenu" class:with-header={dropdownOptions.some(o => o.type === 'header')}>
                    {#each dropdownOptions as option}
                        {#if option.type === 'header'}
                            <li class="flex justify-start items-center" data-type="header">
                                {#if option.icon}
                                    {@html option.icon}
                                {/if}
                                <span class="header-text">
                                    <span class="header-title">{option.title}</span>
                                    {#if option.meta}
                                        <span class="header-meta">{option.meta}</span>
                                    {/if}
                                </span>
                            </li>
                        {:else}
                            <li class="flex justify-start items-center" onclick={(e) => onClickHandler(e, id, option.onClick)}>
                                {#if option.icon}
                                    {@html option.icon}
                                    <!-- {@html injectFillColor(option.icon, option.iconColor)} -->
                                {/if}
                                {option.title}
                            </li>
                        {/if}
                    {/each}
                </ul>
            </nav>
        {/if}
    </span>
</div>

<style lang="scss"> //NOTE Shared SASS variables available globally
    @import '../../sass/components/tag-pill-dropdown';

    .dropdown-menu-tag-pill-wrapper {
        // Position wrapper
        @include dropdownChipWrapperPosition((
            position: absolute,
            right: 0,
            top: -1px // TODO hack for current prosemirror menubar placement
        ));

        // Trigger button
        @include dropdownTriggerStructure();

        // Dropdown items
        @include dropdownItemsStructure();

        // Bubble container
        @include infoBubblePlacement();
        @include infoBubbleStructure();

        // Themes
        &.theme-light {
            @include infoBubbleTheme((
                surfaceBg: $offWhite,
                surfaceFg: $nightBlue,
                bubbleShadow: $dropdownLightThemeSubmenuBoxShadow,
                borderLightnessAdjustment: -10%,
                hoverLightnessAdjustment: -6%
            ));
            @include tagPillDropdownLightTheme();
        }
        &.theme-dark {
            @include infoBubbleTheme((
                surfaceBg: $steelBlue,
                surfaceFg: $offWhite,
                bubbleShadow: $dropdownDarkThemeSubmenuBoxShadow,
                borderLightnessAdjustment: -10%,
                hoverLightnessAdjustment: -6%
            ));
            @include tagPillDropdownDarkTheme();
        }
    }
</style>
