// @ts-nocheck
// AI Chat Thread Plugin - Modular Architecture
// This plugin consolidates AI chat functionality for ProseMirror:
// - Keyboard triggers (Mod+Enter)
// - Content extraction from chat threads
// - AI response streaming and insertion
// - Thread NodeViews with controls
// - Placeholder decorations

import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state'
import { EditorView, Decoration, DecorationSet, NodeView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { Node as PMNode, Schema } from 'prosemirror-model'
import { nodeTypes, nodeViews } from '../../customNodes/index.js'
import { documentTitleNodeType } from '../../customNodes/documentTitleNode.js'
import { aiChatThreadNodeType, aiChatThreadNodeView } from './aiChatThreadNode.ts'
import { AI_CHAT_THREAD_PLUGIN_KEY } from './aiChatThreadPluginKey.ts'
import { aiResponseMessageNodeType, aiResponseMessageNodeView } from './aiResponseMessageNode.ts'
import SegmentsReceiver from '../../../../services/segmentsReceiver-service.js'
import { documentStore } from '../../../../stores/documentStore.js'
import { aiModelsStore } from '../../../../stores/aiModelsStore.js'
import type { AiModelId } from '@lixpi/constants'

const IS_RECEIVING_TEMP_DEBUG_STATE = false    // For debug purposes only

// ========== TYPE DEFINITIONS ==========

type AiChatCallback = (data: { messages: Array<{ role: string; content: string }>; aiModel: AiModelId }) => void
type PlaceholderOptions = { titlePlaceholder: string; paragraphPlaceholder: string }
type StreamStatus = 'START_STREAM' | 'STREAMING' | 'END_STREAM'
type SegmentEvent = {
    status: StreamStatus
    aiProvider?: string
    segment?: {
        segment: string
        styles: string[]
        type: string
        level?: number
        isBlockDefining: boolean
    }
}
type ThreadContent = { nodeType: string; textContent: string }
type AiChatThreadPluginState = {
    isReceiving: boolean
    insideBackticks: boolean
    backtickBuffer: string
    insideCodeBlock: boolean
    codeBuffer: string
    decorations: DecorationSet
    hoveredThreadId: string | null
    // Note: dropdownStates removed - now handled by dropdown primitive plugin
}

// ========== CONSTANTS ==========

const PLUGIN_KEY = AI_CHAT_THREAD_PLUGIN_KEY as PluginKey<AiChatThreadPluginState>
const INSERT_THREAD_META = `insert:${aiChatThreadNodeType}`
const USE_AI_CHAT_META = 'use:aiChat'

// ========== UTILITY MODULES ==========

// Keyboard interaction handling
class KeyboardHandler {
    static isModEnter(event: KeyboardEvent): boolean {
        const isMac = navigator.platform.toUpperCase().includes('MAC')
        const mod = isMac ? event.metaKey : event.ctrlKey
        return event.key === 'Enter' && mod
    }
}

// Content extraction and transformation utilities
class ContentExtractor {
    // Extract and format text recursively, preserving code block structure
    static collectFormattedText(node: PMNode): string {
        let text = ''
        node.forEach(child => {
            if (child.type.name === 'text') {
                text += child.text
            } else if (child.type.name === 'hard_break') {
                text += '\n'
            } else if (child.type.name === 'code_block') {
                // Format code blocks with triple backticks and proper spacing
                const codeContent = ContentExtractor.collectFormattedText(child)
                text += `\n\`\`\`\n${codeContent}\n\`\`\`\n`
            } else {
                text += ContentExtractor.collectFormattedText(child)
            }
        })
        return text
    }

    // Simple text extraction without formatting (for backwards compatibility)
    static collectText(node: PMNode): string {
        let text = ''
        node.forEach(child => {
            if (child.type.name === 'text') {
                text += child.text
            } else if (child.type.name === 'hard_break') {
                text += '\n'
            } else {
                text += ContentExtractor.collectText(child)
            }
        })
        return text
    }

    // Find the active aiChatThread containing the cursor
    static getActiveThreadContent(state: EditorState): ThreadContent[] {
        const { $from } = state.selection
        let thread: PMNode | null = null

        // Walk up the node hierarchy to find the thread
        for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name === aiChatThreadNodeType) {
                thread = node
                break
            }
        }

        if (!thread) return []

        // Extract all blocks with content, preserving code block formatting
        const content: ThreadContent[] = []
        thread.forEach(block => {
            // Use formatted text extraction for all blocks
            const formattedText = ContentExtractor.collectFormattedText(block)
            const simpleText = ContentExtractor.collectText(block)

            console.log('Processing block:', {
                nodeType: block.type.name,
                textContent: block.textContent,
                simpleText: simpleText,
                formattedText: formattedText,
                hasContent: !!block.textContent,
                hasFormattedContent: !!formattedText,
                nodeSize: block.nodeSize,
                childCount: block.childCount
            })

            // Include blocks that have any text content
            if (block.textContent || formattedText) {
                let textContent = formattedText || block.textContent

                // For top-level code blocks, format with triple backticks (if not already formatted)
                if (block.type.name === 'code_block' && !textContent.includes('```')) {
                    textContent = `\`\`\`\n${textContent}\n\`\`\``
                }

                content.push({
                    nodeType: block.type.name,
                    textContent: textContent
                })
            }
        })

        console.log('Final extracted content:', content)
        return content
    }

    // Transform thread content into AI message format
    static toMessages(items: ThreadContent[]): Array<{ role: string; content: string }> {
        console.log('Input items to toMessages:', items)

        const messages: Array<{ role: string; content: string; nodeType: string }> = []

        items.forEach(item => {
            const role = item.nodeType === aiResponseMessageNodeType ? 'assistant' : 'user'
            const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null

            console.log('Processing item:', {
                nodeType: item.nodeType,
                role,
                textContent: item.textContent,
                isAiResponse: item.nodeType === aiResponseMessageNodeType,
                expectedType: aiResponseMessageNodeType
            })

            // Merge consecutive messages with same role
            if (lastMessage && lastMessage.role === role) {
                lastMessage.content += '\n' + item.textContent
            } else {
                messages.push({
                    role,
                    content: item.textContent,
                    nodeType: item.nodeType
                })
            }
        })

        const finalMessages = messages.map(({ role, content }) => ({ role, content }))
        console.log('Final messages to send to AI:', finalMessages)
        return finalMessages
    }
}

