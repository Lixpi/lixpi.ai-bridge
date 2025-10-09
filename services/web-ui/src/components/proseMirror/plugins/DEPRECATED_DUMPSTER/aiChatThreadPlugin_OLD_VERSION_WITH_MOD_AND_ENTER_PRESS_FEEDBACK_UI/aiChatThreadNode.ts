// @ts-nocheck
import { keyboardMacCommandIcon, keyboardEnterKeyIcon, sendIcon, stopIcon, chatThreadBoundariesInfoIcon, aiRobotFaceIcon } from '../../../../svgIcons/index.ts'
import { TextSelection, PluginKey } from 'prosemirror-state'

export const aiChatThreadNodeType = 'aiChatThread'

export const aiChatThreadNodeSpec = {
    group: 'block',
    // Allow paragraphs, AI response messages, and code blocks (for user-created code via triple backticks)
    // Put 'paragraph' first so PM's contentMatch.defaultType picks it when creating an empty thread
    content: '(paragraph | code_block | aiResponseMessage)+', // Must contain at least one child; default child = paragraph
    defining: false, // Changed to false to allow better cursor interaction
    draggable: false,
    isolating: false, // Changed to false to allow cursor interaction
    attrs: {
        threadId: { default: null },
        status: { default: 'active' } // active, paused, completed
    },
    parseDOM: [
        {
            tag: 'div.ai-chat-thread-wrapper',
            getAttrs: (dom) => ({
                threadId: dom.getAttribute('data-thread-id'),
                status: dom.getAttribute('data-status') || 'active'
            })
        }
    ],
    toDOM: (node) => [
        'div',
        {
            class: 'ai-chat-thread-wrapper',
            'data-thread-id': node.attrs.threadId,
            'data-status': node.attrs.status
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
            }
        }, 0)
        // Use the new threadId for this render
        node = node.type.create({
            ...node.attrs,
            threadId: newThreadId
        }, node.content)
    }

    // Create DOM structure - the plugin will apply decoration classes like 'ai-chat-thread-keys-pressed mod-pressed' to this DOM element
    const dom = document.createElement('div')
    dom.className = 'ai-chat-thread-wrapper'
    dom.setAttribute('data-thread-id', node.attrs.threadId)
    dom.setAttribute('data-status', node.attrs.status)

    // Create content container
    const contentDOM = document.createElement('div')
    contentDOM.className = 'ai-chat-thread-content'

    // Create keyboard shortcut indicator
    const shortcutIndicator = createKeyboardShortcutIndicator(view)

    // Create thread boundary indicator for context visualization
    const threadBoundaryIndicator = createThreadBoundaryIndicator(dom, view, node.attrs.threadId)

    // Append all elements
    dom.appendChild(contentDOM)
    dom.appendChild(shortcutIndicator)
    dom.appendChild(threadBoundaryIndicator)

    // Setup content focus handling
    setupContentFocus(contentDOM, view, getPos)

    return {
        dom,
        contentDOM,
        update: (updatedNode) => {
            if (updatedNode.type.name !== aiChatThreadNodeType) {
                return false
            }

            // Update attributes if changed
            dom.setAttribute('data-thread-id', updatedNode.attrs.threadId)
            dom.setAttribute('data-status', updatedNode.attrs.status)

            node = updatedNode
            return true
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
    const boundaryIndicator = document.createElement('div')
    boundaryIndicator.className = 'ai-thread-boundary-indicator'

    // Create the boundary line element (append to wrapper so it can span full thread height)
    const boundaryLine = document.createElement('div')
    boundaryLine.className = 'ai-thread-boundary-indicator-line'
    wrapperDOM.appendChild(boundaryLine)

    // Create the icon element
    const iconElement = document.createElement('div')
    iconElement.className = 'ai-thread-boundary-icon'
    iconElement.innerHTML = chatThreadBoundariesInfoIcon

    // Add icon to the boundary indicator
    boundaryIndicator.appendChild(iconElement)

    // Attach a compact info dropdown to the indicator (no duplicate icon inside)
    const infoDropdown = createThreadInfoDropdown()
    boundaryIndicator.appendChild(infoDropdown)

    // Handle hover events using ProseMirror transactions for consistency
    boundaryIndicator.addEventListener('mouseenter', () => {
        view.dispatch(view.state.tr.setMeta('hoverThread', threadId))
    })

    boundaryIndicator.addEventListener('mouseleave', () => {
        view.dispatch(view.state.tr.setMeta('hoverThread', null))
    })

    return boundaryIndicator
}

// Helper to create a small info dropdown near the boundary indicator
function createThreadInfoDropdown() {
    const wrapper = document.createElement('div')
    wrapper.className = 'ai-thread-info-dropdown theme-dark'

    // Internal structure expected by dropdown mixins
    const host = document.createElement('span')
    host.className = 'dots-dropdown-menu'

    // We do not add an icon here to avoid duplicating the boundary icon.
    // Create a minimal button element to satisfy structure (kept visually hidden via CSS)
    const button = document.createElement('button')
    button.className = 'dropdown-trigger-hidden'
    host.appendChild(button)

    // Submenu
    const nav = document.createElement('nav')
    nav.className = 'submenu-wrapper render-position-bottom'
    const ul = document.createElement('ul')
    ul.className = 'submenu'

    const li1 = document.createElement('li')
    li1.className = 'flex justify-start items-center'
    li1.setAttribute('data-type', 'header')
    // header icon
    const headerIcon = document.createElement('span')
    headerIcon.innerHTML = aiRobotFaceIcon
    li1.appendChild(headerIcon)
    // header label + meta container
    const headerText = document.createElement('span')
    headerText.className = 'header-text'
    const headerTitle = document.createElement('span')
    headerTitle.className = 'header-title'
    headerTitle.textContent = 'AI Thread context'
    const headerMeta = document.createElement('span')
    headerMeta.className = 'header-meta'
    headerMeta.textContent = 'AI generated title will be here'
    headerText.appendChild(headerTitle)
    headerText.appendChild(headerMeta)
    li1.appendChild(headerText)
    ul.appendChild(li1)

    const li2 = document.createElement('li')
    li2.className = 'flex justify-start items-center'
    li2.textContent = 'Add thread below'
    ul.appendChild(li2)

    const li3 = document.createElement('li')
    li3.className = 'flex justify-start items-center'
    li3.textContent = 'Add thread above'
    ul.appendChild(li3)

    const li4 = document.createElement('li')
    li4.className = 'flex justify-start items-center'
    li4.textContent = 'Merge with prev thread'
    ul.appendChild(li4)

    const li5 = document.createElement('li')
    li5.className = 'flex justify-start items-center'
    li5.textContent = 'Merge with thread below'
    ul.appendChild(li5)

    nav.appendChild(ul)
    host.appendChild(nav)
    wrapper.appendChild(host)

    // If a header item exists, mark submenu for header-aware styling (arrow fill matches header color)
    if (ul.querySelector("li[data-type='header']")) {
        ul.classList.add('with-header')
    }

    // No click toggling — visibility is controlled by thread hover state via CSS (.thread-boundary-visible)
    return wrapper
}

// Helper function to create keyboard shortcut indicator
function createKeyboardShortcutIndicator(view) {
    const indicator = document.createElement('div')
    indicator.className = 'keyboard-shortcut-hint'

    // Detect platform for correct modifier key
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

    // Default state (showing keyboard shortcut)
    const defaultContent = document.createElement('div')
    defaultContent.className = 'shortcut-default'

    const defaultIconsContainer = document.createElement('div')
    defaultIconsContainer.className = 'icons-container'

    const keysContainer = document.createElement('div')
    keysContainer.className = 'shortcut-keys'

    if (isMac) {
        const cmdIcon = document.createElement('span')
        cmdIcon.className = 'key-icon cmd-key'
        cmdIcon.innerHTML = keyboardMacCommandIcon
        keysContainer.appendChild(cmdIcon)
    } else {
        const ctrlKey = document.createElement('span')
        ctrlKey.className = 'key-text ctrl-key'
        ctrlKey.textContent = 'Ctrl'
        keysContainer.appendChild(ctrlKey)
    }

    const enterIcon = document.createElement('span')
    enterIcon.className = 'key-icon enter-key'
    enterIcon.innerHTML = keyboardEnterKeyIcon
    keysContainer.appendChild(enterIcon)

    defaultIconsContainer.appendChild(keysContainer)

    const defaultLabel = document.createElement('span')
    defaultLabel.className = 'shortcut-label'
    defaultLabel.textContent = 'send'

    defaultContent.appendChild(defaultIconsContainer)
    defaultContent.appendChild(defaultLabel)

    // Hover state (showing send button)
    const hoverContent = document.createElement('div')
    hoverContent.className = 'shortcut-hover'

    const hoverIconsContainer = document.createElement('div')
    hoverIconsContainer.className = 'icons-container'

    const sendIconElement = document.createElement('span')
    sendIconElement.className = 'send-icon'
    sendIconElement.innerHTML = sendIcon

    hoverIconsContainer.appendChild(sendIconElement)

    const hoverLabel = document.createElement('span')
    hoverLabel.className = 'shortcut-label'
    hoverLabel.textContent = 'send'

    hoverContent.appendChild(hoverIconsContainer)
    hoverContent.appendChild(hoverLabel)

    // Receiving state (showing stop button)
    const receivingContent = document.createElement('div')
    receivingContent.className = 'shortcut-receiving'

    const receivingIconsContainer = document.createElement('div')
    receivingIconsContainer.className = 'icons-container'

    const stopIconElement = document.createElement('span')
    stopIconElement.className = 'stop-icon'
    stopIconElement.innerHTML = stopIcon

    receivingIconsContainer.appendChild(stopIconElement)

    const receivingLabel = document.createElement('span')
    receivingLabel.className = 'shortcut-label'
    receivingLabel.textContent = 'stop'

    receivingContent.appendChild(receivingIconsContainer)
    receivingContent.appendChild(receivingLabel)

    // Add all three states to indicator
    indicator.appendChild(defaultContent)
    indicator.appendChild(hoverContent)
    indicator.appendChild(receivingContent)

    // Enable pointer events and add click handler
    indicator.style.pointerEvents = 'auto'
    indicator.style.cursor = 'pointer'

    // Add click handler
    indicator.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // Get plugin state to check if receiving
        const pluginKey = new PluginKey('aiChatThread')
        const pluginState = pluginKey.getState(view.state)

        console.log('🖱️ BUTTON CLICKED: pluginState.isReceiving =', pluginState?.isReceiving)

        if (pluginState?.isReceiving) {
            // TODO: Stop AI streaming functionality
            console.log('🛑 Stop AI streaming - functionality to be implemented')
        } else {
            // Trigger AI chat submission
            console.log('🚀 Triggering AI chat submission')
            const tr = view.state.tr.setMeta('use:aiChat', true)
            view.dispatch(tr)
        }
    })

    return indicator
}
