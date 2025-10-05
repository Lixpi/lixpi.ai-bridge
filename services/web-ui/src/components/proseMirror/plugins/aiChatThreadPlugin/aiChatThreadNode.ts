// @ts-nocheck
import { keyboardMacCommandIcon, keyboardEnterKeyIcon, sendIcon, pauseIcon, chatThreadBoundariesInfoIcon, aiRobotFaceIcon, gptAvatarIcon, claudeIcon, chevronDownIcon, contextIcon } from '../../../../svgIcons/index.js'
import { TextSelection } from 'prosemirror-state'
import { AI_CHAT_THREAD_PLUGIN_KEY } from './aiChatThreadPluginKey.ts'
import { html } from '../../components/domTemplates.ts'
import { aiModelsStore } from '../../../../stores/aiModelsStore.js'
import { documentStore } from '../../../../stores/documentStore.js'

// ==============================================================
// RUNTIME UI STATE (NOT STORED IN PROSEMIRROR DOC!)
// We MUST persist dropdown open state outside of node view instances
// because ProseMirror will sometimes recreate node views (e.g. after
// transactions that affect mapping or selection). Without this map
// the open state vanishes instantly giving the illusion of a broken
// dropdown. Each thread maintains its own record. Keys:
//   threadId: { modelOpen: boolean, contextOpen: boolean }
// ==============================================================
const DROPDOWN_UI_STATE = {
    _store: new Map(),
    ensure(threadId) {
        if (!this._store.has(threadId)) {
            this._store.set(threadId, { modelOpen: false, contextOpen: false })
        }
        return this._store.get(threadId)
    },
    set(threadId, key, value) {
        const ref = this.ensure(threadId)
        ref[key] = value
        // EXTREME DEBUG
        console.log('[AI_DBG][UI_STATE] set', { threadId, key, value, snapshot: { ...ref } })
    },
    get(threadId, key) {
        const ref = this.ensure(threadId)
        return ref[key]
    },
    snapshot(threadId) {
        return { ...this.ensure(threadId) }
    },
    delete(threadId) {
        this._store.delete(threadId)
        console.log('[AI_DBG][UI_STATE] delete thread UI state', { threadId })
    }
}

export const aiChatThreadNodeType = 'aiChatThread'

export const aiChatThreadNodeSpec = {
    group: 'block',
    // Allow paragraphs, AI response messages, code blocks
    // Put 'paragraph' first so PM's contentMatch.defaultType picks it when creating an empty thread
    // Note: Dropdowns are no longer document nodes - they're DOM elements in the node view
    content: '(paragraph | code_block | aiResponseMessage)+', // Must contain at least one child; default child = paragraph
    defining: false, // Changed to false to allow better cursor interaction
    draggable: false,
    isolating: false, // Changed to false to allow cursor interaction
    attrs: {
        threadId: { default: null },
        status: { default: 'active' }, // active, paused, completed
        // Leave aiModel blank initially; we'll assign first available model from store when models load
        aiModel: { default: '' },
        // Thread context determines scope of content extraction: 'Thread' or 'Document'
        threadContext: { default: 'Thread' }
    },
    parseDOM: [
        {
            tag: 'div.ai-chat-thread-wrapper',
            getAttrs: (dom) => ({
                threadId: dom.getAttribute('data-thread-id'),
                status: dom.getAttribute('data-status') || 'active',
                aiModel: dom.getAttribute('data-ai-model') || '',
                threadContext: dom.getAttribute('data-thread-context') || 'Thread'
            })
        }
    ],
    toDOM: (node) => [
        'div',
        {
            class: 'ai-chat-thread-wrapper',
            'data-thread-id': node.attrs.threadId,
            'data-status': node.attrs.status,
            'data-ai-model': node.attrs.aiModel,
            'data-thread-context': node.attrs.threadContext
        },
        0
    ]
}