// Document position and insertion utilities
class PositionFinder {
    // Find where to insert aiResponseMessage in the active thread
    static findThreadInsertionPoint(state: EditorState): {
        insertPos: number
        trailingEmptyParagraphPos: number | null
    } | null {
        let result: { insertPos: number; trailingEmptyParagraphPos: number | null } | null = null

        state.doc.descendants((node, pos) => {
            if (node.type.name !== aiChatThreadNodeType) return

            // Find the last paragraph in the thread
            let lastParaAbsPos: number | null = null
            let lastParaNode: PMNode | null = null

            node.descendants((child, relPos) => {
                if (child.type.name === 'paragraph') {
                    lastParaAbsPos = pos + relPos + 1
                    lastParaNode = child
                }
            })

            // Check if last paragraph is empty (trailing)
            const trailingEmpty = lastParaNode && lastParaNode.textContent === '' ? lastParaAbsPos : null
            const insertPos = trailingEmpty || pos + node.nodeSize - 1

            result = { insertPos, trailingEmptyParagraphPos: trailingEmpty }
            return false // Stop searching
        })

        return result
    }

    // Find the current aiResponseMessage being streamed into
    static findResponseNode(state: EditorState): {
        found: boolean
        endOfNodePos?: number
        childCount?: number
    } {
        let found = false
        let endOfNodePos: number | undefined
        let childCount: number | undefined

        state.doc.descendants((node, pos) => {
            if (node.type.name !== aiResponseMessageNodeType) return

            endOfNodePos = pos + node.nodeSize
            childCount = node.childCount
            found = true
            return false // Stop searching
        })

        return { found, endOfNodePos, childCount }
    }
}

