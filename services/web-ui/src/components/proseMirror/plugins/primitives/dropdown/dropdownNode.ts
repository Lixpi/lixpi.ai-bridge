// @ts-nocheck
import { html } from '../../../components/domTemplates.ts'
import { chevronDownIcon } from '../../../../../svgIcons/index.ts'

export const dropdownNodeType = 'dropdown'

export const dropdownNodeView = (node, view, getPos) => {
    const {
        id,
        selectedValue = {},
        dropdownOptions = [],
        theme = 'dark',
        renderPosition = 'bottom',
        buttonIcon = chevronDownIcon,
        ignoreColorValuesForOptions = false,
        ignoreColorValuesForSelectedValue = false
    } = node.attrs

    let submenuRef = null
    let dom = null

    // Handle toggle dropdown
    const toggleSubmenuHandler = (e, dropdownId) => {
        console.log('[AI_DBG][DROPDOWN.toggleSubmenuHandler] CALLED', { dropdownId, id, event: e.type, target: e.target })
        e.preventDefault()
        e.stopPropagation()

        const tr = view.state.tr.setMeta('toggleDropdown', { id: dropdownId })
        console.log('[AI_DBG][DROPDOWN.toggleSubmenuHandler] dispatching transaction', { dropdownId, hasMeta: !!tr.getMeta('toggleDropdown') })
        view.dispatch(tr)
        console.log('[AI_DBG][DROPDOWN.toggleSubmenuHandler] transaction dispatched', { dropdownId })
    }

    // Handle option click
    const onClickHandler = (e, dropdownId, option) => {
        e.preventDefault()
        e.stopPropagation()

        const pos = getPos()
        let tr = view.state.tr

        // Attach selection meta first
        if (option) {
            const selectionMeta = { dropdownId, option, nodePos: pos }
            console.log('[AI_DBG][DROPDOWN] option click', { dropdownId, option, nodePos: pos, currentThreadModel: node?.attrs?.aiModel, selectedValueBefore: node?.attrs?.selectedValue })
            tr = tr.setMeta('dropdownOptionSelected', selectionMeta)
        }

        // Always close dropdown after selection
        tr = tr.setMeta('closeDropdown', true)

        // Attempt immediate node attr update (optimistic UI) BEFORE dispatching
        if (typeof pos === 'number') {
            const currentNode = view.state.doc.nodeAt(pos)
            if (currentNode?.type?.name === dropdownNodeType) {
                const updatedAttrs = { ...currentNode.attrs, selectedValue: option }
                console.log('[AI_DBG][DROPDOWN] optimistic selectedValue update', { pos, updatedAttrs })
                tr = tr.setNodeMarkup(pos, undefined, updatedAttrs)
            } else {
                console.log('[AI_DBG][DROPDOWN] optimistic update skipped - node mismatch', { pos, foundType: currentNode?.type?.name })
            }
        } else {
            console.log('[AI_DBG][DROPDOWN] getPos() not number for optimistic update', { pos })
        }

        console.log('[AI_DBG][DROPDOWN] dispatching transaction with metas', {
            hasDropdownSelectionMeta: !!tr.getMeta('dropdownOptionSelected'),
            hasCloseDropdownMeta: !!tr.getMeta('closeDropdown'),
            trSteps: tr.steps.length
        })
        view.dispatch(tr)

        // Note: onClick handlers cannot be serialized in ProseMirror attributes
        // The dropdownOptionSelected meta event will be handled by the parent plugin
        if (option?.onClick && typeof option.onClick === 'function') {
            option.onClick(e, dropdownId)
        }
    }

    // Handle window click to close dropdown
    const handleWindowClick = (e) => {
        if (submenuRef && !e.composedPath().includes(submenuRef)) {
            const tr = view.state.tr.setMeta('closeDropdown', true)
            view.dispatch(tr)
        }
    }

    // Inject fill color utility (same as Svelte component)
    const injectFillColor = (svg, color) => {
        if (!svg || !color) {
            return svg || ''
        }
        return svg.replace(/<svg([\s\S]*?)>/, `<svg$1 style="fill: ${color}">`)
    }

    // Check if dropdown is open from decorations
    const isOpen = () => {
        const pluginKey = view.state.plugins.find(p => p.key && p.key.key === 'dropdown')?.key
        if (!pluginKey) {
            console.log('[AI_DBG][DROPDOWN.isOpen] NO PLUGIN KEY FOUND', { id, availablePlugins: view.state.plugins.map(p => p.key?.key || 'unnamed') })
            return false
        }

        const pluginState = pluginKey.getState(view.state)
        const open = pluginState?.openDropdownId === id
        console.log('[AI_DBG][DROPDOWN.isOpen] checked', { id, openDropdownId: pluginState?.openDropdownId, isOpen: open })
        return open
    }

    // Create the dropdown structure using html templates - GENERIC DROPDOWN ONLY
    const createDropdownDOM = () => {
        const dropdownDOM = html`
            <div class="dropdown-menu-tag-pill-wrapper theme-${theme}" data-dropdown-id="${id}">
                <span
                    class="dots-dropdown-menu"
                    onclick=${(e) => e.stopPropagation()}
                >
                    <button
                        class="flex justify-between items-center"
                        onclick=${(e) => toggleSubmenuHandler(e, id)}
                    >
                        <span class="selected-option-icon flex items-center">
                            ${selectedValue?.icon ? html`<span innerHTML=${ignoreColorValuesForSelectedValue ? selectedValue.icon : injectFillColor(selectedValue.icon, selectedValue.color)}></span>` : ''}
                        </span>
                        <span class="title">${selectedValue?.title || ''}</span>
                        <span class="state-indicator flex items-center">
                            <span innerHTML=${buttonIcon}></span>
                        </span>
                    </button>
                    <nav class="submenu-wrapper render-position-${renderPosition}">
                        <ul class="submenu">
                            ${dropdownOptions.map(option => html`
                                <li
                                    class="flex justify-start items-center"
                                    onclick=${(e) => onClickHandler(e, id, option)}
                                >
                                    ${option.icon ? html`<span innerHTML=${ignoreColorValuesForOptions ? option.icon : injectFillColor(option.icon, option.color)}></span>` : ''}
                                    ${option.title}
                                </li>
                            `)}
                        </ul>
                    </nav>
                </span>
            </div>
        `

        // Store reference to submenu for click detection
        submenuRef = dropdownDOM.querySelector('.dots-dropdown-menu')

        return dropdownDOM
    }

    // Initial DOM creation
    dom = createDropdownDOM()

    // Add window click listener
    document.addEventListener('click', handleWindowClick)

    return {
        dom,
        update: (updatedNode, decorations) => {
            if (updatedNode.type.name !== dropdownNodeType) {
                return false
            }

            // Detect selectedValue attr changes
            const prevSelected = node?.attrs?.selectedValue || {}
            const nextSelected = updatedNode?.attrs?.selectedValue || {}
            const nextIgnoreColorForSelectedValue = updatedNode?.attrs?.ignoreColorValuesForSelectedValue || false
            const changed = (prevSelected?.title !== nextSelected?.title) || (prevSelected?.icon !== nextSelected?.icon)
            if (changed) {
                console.log('[AI_DBG][DROPDOWN.update] selectedValue changed', { prevSelected, nextSelected })
                const titleEl = dom.querySelector('.title')
                if (titleEl) {
                    titleEl.textContent = nextSelected?.title || ''
                }
                const iconWrap = dom.querySelector('.selected-option-icon')
                if (iconWrap) {
                    if (nextSelected?.icon) {
                        iconWrap.innerHTML = ''
                        const span = document.createElement('span')
                        span.innerHTML = nextIgnoreColorForSelectedValue ? nextSelected.icon : injectFillColor(nextSelected.icon, nextSelected.color)
                        iconWrap.appendChild(span)
                    } else {
                        iconWrap.innerHTML = ''
                    }
                }
            }

            // Check if dropdown is open from decorations
            let hasDropdownOpen = Array.isArray(decorations) && decorations.some(d => {
                // For Decoration.node(), class is in d.type.attrs.class
                const cls = d?.type?.attrs?.class || d?.spec?.attrs?.class || ''
                const hasClass = typeof cls === 'string' && cls.split(/\s+/).includes('dropdown-open')
                return hasClass
            })

            // Toggle submenu visibility based on decoration state
            const submenuWrapper = dom.querySelector('.submenu-wrapper')
            if (submenuWrapper) {
                submenuWrapper.style.display = hasDropdownOpen ? 'block' : 'none'
            }

            // Update wrapper class for CSS animations
            dom.classList.toggle('dropdown-open', !!hasDropdownOpen)
            console.log('[AI_DBG][DROPDOWN.update] open state sync', { hasDropdownOpen, decorationsCount: Array.isArray(decorations) ? decorations.length : 'n/a' })

            // Update node reference
            node = updatedNode

            return true
        },
        destroy: () => {
            // Clean up window listener
            document.removeEventListener('click', handleWindowClick)
        }
    }
}