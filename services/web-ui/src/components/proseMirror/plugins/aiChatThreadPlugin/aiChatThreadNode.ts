// @ts-nocheck
import { keyboardMacCommandIcon, keyboardEnterKeyIcon, sendIcon, pauseIcon, chatThreadBoundariesInfoIcon, aiRobotFaceIcon, gptAvatarIcon, claudeIcon, chevronDownIcon, contextIcon } from '../../../../svgIcons/index.js'
import { TextSelection } from 'prosemirror-state'
import { AI_CHAT_THREAD_PLUGIN_KEY } from './aiChatThreadPluginKey.ts'
import { html } from '../../components/domTemplates.ts'
import { aiModelsStore } from '../../../../stores/aiModelsStore.js'
import { documentStore } from '../../../../stores/documentStore.js'
import { dropdownNodeView } from '../primitives/dropdown/dropdownNode.ts'

export const aiChatThreadNodeType = 'aiChatThread'

export const aiChatThreadNodeSpec = {
    group: 'block',
    // Allow paragraphs, AI response messages, code blocks, and dropdown nodes
    // Put 'paragraph' first so PM's contentMatch.defaultType picks it when creating an empty thread
    content: '(paragraph | code_block | aiResponseMessage | dropdown)+', // Must contain at least one child; default child = paragraph
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

    // Create controls container (absolutely positioned, flex layout)
    const controlsContainer = document.createElement('div')
    controlsContainer.className = 'ai-chat-thread-controls'

    // Create AI model selector dropdown AS DOCUMENT NODE (so plugin can find it)
    console.log('[AI_DBG][THREAD.nodeView] creating node view', { threadId: node.attrs.threadId, initialAiModel: node.attrs.aiModel })
    const modelSelectorDropdown = createAiModelSelectorDropdown(view, node, getPos)

    // Create thread context selector dropdown AS DOCUMENT NODE (so plugin can find it)
    const threadContextDropdown = createThreadContextDropdown(view, node, getPos)

    // Create AI submit button
    const submitButton = createAiSubmitButton(view)

    // Create thread boundary indicator for context visualization
    const threadBoundaryIndicator = createThreadBoundaryIndicator(dom, view, node.attrs.threadId)

    // Append controls to controls container (flex layout, right-aligned)
    controlsContainer.appendChild(submitButton)

    // Append all elements to main wrapper
    dom.appendChild(contentDOM)
    dom.appendChild(controlsContainer)
    dom.appendChild(threadBoundaryIndicator)

    // Setup content focus handling
    setupContentFocus(contentDOM, view, getPos)

    // Helper to move dropdown DOM elements from contentDOM to controlsContainer
    const moveDropdownsToControls = () => {
        const modelDropdownId = `ai-model-dropdown-${node.attrs.threadId}`
        const contextDropdownId = `thread-context-dropdown-${node.attrs.threadId}`

        // Find dropdown DOM elements by their IDs (they have data-dropdown-id attribute)
        const modelDropdownEl = contentDOM.querySelector(`[data-dropdown-id="${modelDropdownId}"]`)
        const contextDropdownEl = contentDOM.querySelector(`[data-dropdown-id="${contextDropdownId}"]`)

        console.log('[AI_DBG][THREAD.nodeView] moving dropdowns to controls', {
            modelDropdownId,
            contextDropdownId,
            foundModel: !!modelDropdownEl,
            foundContext: !!contextDropdownEl,
            controlsChildren: controlsContainer.children.length
        })

        // Insert BEFORE submit button (left to right: context, model, submit)
        if (modelDropdownEl && modelDropdownEl.parentElement === contentDOM) {
            controlsContainer.insertBefore(modelDropdownEl, submitButton)
            console.log('[AI_DBG][THREAD.nodeView] moved model dropdown')
        }
        if (contextDropdownEl && contextDropdownEl.parentElement === contentDOM) {
            controlsContainer.insertBefore(contextDropdownEl, controlsContainer.firstChild)
            console.log('[AI_DBG][THREAD.nodeView] moved context dropdown')
        }
    }

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

            // CRITICAL: Move dropdown DOM elements from contentDOM to controlsContainer
            // This runs on every update, so it will catch the dropdowns after they're rendered
            moveDropdownsToControls()

            console.log('[AI_DBG][THREAD.nodeView.update] ACCEPTED - returning true')
            return true
        },
        destroy: () => {
            console.log('[AI_DBG][THREAD.nodeView.destroy] CALLED', { threadId: node.attrs.threadId })
            // Clean up dropdown event listeners
            if (modelSelectorDropdown && modelSelectorDropdown._cleanup) {
                modelSelectorDropdown._cleanup()
            }
            if (threadContextDropdown && threadContextDropdown._cleanup) {
                threadContextDropdown._cleanup()
            }
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

// Helper function to create AI model selector dropdown using the dropdown primitive
function createAiModelSelectorDropdown(view, node, getPos) {
    const dropdownId = `ai-model-dropdown-${node.attrs.threadId}`

    // Check if dropdown already exists in this thread to prevent duplicates
    const pos = getPos()
    const threadStart = pos
    const threadEnd = pos + node.nodeSize
    let dropdownExists = false

    view.state.doc.nodesBetween(threadStart, threadEnd, (childNode, childPos) => {
        if (childNode.type.name === 'dropdown' && childNode.attrs.id === dropdownId) {
            dropdownExists = true
        }
    })

    if (dropdownExists) {
        console.log('[AI_DBG][THREAD.dropdown] already exists - skip duplicate', { threadId: node.attrs.threadId, dropdownId })
        return { _cleanup: () => {} }
    }

    const aiAvatarIcons = {
        gptAvatarIcon,
        claudeIcon,
    }

    // Get AI models from store
    const aiModelsData = aiModelsStore.getData()
    const currentAiModel = node.attrs.aiModel || ''
    console.log('[AI_DBG][THREAD.dropdown] building options', { threadId: node.attrs.threadId, currentAiModel, modelsCount: aiModelsData.length })

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

    // Insert dropdown at the beginning of the thread content (after thread wrapper, before first paragraph)
    const insertPos = pos + 1 // Insert after opening of aiChatThread node

    if (!view.state.schema.nodes.dropdown) {
        console.error('❌ SCHEMA ERROR: dropdown node not found in schema')
        return { _cleanup: () => {} }
    }

    try {
        const dropdownNode = view.state.schema.nodes.dropdown.create({
            id: dropdownId,
            selectedValue: selectedValue,
            dropdownOptions: aiModelsSelectorDropdownOptions,
            theme: 'dark',
            renderPosition: 'bottom',
            buttonIcon: chevronDownIcon,
            ignoreColorValuesForOptions: true,
            ignoreColorValuesForSelectedValue: false
        })

        // Insert the dropdown node into the document
        const tr = view.state.tr.insert(insertPos, dropdownNode)
        view.dispatch(tr)
        console.log('[AI_DBG][THREAD.dropdown] inserted dropdown node', { threadId: node.attrs.threadId, dropdownId, insertPos, selectedValue })
    } catch (error) {
        console.error('Failed to create/insert dropdown node:', error)
        return { _cleanup: () => {} }
    }

    // Note: Dropdown now syncs with thread node aiModel attribute directly
    // The dropdown selection handling in aiChatThreadPlugin will update the thread's aiModel
    // and the NodeView update() method will reflect changes to the dropdown accordingly

    // Return cleanup function
    // If models list was empty at creation time, subscribe and create dropdown later
    if (!aiModelsSelectorDropdownOptions.length) {
        const unsubscribe = aiModelsStore.subscribe(storeValue => {
            if (storeValue.data.length) {
                unsubscribe()
                // Avoid duplicate creation (will be caught by duplicate check at top on re-entry)
                createAiModelSelectorDropdown(view, node, getPos)
                console.log('[AI_DBG][THREAD.dropdown] models loaded later - reattempt creation', { threadId: node.attrs.threadId })
            }
        })
        return { _cleanup: () => unsubscribe() }
    }

    return { _cleanup: () => {} }
}

// Helper function to create thread context selector dropdown using the dropdown primitive
function createThreadContextDropdown(view, node, getPos) {
    const dropdownId = `thread-context-dropdown-${node.attrs.threadId}`

    // Check if dropdown already exists in this thread to prevent duplicates
    const pos = getPos()
    const threadStart = pos
    const threadEnd = pos + node.nodeSize
    let dropdownExists = false

    view.state.doc.nodesBetween(threadStart, threadEnd, (childNode, childPos) => {
        if (childNode.type.name === 'dropdown' && childNode.attrs.id === dropdownId) {
            dropdownExists = true
        }
    })

    if (dropdownExists) {
        console.log('[AI_DBG][THREAD.context-dropdown] already exists - skip duplicate', { threadId: node.attrs.threadId, dropdownId })
        return { _cleanup: () => {} }
    }

    const currentThreadContext = node.attrs.threadContext || 'Thread'
    console.log('[AI_DBG][THREAD.context-dropdown] building options', { threadId: node.attrs.threadId, currentThreadContext })

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

    // Insert dropdown at the beginning of the thread content (after model selector dropdown)
    const insertPos = pos + 2 // Insert after opening of aiChatThread node + model selector dropdown

    if (!view.state.schema.nodes.dropdown) {
        console.error('❌ SCHEMA ERROR: dropdown node not found in schema')
        return { _cleanup: () => {} }
    }

    try {
        const dropdownNode = view.state.schema.nodes.dropdown.create({
            id: dropdownId,
            selectedValue: selectedValue,
            dropdownOptions: threadContextOptions,
            theme: 'dark',
            renderPosition: 'bottom',
            buttonIcon: chevronDownIcon,
            ignoreColorValuesForOptions: true,
            ignoreColorValuesForSelectedValue: true
        })

        // Insert the dropdown node into the document
        const tr = view.state.tr.insert(insertPos, dropdownNode)
        view.dispatch(tr)
        console.log('[AI_DBG][THREAD.context-dropdown] inserted dropdown node', { threadId: node.attrs.threadId, dropdownId, insertPos, selectedValue })
    } catch (error) {
        console.error('Failed to create/insert dropdown node:', error)
        return { _cleanup: () => {} }
    }

    return { _cleanup: () => {} }
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