// Content insertion during AI streaming
class StreamingInserter {
    // Insert block-level content (headers, paragraphs, code blocks)
    static insertBlockContent(
        tr: Transaction,
        type: string,
        content: string,
        level: number | undefined,
        marks: any[] | null,
        endOfNodePos: number,
        childCount: number
    ): void {
        try {
            const insertPos = endOfNodePos - 1
            tr.doc.resolve(insertPos) // Validate position

            switch (type) {
                case 'header': {
                    const textNode = tr.doc.type.schema.text(content)
                    const headingNode = tr.doc.type.schema.nodes.heading.createAndFill({ level }, textNode)!

                    if (childCount === 0) {
                        tr.insert(insertPos, headingNode)
                    } else {
                        // Insert separator paragraph first
                        const para = tr.doc.type.schema.nodes.paragraph.createAndFill()!
                        tr.insert(insertPos, para)
                        tr.insert(endOfNodePos, headingNode)
                    }
                    break
                }

                case 'paragraph': {
                    if (content) {
                        const textNode = marks
                            ? tr.doc.type.schema.text(content, marks)
                            : tr.doc.type.schema.text(content)
                        const paragraphNode = tr.doc.type.schema.nodes.paragraph.createAndFill(null, textNode)!
                        tr.insert(insertPos, paragraphNode)
                    } else {
                        const emptyParagraph = tr.doc.type.schema.nodes.paragraph.create()
                        tr.insert(insertPos, emptyParagraph)
                    }
                    break
                }

                case 'codeBlock': {
                    const codeText = tr.doc.type.schema.text(content)
                    const codeBlock = tr.doc.type.schema.nodes.code_block.createAndFill(null, codeText)!
                    tr.insert(insertPos, codeBlock)
                    break
                }
            }
        } catch (error) {
            console.warn(`Block content insertion failed at ${endOfNodePos - 1}:`, error)
        }
    }

    // Insert inline content (text, marks, line breaks)
    static insertInlineContent(
        tr: Transaction,
        type: string,
        content: string,
        marks: any[] | null,
        endOfNodePos: number
    ): void {
        try {
            const insertPos = endOfNodePos - 2
            tr.doc.resolve(insertPos) // Validate position

            if (type === 'codeBlock') {
                const codeText = tr.doc.type.schema.text(content)
                tr.insert(insertPos, codeText)
            } else if (content === '\n') {
                const newParagraph = tr.doc.type.schema.nodes.paragraph.create()
                tr.insert(endOfNodePos - 1, newParagraph)
            } else if (content) {
                const textNode = marks
                    ? tr.doc.type.schema.text(content, marks)
                    : tr.doc.type.schema.text(content)
                tr.insert(insertPos, textNode)
            }
        } catch (error) {
            console.warn(`Inline content insertion failed at ${endOfNodePos - 2}:`, error)
        }
    }
}

// ========== MAIN PLUGIN CLASS ==========

// Main plugin class coordinating all AI chat functionality
class AiChatThreadPluginClass {
    private callback: AiChatCallback
    private placeholderOptions: PlaceholderOptions
    private unsubscribeFromSegments: (() => void) | null = null

    constructor(callback: AiChatCallback, placeholderOptions: PlaceholderOptions) {
        this.callback = callback
        this.placeholderOptions = placeholderOptions
    }

    // ========== STREAMING MANAGEMENT ==========

    private startStreaming(view: EditorView): void {
        this.unsubscribeFromSegments = SegmentsReceiver.subscribeToeceiveSegment((event: SegmentEvent) => {
            const { status, aiProvider, segment } = event
            const { state, dispatch } = view

            console.log('🚀 SEGMENT RECEIVED:', status, 'aiProvider:', aiProvider)
            switch (status) {
                case 'START_STREAM':
                    console.log('🔴 Handling START_STREAM')
                    this.handleStreamStart(state, dispatch, aiProvider)
                    break
                case 'STREAMING':
                    console.log('📡 Handling STREAMING segment')
                    if (segment) this.handleStreaming(state, dispatch, segment)
                    break
                case 'END_STREAM':
                    console.log('🟢 Handling END_STREAM')
                    this.handleStreamEnd(state, dispatch)
                    break
            }
        })
    }

