// @ts-nocheck
import { html } from '../../../components/domTemplates.ts'
import { chevronDownIcon } from '../../../../../svgIcons/index.ts'
import { dropdownStateManager } from './dropdownStateManager.ts'

// Inject fill color utility (same as original dropdown)
function injectFillColor(svg: string, color: string): string {
    if (!svg || !color) {
        return svg || ''
    }
    return svg.replace(/<svg([\s\S]*?)>/, `<svg$1 style="fill: ${color}">`)
}

type DropdownOption = {
    title: string
    icon?: string
    color?: string
    [key: string]: any
}

type PureDropdownConfig = {
    id: string
    selectedValue: DropdownOption
    options: DropdownOption[]
    theme?: string
    renderPosition?: string
    buttonIcon?: string
    ignoreColorValuesForOptions?: boolean
    ignoreColorValuesForSelectedValue?: boolean
    onSelect: (option: DropdownOption) => void
}

export function createPureDropdown(config: PureDropdownConfig) {
    const {
        id,
        selectedValue,
        options,
        theme = 'dark',
        renderPosition = 'bottom',
        buttonIcon = chevronDownIcon,
        ignoreColorValuesForOptions = false,
        ignoreColorValuesForSelectedValue = false,
        onSelect
    } = config

    let currentSelectedValue = selectedValue
    let submenuRef: HTMLElement | null = null

    // Handle toggle
    const toggleHandler = (e: Event) => {
        console.log('[AI_DBG][PURE_DROPDOWN.toggle]', { id })
        e.preventDefault()
        e.stopPropagation()

        if (dropdownStateManager.isOpen(id)) {
            dropdownStateManager.close(id)
        } else {
            dropdownStateManager.open(id)
        }
    }

    // Handle option click
    const optionClickHandler = (e: Event, option: DropdownOption) => {
        console.log('[AI_DBG][PURE_DROPDOWN.optionClick]', { id, option })
        e.preventDefault()
        e.stopPropagation()

        // Update local state
        currentSelectedValue = option

        // Close dropdown
        dropdownStateManager.close(id)

        // Notify parent
        onSelect(option)

        // Update visual
        updateSelectedDisplay()
    }

    // Handle window click to close
    const handleWindowClick = (e: Event) => {
        if (submenuRef && !e.composedPath().includes(submenuRef)) {
            dropdownStateManager.close(id)
        }
    }

    // Build DOM
    const dom = html`
        <div class="dropdown-menu-tag-pill-wrapper theme-${theme}" data-dropdown-id="${id}">
            <span class="dots-dropdown-menu">
                <button class="flex justify-between items-center" onclick=${toggleHandler}>
                    <span class="selected-option-icon flex items-center"></span>
                    <span class="title"></span>
                    <span class="state-indicator flex items-center">
                        <span innerHTML=${buttonIcon}></span>
                    </span>
                </button>
                <nav class="submenu-wrapper render-position-${renderPosition}">
                    <ul class="submenu">
                        ${options.map(option => html`
                            <li
                                class="flex justify-start items-center"
                                onclick=${(e: Event) => optionClickHandler(e, option)}
                            >
                                ${option.icon ? html`<span innerHTML=${ignoreColorValuesForOptions ? option.icon : injectFillColor(option.icon, option.color)}></span>` : ''}
                                ${option.title}
                            </li>
                        `)}
                    </ul>
                </nav>
            </span>
        </div>
    ` as HTMLElement

    submenuRef = dom.querySelector('.dots-dropdown-menu')
    const submenuWrapper = dom.querySelector('.submenu-wrapper') as HTMLElement

    // Update selected value display
    const updateSelectedDisplay = () => {
        const titleEl = dom.querySelector('.title')
        const iconWrap = dom.querySelector('.selected-option-icon')

        if (titleEl) {
            titleEl.textContent = currentSelectedValue?.title || ''
        }

        if (iconWrap) {
            if (currentSelectedValue?.icon) {
                iconWrap.innerHTML = ''
                const span = document.createElement('span')
                span.innerHTML = ignoreColorValuesForSelectedValue
                    ? currentSelectedValue.icon
                    : injectFillColor(currentSelectedValue.icon, currentSelectedValue.color)
                iconWrap.appendChild(span)
            } else {
                iconWrap.innerHTML = ''
            }
        }
    }

    // Subscribe to open/close state
    const unsubscribe = dropdownStateManager.subscribe(id, (isOpen) => {
        console.log('[AI_DBG][PURE_DROPDOWN.stateChange]', { id, isOpen })
        if (submenuWrapper) {
            submenuWrapper.style.display = isOpen ? 'block' : 'none'
        }
        dom.classList.toggle('dropdown-open', isOpen)
    })

    // Initialize display
    updateSelectedDisplay()

    // Add window click listener
    document.addEventListener('click', handleWindowClick)

    return {
        dom,
        update: (newSelectedValue: DropdownOption) => {
            console.log('[AI_DBG][PURE_DROPDOWN.update]', { id, newSelectedValue })
            currentSelectedValue = newSelectedValue
            updateSelectedDisplay()
        },
        destroy: () => {
            console.log('[AI_DBG][PURE_DROPDOWN.destroy]', { id })
            // Close dropdown if it was open
            dropdownStateManager.close(id)
            unsubscribe()
            document.removeEventListener('click', handleWindowClick)
        }
    }
}
