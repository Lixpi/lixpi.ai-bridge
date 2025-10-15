// AI Chat Thread Plugin - Modular Architecture
// This plugin consolidates AI chat functionality for ProseMirror:
// - Keyboard triggers (Mod+Enter)
// - Content extraction from chat threads
// - AI response streaming and insertion
// - Thread NodeViews with controls
// - Placeholder decorations

import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state'
import { Selection } from 'prosemirror-state'
import { TextSelection } from 'prosemirror-state'
import { Fragment, Slice } from 'prosemirror-model'
import { EditorView, Decoration, DecorationSet, NodeView } from 'prosemirror-view'
import { Node as PMNode, Schema } from 'prosemirror-model'
import { nodeTypes, nodeViews } from '../../customNodes/index.js'
import { documentTitleNodeType } from '../../customNodes/documentTitleNode.js'
import { aiChatThreadNodeType, aiChatThreadNodeView } from './aiChatThreadNode.ts'
import { AI_CHAT_THREAD_PLUGIN_KEY, USE_AI_CHAT_META, STOP_AI_CHAT_META } from './aiChatThreadPluginConstants.ts'
import { aiResponseMessageNodeType, aiResponseMessageNodeView } from './aiResponseMessageNode.ts'
import SegmentsReceiver from '../../../../services/segmentsReceiver-service.js'
import { documentStore } from '../../../../stores/documentStore.ts'
import { aiModelsStore } from '../../../../stores/aiModelsStore.ts'
import type { AiModelId } from '@lixpi/constants'

const IS_RECEIVING_TEMP_DEBUG_STATE = false    // For debug purposes only

// ========== TYPE DEFINITIONS ==========

import type { AiChatSendMessagePayload, AiChatStopMessagePayload } from '@lixpi/constants'