    private handleStreamStart(state: EditorState, dispatch: (tr: Transaction) => void, aiProvider?: string): void {
        const threadInfo = PositionFinder.findThreadInsertionPoint(state)
        if (!threadInfo) return

        const { insertPos, trailingEmptyParagraphPos } = threadInfo
        const aiResponseNode = state.schema.nodes[aiResponseMessageNodeType].create({
            isInitialRenderAnimation: true,
            isReceivingAnimation: true,
            aiProvider
        })

        try {
            let tr = state.tr
            tr.insert(insertPos, aiResponseNode)

            const afterResponsePos = insertPos + aiResponseNode.nodeSize
            let cursorPos = afterResponsePos

            // Ensure trailing empty paragraph
            if (trailingEmptyParagraphPos === null || trailingEmptyParagraphPos !== afterResponsePos) {
                const emptyParagraph = state.schema.nodes.paragraph.createAndFill()!
                tr.insert(afterResponsePos, emptyParagraph)
                cursorPos = afterResponsePos + emptyParagraph.nodeSize - 1
            } else {
                cursorPos = afterResponsePos - 1
            }

            tr.setSelection(TextSelection.create(tr.doc, cursorPos))
            tr.setMeta('setReceiving', true)
            console.log('🔴 STREAM START: Setting isReceiving to true via setMeta')
            dispatch(tr)
        } catch (error) {
            console.error('Error inserting aiResponseMessage:', error)
        }
    }

    private handleStreaming(state: EditorState, dispatch: (tr: Transaction) => void, segment: SegmentEvent['segment']): void {
        if (!segment) return

        let tr = state.tr
        const responseInfo = PositionFinder.findResponseNode(state)

        // Create response node if missing (fallback)
        if (!responseInfo.found) {
            this.createResponseFallback(state, dispatch)
            return
        }

        const { endOfNodePos, childCount } = responseInfo
        const { segment: content, styles, type, level, isBlockDefining } = segment

        // Create text marks from styles
        const marks = styles.length > 0
            ? styles.map(style => this.createMark(state.schema, style)).filter(Boolean)
            : null

        // Insert content based on type
        if (isBlockDefining) {
            StreamingInserter.insertBlockContent(tr, type, content, level, marks, endOfNodePos!, childCount!)
        } else {
            StreamingInserter.insertInlineContent(tr, type, content, marks, endOfNodePos!)
        }

        if (tr.docChanged) {
            dispatch(tr)
        }
    }