export const defaultAttrs = {
    threadId: () => `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    status: 'active'
}

// Define the node view for AI chat thread
export const aiChatThreadNodeView = (node, view, getPos) => {
    // Ensure node has a proper threadId - if not, assign one via transaction
    if (!node.attrs.threadId) {
        const newThreadId = defaultAttrs.threadId()
        setTimeout(() => {
            const pos = getPos()
            if (pos !== undefined) {
                const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    threadId: newThreadId
                })
                view.dispatch(tr)
                console.log('[AI_DBG][THREAD.nodeView] assigned new threadId', { pos, newThreadId })
            }
        }, 0)
        // Use the new threadId for this render
        node = node.type.create({
            ...node.attrs,
            threadId: newThreadId
        }, node.content)
    }

    // Create DOM structure - the plugin will apply decoration classes like 'receiving' and 'thread-boundary-visible' to this DOM element
    const dom = document.createElement('div')
    dom.className = 'ai-chat-thread-wrapper'
    dom.setAttribute('data-thread-id', node.attrs.threadId)
    dom.setAttribute('data-status', node.attrs.status)

    // Create content container
    const contentDOM = document.createElement('div')
    contentDOM.className = 'ai-chat-thread-content'

    // Create controls container
    const controlsContainer = document.createElement('div')
    controlsContainer.className = 'ai-chat-thread-controls'

    // Create AI model selector dropdown (returns DOM element)
    console.log('[AI_DBG][THREAD.nodeView] creating node view', { threadId: node.attrs.threadId, initialAiModel: node.attrs.aiModel, uiStateBefore: DROPDOWN_UI_STATE.snapshot(node.attrs.threadId) })
    const modelSelectorDropdown = createAiModelSelectorDropdown(view, node, getPos)

    // Create thread context selector dropdown (returns DOM element)
    const threadContextDropdown = createThreadContextDropdown(view, node, getPos)

    // Create AI submit button
    const submitButton = createAiSubmitButton(view)

    // Create thread boundary indicator for context visualization
    const threadBoundaryIndicator = createThreadBoundaryIndicator(dom, view, node.attrs.threadId)

    // Append controls to controls container
    controlsContainer.appendChild(threadContextDropdown)
    controlsContainer.appendChild(modelSelectorDropdown)
    controlsContainer.appendChild(submitButton)

    // Append all elements to main wrapper
    dom.appendChild(contentDOM)
    dom.appendChild(controlsContainer)
    dom.appendChild(threadBoundaryIndicator)

    // Setup content focus handling
    setupContentFocus(contentDOM, view, getPos)

    return {
        dom,
        contentDOM,
        update: (updatedNode, decorations) => {
            console.log('[AI_DBG][THREAD.nodeView.update] CALLED', { 
                threadId: updatedNode.attrs.threadId,
                nodeType: updatedNode.type.name,
                attrs: updatedNode.attrs,
                oldAttrs: node.attrs,
                decorationsCount: decorations?.length || 0
            })
            
            if (updatedNode.type.name !== aiChatThreadNodeType) {
                console.log('[AI_DBG][THREAD.nodeView.update] REJECTED - wrong type', { expected: aiChatThreadNodeType, got: updatedNode.type.name })
                return false
            }

            // Update attributes if changed
            dom.setAttribute('data-thread-id', updatedNode.attrs.threadId)
            dom.setAttribute('data-status', updatedNode.attrs.status)

            if (node.attrs.aiModel !== updatedNode.attrs.aiModel) {
                console.log('[AI_DBG][THREAD.nodeView.update] aiModel attr changed', { from: node.attrs.aiModel, to: updatedNode.attrs.aiModel, threadId: updatedNode.attrs.threadId })
            }
            
            if (node.attrs.threadContext !== updatedNode.attrs.threadContext) {
                console.log('[AI_DBG][THREAD.nodeView.update] threadContext attr changed', { from: node.attrs.threadContext, to: updatedNode.attrs.threadContext, threadId: updatedNode.attrs.threadId })
            }
            
            node = updatedNode

            console.log('[AI_DBG][THREAD.nodeView.update] ACCEPTED - returning true')
            return true
        },
        destroy: () => {
            console.log('[AI_DBG][THREAD.nodeView.destroy] CALLED', { threadId: node.attrs.threadId, uiStateAtDestroy: DROPDOWN_UI_STATE.snapshot(node.attrs.threadId) })
            // Clean up dropdown event listeners
            if (modelSelectorDropdown && modelSelectorDropdown._cleanup) {
                modelSelectorDropdown._cleanup()
            }
            if (threadContextDropdown && threadContextDropdown._cleanup) {
                threadContextDropdown._cleanup()
            }
            // DO NOT delete UI state here; we keep it so that a re-created node view restores state
        }
    }
}

// Helper function to setup content focus
function setupContentFocus(contentDOM, view, getPos) {
    contentDOM.addEventListener('mousedown', () => {
        view.focus()
        const pos = getPos()
        if (pos !== undefined) {
            const $pos = view.state.doc.resolve(pos + 1)
            const selection = TextSelection.create(view.state.doc, $pos.pos)
            view.dispatch(view.state.tr.setSelection(selection))
        }
    })
}

// Helper function to create thread boundary indicator
function createThreadBoundaryIndicator(wrapperDOM, view, threadId) {
    // Create the boundary line element (append to wrapper so it can span full thread height)
    const boundaryLine = html`
        <div className="ai-thread-boundary-indicator-line"></div>
    `
    wrapperDOM.appendChild(boundaryLine)

    // Cache event handlers
    const handleEnter = () => view.dispatch(view.state.tr.setMeta('hoverThread', threadId))
    const handleLeave = () => view.dispatch(view.state.tr.setMeta('hoverThread', null))

    return html`
        <div
            className="ai-thread-boundary-indicator"
            onmouseenter=${handleEnter}
            onmouseleave=${handleLeave}
        >
            <div className="ai-thread-boundary-icon" innerHTML=${chatThreadBoundariesInfoIcon}></div>
            ${createThreadInfoDropdown()}
        </div>
    `
}

// Helper to create a small info dropdown near the boundary indicator
function createThreadInfoDropdown() {
    return html`
        <div className="ai-thread-info-dropdown theme-dark">
            <span className="dots-dropdown-menu">
                <button className="dropdown-trigger-hidden"></button>
                <nav className="submenu-wrapper render-position-bottom">
                    <ul className="submenu with-header">
                        <li className="flex justify-start items-center" data-type="header">
                            <span innerHTML=${aiRobotFaceIcon}></span>
                            <span className="header-text">
                                <span className="header-title">AI Thread context</span>
                                <span className="header-meta">AI generated title will be here</span>
                            </span>
                        </li>
                        <li className="flex justify-start items-center">Add thread below</li>
                        <li className="flex justify-start items-center">Add thread above</li>
                        <li className="flex justify-start items-center">Merge with prev thread</li>
                        <li className="flex justify-start items-center">Merge with thread below</li>
                    </ul>
                </nav>
            </span>
        </div>
    `
}

// Note: We no longer use a global registry for dropdown handlers.
// Instead, we dispatch metadata through ProseMirror transactions
// and handle the selection in the aiChatThreadPlugin

// Helper function to create AI model selector dropdown as standalone DOM element
function createAiModelSelectorDropdown(view, node, getPos) {
    const dropdownId = `ai-model-dropdown-${node.attrs.threadId}`

    const aiAvatarIcons = {
        gptAvatarIcon,
        claudeIcon,
    }

    // Get AI models from store
    const aiModelsData = aiModelsStore.getData()
    const currentAiModel = node.attrs.aiModel || ''
    console.log('[AI_DBG][THREAD.dropdown] building AI model dropdown', { threadId: node.attrs.threadId, currentAiModel, modelsCount: aiModelsData.length })

    // Transform data to match dropdown format
    const aiModelsSelectorDropdownOptions = aiModelsData.map(aiModel => ({
        title: aiModel.title,
        icon: aiAvatarIcons[aiModel.iconName],
        color: aiModel.color,
        aiModel: `${aiModel.provider}:${aiModel.model}`,
        provider: aiModel.provider,
        model: aiModel.model
    }))

    // Find selected value
    let selectedValue = aiModelsSelectorDropdownOptions.find(model => model.aiModel === currentAiModel) || {}

    // If current thread has no aiModel or it's invalid, pick first available model and update node attr
    if ((!currentAiModel || !selectedValue.aiModel) && aiModelsSelectorDropdownOptions.length > 0) {
        selectedValue = aiModelsSelectorDropdownOptions[0]
        const pos = getPos()
        if (pos !== undefined) {
            const threadNode = view.state.doc.nodeAt(pos)
            if (threadNode) {
                const newAttrs = { ...threadNode.attrs, aiModel: selectedValue.aiModel }
                const trSet = view.state.tr.setNodeMarkup(pos, undefined, newAttrs)
                view.dispatch(trSet)
                console.log('[AI_DBG][THREAD.dropdown] auto-assigned first model', { threadId: node.attrs.threadId, assignedModel: selectedValue.aiModel })
            }
        }
    }

    // Create standalone dropdown DOM (not using dropdownNodeView)
    // Restore open state if previously open
    let isOpen = !!DROPDOWN_UI_STATE.get(node.attrs.threadId, 'modelOpen')
    let submenuWrapper = null
    let dropdownDOM = null
    
    const injectFillColor = (svg, color) => {
        if (!svg || !color) return svg || ''
        return svg.replace(/<svg([\s\S]*?)>/, `<svg$1 style="fill: ${color}">`)
    }

    const handleOptionClick = (option) => {
        console.log('[AI_DBG][THREAD.dropdown] option clicked!', { option, dropdownId })
        const pos = getPos()
        if (pos === undefined) return

        const threadNode = view.state.doc.nodeAt(pos)
        if (!threadNode) return

        // Update thread node's aiModel attribute
        const newAttrs = { ...threadNode.attrs, aiModel: option.aiModel }
        const tr = view.state.tr
            .setNodeMarkup(pos, undefined, newAttrs)
            .setMeta('dropdownOptionSelected', { 
                dropdownId, 
                option, 
                nodePos: pos 
            })
        view.dispatch(tr)

        // Update UI selection visuals
        selectedValue = option
        const titleEl = dropdownDOM.querySelector('.title')
        const iconEl = dropdownDOM.querySelector('.selected-option-icon span')
        if (titleEl) titleEl.textContent = option.title || ''
        if (iconEl && option.icon) {
            iconEl.innerHTML = injectFillColor(option.icon, option.color)
        }

        // Force close (source of bug: global state not updated previously)
        DROPDOWN_UI_STATE.set(node.attrs.threadId, 'modelOpen', false)
        isOpen = false
        if (submenuWrapper) submenuWrapper.style.display = 'none'
        if (dropdownDOM) dropdownDOM.classList.remove('dropdown-open')
        console.log('[AI_DBG][THREAD.dropdown] option selected + forced close', { dropdownId, option, nodePos: pos })
    }

    const toggleDropdown = (e) => {
        console.log('[AI_DBG][THREAD.dropdown] toggle clicked!', { isOpen, dropdownId, event: e, target: e.target })
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation() // Stop ALL handlers including ProseMirror's
        
        console.log('[AI_DBG][THREAD.dropdown] about to toggle, current state:', { isOpen, submenuWrapperExists: !!submenuWrapper, dropdownDOMExists: !!dropdownDOM })
        
        const wasOpen = isOpen
        // Always derive from authoritative store before flipping to avoid stale closure
        isOpen = !!DROPDOWN_UI_STATE.get(node.attrs.threadId, 'modelOpen')
        isOpen = !isOpen
        // Mutual exclusion: if opening now, force close context dropdown
        if (!wasOpen && isOpen) {
            const uiSnap = DROPDOWN_UI_STATE.snapshot(node.attrs.threadId)
            if (uiSnap.contextOpen) {
                console.log('[AI_DBG][THREAD.dropdown] model opening -> force close context dropdown', { threadId: node.attrs.threadId })
                DROPDOWN_UI_STATE.set(node.attrs.threadId, 'contextOpen', false)
                const controlsRoot = dropdownDOM.closest('.ai-chat-thread-controls')
                if (controlsRoot) {
                    const ctx = controlsRoot.querySelector('.dropdown-menu-tag-pill-wrapper[data-dropdown-type="context"]')
                    if (ctx) {
                        const submenu = ctx.querySelector('.submenu-wrapper')
                        ctx.classList.remove('dropdown-open')
                        if (submenu) submenu.style.display = 'none'
                    }
                }
            }
        }
        DROPDOWN_UI_STATE.set(node.attrs.threadId, 'modelOpen', isOpen)
        if (submenuWrapper) {
            submenuWrapper.style.display = isOpen ? 'block' : 'none'
            console.log('[AI_DBG][THREAD.dropdown] set submenu display to:', submenuWrapper.style.display)
        }
        if (dropdownDOM) {
            dropdownDOM.classList.toggle('dropdown-open', isOpen)
            console.log('[AI_DBG][THREAD.dropdown] dropdown classes:', dropdownDOM.className)
        }
        console.log('[AI_DBG][THREAD.dropdown] toggled to', { isOpen })
        
        // Return false to prevent any further event handling
        return false
    }

    const closeDropdown = () => {
        isOpen = false
        DROPDOWN_UI_STATE.set(node.attrs.threadId, 'modelOpen', false)
        if (submenuWrapper) submenuWrapper.style.display = 'none'
        if (dropdownDOM) dropdownDOM.classList.remove('dropdown-open')
    }

    dropdownDOM = html`
        <div class="dropdown-menu-tag-pill-wrapper theme-dark" data-dropdown-type="model">
            <span class="dots-dropdown-menu" onclick=${(e) => e.stopPropagation()}>
                <button class="flex justify-between items-center" onclick=${toggleDropdown}>
                    <span class="selected-option-icon flex items-center">
                        ${selectedValue?.icon ? html`<span innerHTML=${injectFillColor(selectedValue.icon, selectedValue.color)}></span>` : ''}
                    </span>
                    <span class="title">${selectedValue?.title || ''}</span>
                    <span class="state-indicator flex items-center">
                        <span innerHTML=${chevronDownIcon}></span>
                    </span>
                </button>
                <nav class="submenu-wrapper render-position-bottom" style="display: none;">
                    <ul class="submenu">
                        ${aiModelsSelectorDropdownOptions.map(option => html`
                            <li class="flex justify-start items-center" onclick=${() => handleOptionClick(option)}>
                                ${option.icon ? html`<span innerHTML=${injectFillColor(option.icon, option.color)}></span>` : ''}
                                ${option.title}
                            </li>
                        `)}
                    </ul>
                </nav>
            </span>
        </div>
    `

    submenuWrapper = dropdownDOM.querySelector('.submenu-wrapper')
    const dotsMenu = dropdownDOM.querySelector('.dots-dropdown-menu')

    console.log('[AI_DBG][THREAD.dropdown] DOM created', { 
        dropdownId, 
        hasButton: !!dropdownDOM.querySelector('button'),
        hasSubmenu: !!submenuWrapper,
        buttonClickHandler: toggleDropdown
    })

    // Restore prior open state visually AFTER DOM references resolved
    if (isOpen) {
        console.log('[AI_DBG][THREAD.dropdown] restoring OPEN state from UI_STATE', { threadId: node.attrs.threadId })
        submenuWrapper.style.display = 'block'
        dropdownDOM.classList.add('dropdown-open')
    }

    // Close dropdown when clicking outside
    const handleWindowClick = (e) => {
        if (isOpen && dotsMenu && !e.composedPath().includes(dotsMenu)) {
            closeDropdown()
        }
    }
    document.addEventListener('click', handleWindowClick)

    // Store cleanup function
    dropdownDOM._cleanup = () => {
        document.removeEventListener('click', handleWindowClick)
    }
    
    return dropdownDOM
}

// Helper function to create thread context selector dropdown as standalone DOM element
function createThreadContextDropdown(view, node, getPos) {
    const dropdownId = `thread-context-dropdown-${node.attrs.threadId}`

    const currentThreadContext = node.attrs.threadContext || 'Thread'
    console.log('[AI_DBG][THREAD.context-dropdown] building dropdown', { threadId: node.attrs.threadId, currentThreadContext })

    // Define thread context options
    const threadContextOptions = [
        {
            title: 'Thread',
            icon: contextIcon,
            value: 'Thread'
        },
        {
            title: 'Document',
            icon: contextIcon,
            value: 'Document'
        }
    ]

    // Find selected value
    let selectedValue = threadContextOptions.find(opt => opt.value === currentThreadContext) || threadContextOptions[0]

    // Create standalone dropdown DOM (not using dropdownNodeView)
    let isOpen = !!DROPDOWN_UI_STATE.get(node.attrs.threadId, 'contextOpen')
    let submenuWrapper = null
    let dropdownDOM = null
    
    const injectFillColor = (svg, color) => {
        if (!svg || !color) return svg || ''
        return svg.replace(/<svg([\s\S]*?)>/, `<svg$1 style="fill: ${color}">`)
    }

    const handleOptionClick = (option) => {
        console.log('[AI_DBG][THREAD.context-dropdown] option clicked!', { option, dropdownId })
        const pos = getPos()
        if (pos === undefined) return

        const threadNode = view.state.doc.nodeAt(pos)
        if (!threadNode) return

        // Update thread node's threadContext attribute
        const newAttrs = { ...threadNode.attrs, threadContext: option.value }
        const tr = view.state.tr
            .setNodeMarkup(pos, undefined, newAttrs)
            .setMeta('dropdownOptionSelected', { 
                dropdownId, 
                option, 
                nodePos: pos 
            })
        view.dispatch(tr)

        // Update UI visuals
        selectedValue = option
        const titleEl = dropdownDOM.querySelector('.title')
        const iconEl = dropdownDOM.querySelector('.selected-option-icon span')
        if (titleEl) titleEl.textContent = option.title || ''
        if (iconEl && option.icon) {
            iconEl.innerHTML = option.icon // ignoreColorValuesForSelectedValue = true
        }

        // Force close
        DROPDOWN_UI_STATE.set(node.attrs.threadId, 'contextOpen', false)
        isOpen = false
        if (submenuWrapper) submenuWrapper.style.display = 'none'
        if (dropdownDOM) dropdownDOM.classList.remove('dropdown-open')
        console.log('[AI_DBG][THREAD.context-dropdown] option selected + forced close', { dropdownId, option, nodePos: pos })
    }

    const toggleDropdown = (e) => {
        console.log('[AI_DBG][THREAD.context-dropdown] toggle clicked!', { isOpen, dropdownId, event: e, target: e.target })
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation() // Stop ALL handlers including ProseMirror's
        
        console.log('[AI_DBG][THREAD.context-dropdown] about to toggle, current state:', { isOpen, submenuWrapperExists: !!submenuWrapper, dropdownDOMExists: !!dropdownDOM })
        
        const wasOpen = isOpen
        isOpen = !!DROPDOWN_UI_STATE.get(node.attrs.threadId, 'contextOpen')
        isOpen = !isOpen
        // Mutual exclusion: if opening now, force close model dropdown
        if (!wasOpen && isOpen) {
            const uiSnap = DROPDOWN_UI_STATE.snapshot(node.attrs.threadId)
            if (uiSnap.modelOpen) {
                console.log('[AI_DBG][THREAD.context-dropdown] context opening -> force close model dropdown', { threadId: node.attrs.threadId })
                DROPDOWN_UI_STATE.set(node.attrs.threadId, 'modelOpen', false)
                const controlsRoot = dropdownDOM.closest('.ai-chat-thread-controls')
                if (controlsRoot) {
                    const mdl = controlsRoot.querySelector('.dropdown-menu-tag-pill-wrapper[data-dropdown-type="model"]')
                    if (mdl) {
                        const submenu = mdl.querySelector('.submenu-wrapper')
                        mdl.classList.remove('dropdown-open')
                        if (submenu) submenu.style.display = 'none'
                    }
                }
            }
        }
        DROPDOWN_UI_STATE.set(node.attrs.threadId, 'contextOpen', isOpen)
        if (submenuWrapper) {
            submenuWrapper.style.display = isOpen ? 'block' : 'none'
            console.log('[AI_DBG][THREAD.context-dropdown] set submenu display to:', submenuWrapper.style.display)
        }
        if (dropdownDOM) {
            dropdownDOM.classList.toggle('dropdown-open', isOpen)
            console.log('[AI_DBG][THREAD.context-dropdown] dropdown classes:', dropdownDOM.className)
        }
        console.log('[AI_DBG][THREAD.context-dropdown] toggled to', { isOpen })
        
        // Return false to prevent any further event handling
        return false
    }

    const closeDropdown = () => {
        isOpen = false
        DROPDOWN_UI_STATE.set(node.attrs.threadId, 'contextOpen', false)
        if (submenuWrapper) submenuWrapper.style.display = 'none'
        if (dropdownDOM) dropdownDOM.classList.remove('dropdown-open')
    }

    dropdownDOM = html`
        <div class="dropdown-menu-tag-pill-wrapper theme-dark" data-dropdown-type="context">
            <span class="dots-dropdown-menu" onclick=${(e) => e.stopPropagation()}>
                <button class="flex justify-between items-center" onclick=${toggleDropdown}>
                    <span class="selected-option-icon flex items-center">
                        ${selectedValue?.icon ? html`<span innerHTML=${selectedValue.icon}></span>` : ''}
                    </span>
                    <span class="title">${selectedValue?.title || ''}</span>
                    <span class="state-indicator flex items-center">
                        <span innerHTML=${chevronDownIcon}></span>
                    </span>
                </button>
                <nav class="submenu-wrapper render-position-bottom" style="display: none;">
                    <ul class="submenu">
                        ${threadContextOptions.map(option => html`
                            <li class="flex justify-start items-center" onclick=${() => handleOptionClick(option)}>
                                ${option.icon ? html`<span innerHTML=${option.icon}></span>` : ''}
                                ${option.title}
                            </li>
                        `)}
                    </ul>
                </nav>
            </span>
        </div>
    `

    submenuWrapper = dropdownDOM.querySelector('.submenu-wrapper')
    const dotsMenu = dropdownDOM.querySelector('.dots-dropdown-menu')

    console.log('[AI_DBG][THREAD.context-dropdown] DOM created', { 
        dropdownId, 
        hasButton: !!dropdownDOM.querySelector('button'),
        hasSubmenu: !!submenuWrapper,
        buttonClickHandler: toggleDropdown
    })

    if (isOpen) {
        console.log('[AI_DBG][THREAD.context-dropdown] restoring OPEN state from UI_STATE', { threadId: node.attrs.threadId })
        submenuWrapper.style.display = 'block'
        dropdownDOM.classList.add('dropdown-open')
    }

    // Close dropdown when clicking outside
    const handleWindowClick = (e) => {
        if (isOpen && dotsMenu && !e.composedPath().includes(dotsMenu)) {
            closeDropdown()
        }
    }
    document.addEventListener('click', handleWindowClick)

    // Store cleanup function
    dropdownDOM._cleanup = () => {
        document.removeEventListener('click', handleWindowClick)
    }

    return dropdownDOM
}

// Helper function to create AI submit button
function createAiSubmitButton(view) {
    // Cache the click handler to avoid recreation
    const handleClick = (e) => {
        e.preventDefault()
        e.stopPropagation()

        // Get plugin state to check if receiving
        const pluginState = AI_CHAT_THREAD_PLUGIN_KEY.getState(view.state)

        if (pluginState?.isReceiving) {
            // TODO: Stop AI streaming functionality
        } else {
            // Trigger AI chat submission
            const tr = view.state.tr.setMeta('use:aiChat', true)
            view.dispatch(tr)
        }
    }

    return html`
        <div
            className="ai-submit-button"
            onclick=${handleClick}
            style=${{ pointerEvents: 'auto', cursor: 'pointer' }}
        >
            <div className="button-default">
                <span className="send-icon" innerHTML=${sendIcon}></span>
            </div>
            <div className="button-hover">
                <span className="send-icon" innerHTML=${sendIcon}></span>
            </div>
            <div className="button-receiving">
                <span className="stop-icon" innerHTML=${pauseIcon}></span>
            </div>
        </div>
    `
}
