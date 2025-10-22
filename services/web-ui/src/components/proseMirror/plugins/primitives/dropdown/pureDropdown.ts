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
    tags?: string[]
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
    renderIconForSelectedValue?: boolean
    renderIconForOptions?: boolean
    renderTitleForSelectedValue?: boolean
    enableTagFilter?: boolean
    availableTags?: string[]
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
        renderIconForSelectedValue = true,
        renderIconForOptions = true,
        renderTitleForSelectedValue = true,
        enableTagFilter = false,
        availableTags = [],
        onSelect
    } = config

    let currentSelectedValue = selectedValue
    let submenuRef: HTMLElement | null = null
    let activeFilterTags: Set<string> = new Set()
    let allOptions = [...options]

    // Handle toggle
    const toggleHandler = (e: Event) => {
        console.log('[AI_DBG][PURE_DROPDOWN.toggle]', { id })
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        if (dropdownStateManager.isOpen(id)) {
            dropdownStateManager.close(id)
        } else {
            dropdownStateManager.open(id)
        }
    }

    // Prevent ProseMirror from handling mousedown on dropdown
    const preventProseMirrorEdit = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
    }

    // Handle option click
    const optionClickHandler = (e: Event, option: DropdownOption) => {
        console.log('[AI_DBG][PURE_DROPDOWN.optionClick]', { id, option })
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

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

    // Filter options based on active tags
    const getFilteredOptions = () => {
        if (!enableTagFilter || activeFilterTags.size === 0) {
            return allOptions
        }
        return allOptions.filter(option => {
            if (!option.tags || option.tags.length === 0) return false
            return Array.from(activeFilterTags).every(filterTag => option.tags.includes(filterTag))
        })
    }

    // Handle tag filter click
    const handleTagFilterClick = (e: Event, tag: string) => {
        e.preventDefault()
        e.stopPropagation()

        // Visual click feedback
        const target = e.currentTarget as HTMLElement
        if (target) {
            target.classList.add('click-feedback')
            setTimeout(() => target.classList.remove('click-feedback'), 150)
        }

        if (activeFilterTags.has(tag)) {
            activeFilterTags.delete(tag)
        } else {
            activeFilterTags.add(tag)
        }

        // Re-render options list
        renderOptionsList()

        // Update tag filter UI
        updateTagFilterUI()
    }

    // Render options list based on current filter (single source of truth)
    const renderOptionsList = () => {
        const submenuList = dom.querySelector('.submenu')
        if (!submenuList) return

        const filteredOptions = getFilteredOptions()

        submenuList.innerHTML = ''
        filteredOptions.forEach(option => {
            const li = html`
                <li
                    class="flex justify-start items-center"
                    onclick=${(e: Event) => optionClickHandler(e, option)}
                >
                    ${renderIconForOptions && option.icon ? html`<span innerHTML=${ignoreColorValuesForOptions ? option.icon : injectFillColor(option.icon, option.color)}></span>` : ''}
                    ${option.title}
                </li>
            ` as HTMLElement
            submenuList.appendChild(li)
        })
    }

    // Update tag filter UI to show active state
    const updateTagFilterUI = () => {
        const tagFilterElements = dom.querySelectorAll('.tag-filter-item')
        tagFilterElements.forEach(el => {
            const tag = el.getAttribute('data-tag')
            if (tag && activeFilterTags.has(tag)) {
                el.classList.add('active')
            } else {
                el.classList.remove('active')
            }
        })
    }

    // Build DOM
    const dom = html`
        <div class="dropdown-menu-tag-pill-wrapper theme-${theme}" data-dropdown-id="${id}" contenteditable="false">
            <span class="dots-dropdown-menu">
                <button
                    class="flex justify-between items-center"
                    onclick=${toggleHandler}
                    onmousedown=${preventProseMirrorEdit}
                    contenteditable="false"
                >
                    <span class="selected-option-icon flex items-center"></span>
                    <span class="title"></span>
                    <span class="state-indicator flex items-center">
                        <span innerHTML=${buttonIcon}></span>
                    </span>
                </button>
                <nav class="submenu-wrapper render-position-${renderPosition}" contenteditable="false">
                    ${enableTagFilter && availableTags.length > 0 ? html`
                        <div class="tag-filter" onmousedown=${preventProseMirrorEdit}>
                            <div class="tag-filter-title">Filter by capability:</div>
                            <div class="tag-filter-list">
                                ${availableTags.map(tag => html`
                                    <span
                                        class="tag-filter-item"
                                        data-tag="${tag}"
                                        onclick=${(e: Event) => handleTagFilterClick(e, tag)}
                                    >${tag}</span>
                                `)}
                            </div>
                        </div>
                    ` : ''}
                    <ul class="submenu"></ul>
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
            titleEl.textContent = renderTitleForSelectedValue ? (currentSelectedValue?.title || '') : ''
        }

        if (iconWrap) {
            if (renderIconForSelectedValue && currentSelectedValue?.icon) {
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
    renderOptionsList()

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