    private handleStreamEnd(state: EditorState, dispatch: (tr: Transaction) => void): void {
        state.doc.descendants((node, pos) => {
            if (node.type.name === aiResponseMessageNodeType && node.attrs.isInitialRenderAnimation) {
                const tr = state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    isInitialRenderAnimation: false,
                    isReceivingAnimation: false
                })

                // Only set isReceiving to false if debug mode is off
                if (!IS_RECEIVING_TEMP_DEBUG_STATE) {
                    tr.setMeta('setReceiving', false)
                    console.log('🟢 STREAM END: Setting isReceiving to false via setMeta')
                } else {
                    console.log('🟡 STREAM END: Debug mode ON - keeping isReceiving state active for CSS inspection')
                }

                dispatch(tr)
                return false // Stop after first match
            }
        })
    }

    private createResponseFallback(state: EditorState, dispatch: (tr: Transaction) => void): void {
        const threadInfo = PositionFinder.findThreadInsertionPoint(state)
        if (!threadInfo) return

        const { insertPos, trailingEmptyParagraphPos } = threadInfo
        const responseNode = state.schema.nodes[aiResponseMessageNodeType].create({
            isInitialRenderAnimation: true,
            isReceivingAnimation: true,
            aiProvider: 'Anthropic'
        })

        let tr = state.tr.insert(insertPos, responseNode)
        const afterPos = insertPos + responseNode.nodeSize

        // Ensure trailing paragraph
        if (trailingEmptyParagraphPos === null || trailingEmptyParagraphPos !== afterPos) {
            const emptyParagraph = state.schema.nodes.paragraph.createAndFill()!
            tr = tr.insert(afterPos, emptyParagraph)
        }

        dispatch(tr)
    }

    private createMark(schema: Schema, style: string): any {
        switch (style) {
            case 'bold': return schema.marks.strong.create()
            case 'italic': return schema.marks.em.create()
            case 'strikethrough': return schema.marks.strikethrough.create()
            case 'code': return schema.marks.code.create()
            default: return null
        }
    }

    // ========== RECEIVING STATE DECORATIONS ==========

    private createReceivingStateDecorations(state: EditorState, pluginState: AiChatThreadPluginState): Decoration[] {
        const decorations: Decoration[] = []

        // Find all ai-chat-thread nodes and add receiving state styling ONLY
        state.doc.descendants((node, pos) => {
            if (node.type.name === 'aiChatThread') {
                let cssClass = 'ai-chat-thread'
                if (pluginState.isReceiving) {
                    cssClass += ' receiving'
                }

                // Create a decoration that applies the receiving state class to the entire node
                decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                        class: cssClass
                    })
                )
            }
        })

        return decorations
    }

    // ========== THREAD BOUNDARY SYSTEM ==========

    private createThreadBoundaryDecorations(state: EditorState, pluginState: AiChatThreadPluginState): Decoration[] {
        const decorations: Decoration[] = []

        // Find all ai-chat-thread nodes and add boundary visibility ONLY for the hovered thread
        state.doc.descendants((node, pos) => {
            if (node.type.name === 'aiChatThread' && pluginState.hoveredThreadId === node.attrs.threadId) {
                // Apply boundary visibility class ONLY to the specific hovered thread
                decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                        class: 'thread-boundary-visible'
                    })
                )
            }
        })

        return decorations
    }

    // ========== DROPDOWN STATE HANDLING ==========
    // Note: Dropdown decorations and state are now handled by the dropdown primitive plugin

    // ========== PLACEHOLDERS ==========

    private createPlaceholders(state: EditorState): DecorationSet {
        const decorations: Decoration[] = []

        state.doc.descendants((node, pos) => {
            // Title placeholder
            if (node.type.name === documentTitleNodeType && node.content.size === 0) {
                decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                        class: 'empty-node-placeholder',
                        'data-placeholder': this.placeholderOptions.titlePlaceholder
                    })
                )
            }

            // Thread paragraph placeholder (only for single empty paragraph)
            if (node.type.name === aiChatThreadNodeType && node.childCount === 1) {
                const firstChild = node.firstChild
                if (firstChild && firstChild.type.name === 'paragraph' && firstChild.content.size === 0) {
                    const paragraphPos = pos + 1
                    decorations.push(
                        Decoration.node(paragraphPos, paragraphPos + firstChild.nodeSize, {
                            class: 'empty-node-placeholder',
                            'data-placeholder': this.placeholderOptions.paragraphPlaceholder
                        })
                    )
                }
            }
        })

        return DecorationSet.create(state.doc, decorations)
    }

    // ========== TRANSACTION HANDLING ==========

    private handleInsertThread(transaction: Transaction, newState: EditorState): Transaction | null {
        const attrs = transaction.getMeta(INSERT_THREAD_META)
        if (!attrs) return null

        // Create thread with initial empty paragraph
        const nodeType = newState.schema.nodes[aiChatThreadNodeType]
        const paragraph = newState.schema.nodes.paragraph.create()
        const threadNode = nodeType.create(attrs, paragraph)

        // Replace selection with thread
        const { $from, $to } = newState.selection
        let tr = newState.tr.replaceWith($from.pos, $to.pos, threadNode)

        // Move cursor into thread
        const pos = $from.pos + 1
        tr = tr.setSelection(TextSelection.create(tr.doc, pos))

        return tr
    }

    private handleChatRequest(newState: EditorState): void {
        const threadContent = ContentExtractor.getActiveThreadContent(newState)
        const messages = ContentExtractor.toMessages(threadContent)

        // Extract aiModel from the active thread
        const { selection } = newState
        const $from = selection.$from

        // Find the containing aiChatThread
        let threadNode = null
        for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name === 'aiChatThread') {
                threadNode = node
                break
            }
        }

    // Use thread node's aiModel; if empty, backend will reject so we ensure NodeView assigns first available model earlier
    const aiModel = threadNode?.attrs?.aiModel || ''
        console.log('[AI_DBG][SUBMIT] handleChatRequest', { aiModel, threadHasNode: !!threadNode, threadAttrs: threadNode?.attrs, messagesCount: messages.length })
        this.callback({ messages, aiModel })
    }

    // ========== PLUGIN CREATION ==========

    create(): Plugin {
        return new Plugin({
            key: PLUGIN_KEY,

            state: {
                init: (): AiChatThreadPluginState => ({
                    isReceiving: IS_RECEIVING_TEMP_DEBUG_STATE,
                    insideBackticks: false,
                    backtickBuffer: '',
                    insideCodeBlock: false,
                    codeBuffer: '',
                    decorations: DecorationSet.empty,
                    hoveredThreadId: null
                }),
                apply: (tr: Transaction, prev: AiChatThreadPluginState): AiChatThreadPluginState => {
                    // Handle receiving state toggle
                    const receivingMeta = tr.getMeta('setReceiving')
                    if (receivingMeta !== undefined) {
                        console.log('📡 PLUGIN STATE APPLY: receivingMeta =', receivingMeta, 'prev.isReceiving =', prev.isReceiving, '-> new isReceiving =', receivingMeta)
                        return {
                            ...prev,
                            isReceiving: receivingMeta,
                            decorations: prev.decorations.map(tr.mapping, tr.doc)
                        }
                    }



                    // Handle hover thread ID change
                    const hoverThreadMeta = tr.getMeta('hoverThread')
                    if (hoverThreadMeta !== undefined) {
                        return {
                            ...prev,
                            hoveredThreadId: hoverThreadMeta,
                            decorations: prev.decorations.map(tr.mapping, tr.doc)
                        }
                    }

                    // Handle dropdown option selection
                    const dropdownSelection = tr.getMeta('dropdownOptionSelected')
                    if (dropdownSelection && dropdownSelection.dropdownId?.startsWith('ai-model-dropdown-')) {
                        console.log('[AI_DBG][PLUGIN.apply] dropdownSelection meta received (deferring attr update to appendTransaction)', { dropdownSelection })
                        // We intentionally DO NOT mutate tr/doc here; appendTransaction will perform attr update
                    }

                    // Note: dropdown state toggle is now handled by dropdown primitive plugin
                    // aiChatThreadNode converts threadId-based meta to dropdownId-based meta for the primitive

                    // Map existing decorations to new document
                    return {
                        ...prev,
                        decorations: prev.decorations.map(tr.mapping, tr.doc)
                    }
                }
            },

            appendTransaction: (transactions: Transaction[], _oldState: EditorState, newState: EditorState) => {
                // Handle AI chat requests
                const chatTransaction = transactions.find(tr => tr.getMeta(USE_AI_CHAT_META))
                if (chatTransaction) {
                    this.handleChatRequest(newState)
                }

                // Handle thread insertions
                const insertTransaction = transactions.find(tr => tr.getMeta(INSERT_THREAD_META))
                if (insertTransaction) {
                    return this.handleInsertThread(insertTransaction, newState)
                }

                // Handle deferred aiModel attr update after dropdown selection
                const dropdownTx = transactions.find(tr => tr.getMeta('dropdownOptionSelected'))
                if (dropdownTx) {
                    const dropdownSelection = dropdownTx.getMeta('dropdownOptionSelected')
                    const { option, nodePos } = dropdownSelection || {}
                    let provider = option?.provider
                    let model = option?.model
                    if ((!provider || !model) && option?.title) {
                        const allModels = aiModelsStore.getData()
                        const found = allModels.find(m => m.title === option.title)
                        if (found) {
                            provider = provider || found.provider
                            model = model || found.model
                        }
                    }
                    if (provider && model && typeof nodePos === 'number') {
                        const newModel = `${provider}:${model}`
                        let threadPos = -1
                        let threadNode: PMNode | null = null
                        newState.doc.nodesBetween(0, newState.doc.content.size, (node, pos) => {
                            if (node.type.name === 'aiChatThread') {
                                const threadStart = pos
                                const threadEnd = pos + node.nodeSize
                                if (nodePos >= threadStart && nodePos < threadEnd) {
                                    threadPos = pos
                                    threadNode = node
                                    console.log('[AI_DBG][APPEND_TX] matched thread for aiModel update', { threadPos, nodePos, threadAttrs: node.attrs, newModel })
                                    return false
                                }
                            }
                        })
                        if (threadPos !== -1 && threadNode && threadNode.attrs.aiModel !== newModel) {
                            const tr = newState.tr
                            const newAttrs = { ...threadNode.attrs, aiModel: newModel }
                            tr.setNodeMarkup(threadPos, undefined, newAttrs)
                            console.log('[AI_DBG][APPEND_TX] committing aiModel change', { from: threadNode.attrs.aiModel, to: newModel, threadPos })
                            documentStore.setMetaValues({ requiresSave: true })
                            return tr
                        } else {
                            console.log('[AI_DBG][APPEND_TX] aiModel already current or thread not found', { threadPos, existing: threadNode?.attrs?.aiModel, desired: newModel })
                        }
                    } else {
                        console.log('[AI_DBG][APPEND_TX] insufficient data to update aiModel', { provider, model, nodePos })
                    }
                }

                return null
            },

            view: (view: EditorView) => {
                this.startStreaming(view)

                // Note: Dropdown state bridging removed - now handled by dropdown primitive plugin

                return {
                    destroy: () => {
                        if (this.unsubscribeFromSegments) {
                            this.unsubscribeFromSegments()
                        }
                    }
                }
            },

            props: {
                // Keyboard handling for mod+enter
                handleDOMEvents: {
                    keydown: (_view: EditorView, event: KeyboardEvent) => {
                        // Handle Mod+Enter for AI chat
                        if (KeyboardHandler.isModEnter(event)) {
                            event.preventDefault()
                            const { state, dispatch } = _view
                            const { $from } = state.selection
                            dispatch(state.tr.setMeta(USE_AI_CHAT_META, { pos: $from.pos }))
                            return true
                        }

                        return false
                    }
                },

                // Decorations: combine all independent decoration systems
                decorations: (state: EditorState) => {
                    const pluginState = PLUGIN_KEY.getState(state)
                    const placeholders = this.createPlaceholders(state)
                    const allDecorations = [...placeholders.find()]

                    // Independent receiving state system
                    if (pluginState?.isReceiving) {
                        const receivingDecorations = this.createReceivingStateDecorations(state, pluginState)
                        allDecorations.push(...receivingDecorations)
                    }

                    // Independent thread boundary system
                    if (pluginState?.hoveredThreadId) {
                        const boundaryDecorations = this.createThreadBoundaryDecorations(state, pluginState)
                        allDecorations.push(...boundaryDecorations)
                    }

                    // Note: Dropdown decorations are now handled by the dropdown primitive plugin

                    return DecorationSet.create(state.doc, allDecorations)
                },

                // Node views
                nodeViews: {
                    [aiChatThreadNodeType]: (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
                        aiChatThreadNodeView(node, view, getPos),
                    [aiResponseMessageNodeType]: (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
                        aiResponseMessageNodeView(node, view, getPos),
                }
            }
        })
    }
}

// ========== FACTORY FUNCTION ==========

// Factory function to create the AI Chat Thread plugin
export function createAiChatThreadPlugin(callback: AiChatCallback, placeholderOptions: PlaceholderOptions): Plugin {
    const pluginInstance = new AiChatThreadPluginClass(callback, placeholderOptions)
    return pluginInstance.create()
}