type SendAiRequestHandler = (data: AiChatSendMessagePayload) => void
type StopAiRequestHandler = (data: AiChatStopMessagePayload) => void
type PlaceholderOptions = { titlePlaceholder: string; paragraphPlaceholder: string }
type StreamStatus = 'START_STREAM' | 'STREAMING' | 'END_STREAM'
type SegmentEvent = {
    status: StreamStatus
    aiProvider?: string
    threadId?: string
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
    receivingThreadIds: Set<string>
    activeStreamIds: Map<string, string> // threadId -> streamId mapping
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

    // Find the active aiChatThread containing the cursor and extract content
    // If threadContext is 'Document', extract from ALL threads in the document
    static getActiveThreadContent(state: EditorState, threadContext: string = 'Thread', nodePos?: number): ThreadContent[] {
        if (threadContext === 'Document') {
            // Extract content from ALL threads in the document
            return ContentExtractor.getAllThreadsContent(state)
        }

        // Default behavior: extract from active thread only
        let thread: PMNode | null = null

        // If nodePos provided, use it to find the thread directly
        if (nodePos !== undefined) {
            // getPos() returns the start position of the node
            // Try to get the node directly at this position
            thread = state.doc.nodeAt(nodePos)
            
            // If that didn't work, try resolving and walking up
            if (!thread || thread.type.name !== aiChatThreadNodeType) {
                const resolvedPos = state.doc.resolve(nodePos + 1) // +1 to get inside the node
                for (let depth = resolvedPos.depth; depth >= 0; depth--) {
                    const node = resolvedPos.node(depth)
                    if (node.type.name === aiChatThreadNodeType) {
                        thread = node
                        break
                    }
                }
            }
            
            console.log('🎯 [CONTENT_EXTRACT] Using explicit nodePos:', { 
                nodePos, 
                foundThread: !!thread,
                threadId: thread?.attrs?.threadId,
                threadNodeType: thread?.type?.name
            })
        } else {
            // Fallback: use selection position
            const { $from } = state.selection
            for (let depth = $from.depth; depth > 0; depth--) {
                const node = $from.node(depth)
                if (node.type.name === aiChatThreadNodeType) {
                    thread = node
                    break
                }
            }
            console.log('⚠️ [CONTENT_EXTRACT] Using selection fallback')
        }

        if (!thread) {
            console.error('❌ [CONTENT_EXTRACT] No thread found!', { nodePos })
            return []
        }

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

    // Extract content from ALL aiChatThread nodes in the document
    static getAllThreadsContent(state: EditorState): ThreadContent[] {
        const allThreadsContent: ThreadContent[] = []
        let threadCount = 0

        state.doc.descendants((node, pos) => {
            if (node.type.name === aiChatThreadNodeType) {
                threadCount++

                // Add a thread separator if not the first thread
                if (threadCount > 1) {
                    allThreadsContent.push({
                        nodeType: 'thread_separator',
                        textContent: '\n--- Thread Separator ---\n'
                    })
                }

                // Extract content from this thread
                node.forEach(block => {
                    // Skip dropdown nodes
                    if (block.type.name === 'dropdown') {
                        return
                    }

                    const formattedText = ContentExtractor.collectFormattedText(block)
                    const simpleText = ContentExtractor.collectText(block)

                    // Include blocks that have any text content
                    if (block.textContent || formattedText) {
                        let textContent = formattedText || block.textContent

                        // For top-level code blocks, format with triple backticks (if not already formatted)
                        if (block.type.name === 'code_block' && !textContent.includes('```')) {
                            textContent = `\`\`\`\n${textContent}\n\`\`\``
                        }

                        allThreadsContent.push({
                            nodeType: block.type.name,
                            textContent: textContent
                        })
                    }
                })
            }
        })

        console.log('Extracted content from all threads:', { threadCount, contentItems: allThreadsContent.length })
        return allThreadsContent
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
    static findThreadInsertionPoint(state: EditorState, threadId?: string): {
        insertPos: number
        trailingEmptyParagraphPos: number | null
    } | null {
        let result: { insertPos: number; trailingEmptyParagraphPos: number | null } | null = null

        state.doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name !== aiChatThreadNodeType) return
            
            // If threadId specified, only match that thread
            if (threadId && node.attrs?.threadId !== threadId) return

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
    static findResponseNode(state: EditorState, threadId?: string, targetStreamId?: string): {
        found: boolean
        endOfNodePos?: number
        childCount?: number
    } {
        // If we know the thread, search only inside that thread and pick the response matching the streamId
        if (threadId) {
            let endOfNodePos: number | undefined
            let childCount: number | undefined

            state.doc.descendants((node: PMNode, pos: number) => {
                if (node.type.name !== aiChatThreadNodeType) return
                if (node.attrs?.threadId !== threadId) return

                // If we have a streamId, ONLY match the exact node with that streamId
                if (targetStreamId) {
                    node.descendants((child: PMNode, relPos: number) => {
                        if (child.type.name !== aiResponseMessageNodeType) return
                        const attrs = child.attrs as any
                        if (attrs?.streamId === targetStreamId) {
                            const absPos = pos + relPos + 1
                            endOfNodePos = absPos + child.nodeSize
                            childCount = child.childCount
                        }
                    })
                } else {
                    // Fallback: pick the best candidate (receiving first, then newest)
                    let bestAbsPos: number | undefined
                    let bestChildCount: number | undefined
                    let bestScore = -1 // 2: isReceiving, 1: isInitialRender, 0: any response

                    node.descendants((child: PMNode, relPos: number) => {
                        if (child.type.name !== aiResponseMessageNodeType) return
                        const absPos = pos + relPos + 1
                        const attrs = child.attrs as any
                        const score = attrs?.isReceivingAnimation ? 2 : (attrs?.isInitialRenderAnimation ? 1 : 0)
                        // Prefer higher score or, if equal, the later (newer) node
                        if (score > bestScore || (score === bestScore && absPos > (bestAbsPos || 0))) {
                            bestScore = score
                            bestAbsPos = absPos + child.nodeSize // end position of node
                            bestChildCount = child.childCount
                        }
                    })

                    if (bestAbsPos !== undefined) {
                        endOfNodePos = bestAbsPos
                        childCount = bestChildCount
                    }
                }

                return false // stop after this thread
            })

            if (endOfNodePos !== undefined) return { found: true, endOfNodePos, childCount }
            return { found: false }
        }

        // Fallback: no thread specified – pick the most recent receiving response globally
        let bestEndPos: number | undefined
        let bestChildCount: number | undefined
        let bestScore = -1
        state.doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name !== aiResponseMessageNodeType) return
            const attrs = node.attrs as any
            const score = attrs?.isReceivingAnimation ? 2 : (attrs?.isInitialRenderAnimation ? 1 : 0)
            const endPos = pos + node.nodeSize
            if (score > bestScore || (score === bestScore && endPos > (bestEndPos || 0))) {
                bestScore = score
                bestEndPos = endPos
                bestChildCount = node.childCount
            }
        })
        if (bestEndPos !== undefined) return { found: true, endOfNodePos: bestEndPos, childCount: bestChildCount }
        return { found: false }
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
    private sendAiRequestHandler: SendAiRequestHandler
    private stopAiRequestHandler: StopAiRequestHandler
    private placeholderOptions: PlaceholderOptions
    private unsubscribeFromSegments: (() => void) | null = null

    constructor({
        sendAiRequestHandler,
        stopAiRequestHandler,
        placeholders
    }: {
        sendAiRequestHandler: SendAiRequestHandler
        stopAiRequestHandler: StopAiRequestHandler
        placeholders: PlaceholderOptions
    }) {
        this.sendAiRequestHandler = sendAiRequestHandler
        this.stopAiRequestHandler = stopAiRequestHandler
        this.placeholderOptions = placeholders
    }

    // ========== STREAMING MANAGEMENT ==========

    private startStreaming(view: EditorView): void {
        this.unsubscribeFromSegments = SegmentsReceiver.subscribeToeceiveSegment((event: SegmentEvent) => {
            const { status, aiProvider, segment, threadId } = event
            const { state, dispatch } = view

            switch (status) {
                case 'START_STREAM':
                    console.log('🔴 [PLUGIN] START_STREAM', { threadId, aiProvider })
                    this.handleStreamStart(state, dispatch, aiProvider, threadId)
                    break
                case 'STREAMING':
                    if (segment) this.handleStreaming(state, dispatch, segment, threadId, aiProvider)
                    break
                case 'END_STREAM':
                    console.log('🟢 [PLUGIN] END_STREAM', { threadId })
                    this.handleStreamEnd(state, dispatch, threadId)
                    break
            }
        })
    }

    private handleStreamStart(state: EditorState, dispatch: (tr: Transaction) => void, aiProvider?: string, threadId?: string): void {
        const threadInfo = PositionFinder.findThreadInsertionPoint(state, threadId)
        if (!threadInfo) return

        const { insertPos, trailingEmptyParagraphPos } = threadInfo
        
        // Generate unique stream ID for this stream session
        const streamId = `${threadId || 'global'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        
        const aiResponseNode = state.schema.nodes[aiResponseMessageNodeType].create({
            isInitialRenderAnimation: true,
            isReceivingAnimation: true,
            aiProvider,
            streamId // Mark this node with unique stream ID
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

            // Set receiving state for this specific thread AND store the stream ID
            if (threadId) {
                tr.setMeta('setReceiving', { threadId, receiving: true, streamId })
                console.log('🔴 [PLUGIN] Response node created', { threadId, streamId, pos: insertPos })
            }
            dispatch(tr)
        } catch (error) {
            console.error('Error inserting aiResponseMessage:', error)
        }
    }

    private handleStreaming(
        state: EditorState,
        dispatch: (tr: Transaction) => void,
        segment: SegmentEvent['segment'],
        threadId?: string,
        aiProvider?: string
    ): void {
        if (!segment) return

        // Get the active streamId for this thread from plugin state
        const pluginState = PLUGIN_KEY.getState(state)
        const targetStreamId = threadId ? pluginState?.activeStreamIds.get(threadId) : undefined

        let tr = state.tr
        const responseInfo = PositionFinder.findResponseNode(state, threadId, targetStreamId)

        // Create response node if missing (fallback) in the correct thread
        if (!responseInfo.found) {
            console.warn('⚠️ [PLUGIN] No response node found!', { threadId, streamId: targetStreamId })
            this.createResponseFallback(state, dispatch, threadId, aiProvider)
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

    private handleStreamEnd(state: EditorState, dispatch: (tr: Transaction) => void, threadId?: string): void {
        state.doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name === aiResponseMessageNodeType && node.attrs.isInitialRenderAnimation) {
                // If threadId is provided, verify this response is in the correct thread
                if (threadId) {
                    let isInCorrectThread = false
                    state.doc.nodesBetween(0, pos, (n: PMNode) => {
                        if (n.type.name === aiChatThreadNodeType && n.attrs?.threadId === threadId) {
                            isInCorrectThread = true
                            return false
                        }
                    })
                    if (!isInCorrectThread) return // Skip this response node
                }

                const tr = state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    isInitialRenderAnimation: false,
                    isReceivingAnimation: false
                })

                // Only set receiving to false if debug mode is off
                if (!IS_RECEIVING_TEMP_DEBUG_STATE && threadId) {
                    tr.setMeta('setReceiving', { threadId, receiving: false })
                }

                dispatch(tr)
                return false // Stop after first match
            }
        })
    }

    private createResponseFallback(state: EditorState, dispatch: (tr: Transaction) => void, threadId?: string, aiProvider?: string): void {
        const threadInfo = PositionFinder.findThreadInsertionPoint(state, threadId)
        if (!threadInfo) return

        const { insertPos, trailingEmptyParagraphPos } = threadInfo
        const responseNode = state.schema.nodes[aiResponseMessageNodeType].create({
            isInitialRenderAnimation: true,
            isReceivingAnimation: true,
            aiProvider: aiProvider || 'Anthropic'
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
        state.doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name === 'aiChatThread') {
                let cssClass = 'ai-chat-thread'
                const threadId = node.attrs?.threadId
                if (threadId && pluginState.receivingThreadIds.has(threadId)) {
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

        // Find all ai-chat-thread nodes and add boundary visibility to ALL threads (always visible)
        state.doc.descendants((node: PMNode, pos: number) => {
            if (node.type.name === 'aiChatThread') {
                // Apply boundary visibility class to all threads
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

        state.doc.descendants((node: PMNode, pos: number) => {
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

        const { $from } = newState.selection

        // Find if cursor is inside an existing aiChatThread
        let currentThreadDepth = -1
        for (let depth = $from.depth; depth >= 0; depth--) {
            if ($from.node(depth).type.name === aiChatThreadNodeType) {
                currentThreadDepth = depth
                break
            }
        }

        // Insert after current thread or after current top-level block
        let insertPos: number
        if (currentThreadDepth !== -1) {
            const threadPos = $from.before(currentThreadDepth)
            const threadNode = $from.node(currentThreadDepth)
            insertPos = threadPos + threadNode.nodeSize
        } else {
            insertPos = $from.after(1)
        }

        let tr = newState.tr.replace(insertPos, insertPos, new Slice(Fragment.from(threadNode), 0, 0))

        // Set cursor inside new thread's paragraph (insertPos + 2)
        const cursorPos = insertPos + 2
        tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos))

        return tr
    }    private handleChatRequest(newState: EditorState, transaction: Transaction): void {
        // Get threadId and nodePos from meta (passed from button click)
        const meta = transaction.getMeta(USE_AI_CHAT_META)
        const threadIdFromMeta = meta?.threadId
        const nodePosFromMeta = meta?.nodePos

        console.log('🎯 [SUBMIT] Button clicked', { threadIdFromMeta, nodePosFromMeta })

        // Find the thread node by position
        let threadNode = null
        if (nodePosFromMeta !== undefined) {
            // nodePos is the position of the thread node itself
            threadNode = newState.doc.nodeAt(nodePosFromMeta)
            console.log('📍 [SUBMIT] Found thread by nodePos', { 
                nodeType: threadNode?.type?.name,
                threadId: threadNode?.attrs?.threadId,
                aiModel: threadNode?.attrs?.aiModel
            })
        }

        // Fallback: try to find by cursor position if meta missing
        if (!threadNode || threadNode.type.name !== 'aiChatThread') {
            console.log('⚠️ [SUBMIT] Using cursor fallback')
            const { selection } = newState
            const $from = selection.$from
            for (let depth = $from.depth; depth >= 0; depth--) {
                const node = $from.node(depth)
                if (node.type.name === 'aiChatThread') {
                    threadNode = node
                    break
                }
            }
        }

        // Use thread node's attributes
        const aiModel = threadNode?.attrs?.aiModel || ''
        const threadContext = threadNode?.attrs?.threadContext || 'Thread'
        const threadId = threadIdFromMeta || threadNode?.attrs?.threadId || ''

        // Validate aiModel is selected
        if (!aiModel) {
            console.error('❌ [SUBMIT] Cannot send request - no AI model selected!', { threadId })
            alert('Please select an AI model from the dropdown before submitting.')
            return
        }

        // Extract content based on thread context - PASS nodePos to extract from correct thread!
        const threadContent = ContentExtractor.getActiveThreadContent(newState, threadContext, nodePosFromMeta)
        const messages = ContentExtractor.toMessages(threadContent)

        console.log('🚀 [SUBMIT] Sending to AI', {
            threadId,
            aiModel,
            threadContext,
            messagesCount: messages.length
        })
        this.sendAiRequestHandler({ messages, aiModel, threadId })
    }

    private handleStopRequest(transaction: Transaction): void {
        const meta = transaction.getMeta(STOP_AI_CHAT_META)
        const { threadId } = meta || {}

        console.log('[AI_STOP] handleStopRequest called', { threadId })

        this.stopAiRequestHandler({ threadId })
    }

    // ========== PLUGIN CREATION ==========

    create(): Plugin {
        return new Plugin({
            key: PLUGIN_KEY,

            state: {
                init: (): AiChatThreadPluginState => ({
                    receivingThreadIds: new Set<string>(),
                    activeStreamIds: new Map<string, string>(),
                    insideBackticks: false,
                    backtickBuffer: '',
                    insideCodeBlock: false,
                    codeBuffer: '',
                    decorations: DecorationSet.empty,
                    hoveredThreadId: null
                }),
                apply: (tr: Transaction, prev: AiChatThreadPluginState): AiChatThreadPluginState => {
                    // Handle receiving state toggle per thread
                    const receivingMeta = tr.getMeta('setReceiving')
                    if (receivingMeta !== undefined) {
                        const { threadId, receiving, streamId } = receivingMeta
                        if (threadId) {
                            const newSet = new Set(prev.receivingThreadIds)
                            const newStreamMap = new Map(prev.activeStreamIds)
                            if (receiving) {
                                newSet.add(threadId)
                                if (streamId) {
                                    newStreamMap.set(threadId, streamId)
                                }
                            } else {
                                newSet.delete(threadId)
                                newStreamMap.delete(threadId)
                            }
                            return {
                                ...prev,
                                receivingThreadIds: newSet,
                                activeStreamIds: newStreamMap,
                                decorations: prev.decorations.map(tr.mapping, tr.doc)
                            }
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
                        console.log('[AI_DBG][PLUGIN.apply] aiModel dropdownSelection meta received (deferring attr update to appendTransaction)', { dropdownSelection })
                        // We intentionally DO NOT mutate tr/doc here; appendTransaction will perform attr update
                    }
                    if (dropdownSelection && dropdownSelection.dropdownId?.startsWith('thread-context-dropdown-')) {
                        console.log('[AI_DBG][PLUGIN.apply] threadContext dropdownSelection meta received (deferring attr update to appendTransaction)', { dropdownSelection })
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
                    this.handleChatRequest(newState, chatTransaction)
                }

                // Handle AI chat stop requests
                const stopTransaction = transactions.find(tr => tr.getMeta(STOP_AI_CHAT_META))
                if (stopTransaction) {
                    this.handleStopRequest(stopTransaction)
                }

                // Handle thread insertions
                const insertTransaction = transactions.find(tr => tr.getMeta(INSERT_THREAD_META))
                if (insertTransaction) {
                    return this.handleInsertThread(insertTransaction, newState)
                }                // Handle deferred dropdown attr updates after dropdown selection
                const dropdownTx = transactions.find(tr => tr.getMeta('dropdownOptionSelected'))
                if (dropdownTx) {
                    const dropdownSelection = dropdownTx.getMeta('dropdownOptionSelected')
                    const { option, nodePos, dropdownId } = dropdownSelection || {}

                    // Handle AI model dropdown selection
                    if (dropdownId?.startsWith('ai-model-dropdown-')) {
                        let provider = option?.provider
                        let model = option?.model
                        if ((!provider || !model) && option?.title) {
                            const allModels = aiModelsStore.getData()
                            const found = allModels.find((m: any) => m.title === option.title)
                            if (found) {
                                provider = provider || found.provider
                                model = model || found.model
                            }
                        }
                        if (provider && model && typeof nodePos === 'number') {
                            const newModel = `${provider}:${model}`
                            let threadPos = -1
                            let threadNode: PMNode | null = null
                            newState.doc.nodesBetween(0, newState.doc.content.size, (node: PMNode, pos: number) => {
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

                    // Handle thread context dropdown selection
                    if (dropdownId?.startsWith('thread-context-dropdown-')) {
                        const newContext = option?.value || option?.title
                        if (newContext && typeof nodePos === 'number') {
                            let threadPos = -1
                            let threadNode: PMNode | null = null
                            newState.doc.nodesBetween(0, newState.doc.content.size, (node: PMNode, pos: number) => {
                                if (node.type.name === 'aiChatThread') {
                                    const threadStart = pos
                                    const threadEnd = pos + node.nodeSize
                                    if (nodePos >= threadStart && nodePos < threadEnd) {
                                        threadPos = pos
                                        threadNode = node
                                        console.log('[AI_DBG][APPEND_TX] matched thread for threadContext update', { threadPos, nodePos, threadAttrs: node.attrs, newContext })
                                        return false
                                    }
                                }
                            })
                            if (threadPos !== -1 && threadNode && threadNode.attrs.threadContext !== newContext) {
                                const tr = newState.tr
                                const newAttrs = { ...threadNode.attrs, threadContext: newContext }
                                tr.setNodeMarkup(threadPos, undefined, newAttrs)
                                console.log('[AI_DBG][APPEND_TX] committing threadContext change', { from: threadNode.attrs.threadContext, to: newContext, threadPos })
                                documentStore.setMetaValues({ requiresSave: true })
                                return tr
                            } else {
                                console.log('[AI_DBG][APPEND_TX] threadContext already current or thread not found', { threadPos, existing: threadNode?.attrs?.threadContext, desired: newContext })
                            }
                        } else {
                            console.log('[AI_DBG][APPEND_TX] insufficient data to update threadContext', { newContext, nodePos })
                        }
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

                    // Independent receiving state system - show receiving state for threads that are receiving
                    if (pluginState && pluginState.receivingThreadIds.size > 0) {
                        const receivingDecorations = this.createReceivingStateDecorations(state, pluginState)
                        allDecorations.push(...receivingDecorations)
                    }

                    // Independent thread boundary system - always visible
                    const boundaryDecorations = this.createThreadBoundaryDecorations(state, pluginState)
                    allDecorations.push(...boundaryDecorations)

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
export function createAiChatThreadPlugin({
    sendAiRequestHandler,
    stopAiRequestHandler,
    placeholders
}: {
    sendAiRequestHandler: SendAiRequestHandler
    stopAiRequestHandler: StopAiRequestHandler
    placeholders: PlaceholderOptions
}): Plugin {
    const pluginInstance = new AiChatThreadPluginClass({ sendAiRequestHandler, stopAiRequestHandler, placeholders })
    return pluginInstance.create()
}
