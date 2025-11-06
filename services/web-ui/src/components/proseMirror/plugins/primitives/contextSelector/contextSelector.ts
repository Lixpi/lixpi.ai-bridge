// @ts-nocheck
import { html } from '../../../components/domTemplates.ts'
import { createConnectorRenderer } from '../infographics/connectors/index.ts'
import { aiRobotFaceIcon } from '../../../../../svgIcons/index.ts'

type ContextOption = {
    label: string
    value: string
    icon?: string
}

type ContextSelectorConfig = {
    id: string
    options: ContextOption[]
    selectedValue?: string
    onChange?: (value: string) => void
    threadCount?: number           // Total number of threads in document
    currentThreadIndex?: number    // This thread's position (0-based)
}

export function createContextSelector(config: ContextSelectorConfig) {
    const {
        id,
        options,
        selectedValue,
        onChange,
        threadCount = 3,
        currentThreadIndex = 1
    } = config

    let currentValue = selectedValue || options[0]?.value || ''
    let currentThreadCount = threadCount
    let currentThreadIdx = currentThreadIndex
    let domRef: HTMLElement | null = null
    let connector: ReturnType<typeof createConnectorRenderer> | null = null

    // Generate unique instance ID for this selector
    const instanceId = `ctx-${Math.random().toString(36).substr(2, 9)}`

    // Layout constants
    const VIEWBOX_WIDTH = 360
    const VIEWBOX_HEIGHT = 150
    const baselineY = 75
    const gapX = 30
    const documentCenterX = 74

    const documentLayout = {
        width: 88,
        height: 76,
        radius: 14,
        x: documentCenterX - 44,
        y: baselineY - 38
    }

    const docRightX = documentLayout.x + documentLayout.width

    const threadLayout = {
        width: 96,
        height: 42,
        radius: 16,
        x: docRightX + gapX,
        y: baselineY - 21
    }

    const threadRightX = threadLayout.x + threadLayout.width

    const llmLayout = {
        size: 54,
        iconX: threadRightX + gapX,
        iconY: baselineY - 27
    }

    // Create visualization using the connector system
    const createVisualization = (contextValue: string) => {
        if (!domRef) return
        const visualizationContainer = domRef.querySelector('.context-visualization') as HTMLElement
        if (!visualizationContainer) return

        // Clean up existing connector
        if (connector) {
            connector.destroy()
        }

        // Create new connector renderer
        connector = createConnectorRenderer({
            container: visualizationContainer,
            width: VIEWBOX_WIDTH,
            height: VIEWBOX_HEIGHT,
            instanceId
        })

        // Add Context (thread) node
        connector.addNode({
            id: 'context',
            shape: 'rect',
            x: threadLayout.x,
            y: threadLayout.y,
            width: threadLayout.width,
            height: threadLayout.height,
            radius: threadLayout.radius,
            className: 'viz-thread',
            content: { type: 'text', text: 'Context' }
        })

        // Add LLM node
        connector.addNode({
            id: 'llm',
            shape: 'foreignObject',
            x: llmLayout.iconX,
            y: llmLayout.iconY,
            width: llmLayout.size,
            height: llmLayout.size,
            content: { type: 'icon', icon: aiRobotFaceIcon, className: 'viz-llm-icon' }
        })

        // Common thread layout parameters
        const docStackHeight = 34
        const docStackGap = 36
        const totalThreads = currentThreadCount
        const startOffset = -(totalThreads - 1) / 2

        // Add document/thread nodes
        for (let i = 0; i < totalThreads; i++) {
            const y = baselineY + (startOffset + i) * docStackGap - docStackHeight / 2
            const isCurrentThread = i === currentThreadIdx
            const isActive = contextValue === 'Thread' ? isCurrentThread : true

            connector.addNode({
                id: `doc-${i}`,
                shape: 'rect',
                x: documentLayout.x,
                y,
                width: documentLayout.width,
                height: docStackHeight,
                radius: 12,
                className: 'viz-document',
                content: { type: 'lines', count: 3 },
                disabled: !isActive
            })

            // Add edges based on context mode
            if (contextValue === 'Thread') {
                // Only current thread connects to context
                if (isCurrentThread) {
                    connector.addEdge({
                        id: `doc-${i}-to-context`,
                        source: { nodeId: `doc-${i}`, position: 'right', offset: { x: 2 } },
                        target: { nodeId: 'context', position: 'left', offset: { x: -2 } },
                        pathType: 'horizontal-bezier',
                        marker: 'arrowhead',
                        className: 'viz-arrow-strong',
                        lineStyle: 'solid',
                        strokeWidth: 1.5
                    })
                }
            } else {
                // Document and Workspace modes: all threads connect to context
                connector.addEdge({
                    id: `doc-${i}-to-context`,
                    source: { nodeId: `doc-${i}`, position: 'right', offset: { x: 2 } },
                    target: { nodeId: 'context', position: 'left', offset: { x: -2 } },
                    pathType: 'horizontal-bezier',
                    marker: 'arrowhead',
                    className: 'viz-arrow-strong',
                    lineStyle: 'solid',
                    strokeWidth: 1.5
                })
            }
        }

        // Add edge from context to LLM
        const curvature = contextValue === 'Workspace' ? 0.16 : 0.1
        connector.addEdge({
            id: 'context-to-llm',
            source: { nodeId: 'context', position: 'right', offset: { x: 2 } },
            target: { nodeId: 'llm', position: 'left', offset: { x: -4 } },
            pathType: 'bezier',
            marker: 'arrowhead',
            className: 'viz-arrow-strong',
            curvature,
            lineStyle: 'solid',
            strokeWidth: 1.5
        })

        // Render all nodes and edges
        connector.render()
    }

    // Handle button click
    const handleOptionClick = (optionValue: string) => {
        if (currentValue === optionValue) return // Already selected

        currentValue = optionValue

        // Update button states
        buttons.forEach((btn, idx) => {
            if (options[idx].value === optionValue) {
                btn.classList.add('selected')
                btn.setAttribute('aria-pressed', 'true')
            } else {
                btn.classList.remove('selected')
                btn.setAttribute('aria-pressed', 'false')
            }
        })

        // Update visualization
        createVisualization(optionValue)

        // Call onChange callback
        onChange?.(optionValue)
    }

    // Create buttons for each option
    const buttons: HTMLElement[] = []
    const buttonElements = options.map((option, idx) => {
        const isSelected = option.value === currentValue

        const button = html`
            <button
                type="button"
                className="context-option-button ${isSelected ? 'selected' : ''}"
                onclick=${() => handleOptionClick(option.value)}
                role="radio"
                aria-checked="${isSelected}"
                aria-pressed="${isSelected}"
                data-value="${option.value}"
            >
                ${option.icon ? html`<span className="option-icon" innerHTML=${option.icon}></span>` : ''}
                <span className="option-label">${option.label}</span>
            </button>
        ` as HTMLElement

        buttons.push(button)
        return button
    })

    // Create the container with visualization area
    const dom = html`
        <div className="context-selector" id="${id}" role="radiogroup" aria-label="Context Selector">
            <div className="context-options flex gap-2 p-1">
                ${buttonElements}
            </div>
            <div className="context-visualization"></div>
        </div>
    ` as HTMLElement

    // Store DOM reference
    domRef = dom

    // Initialize visualization
    setTimeout(() => createVisualization(currentValue), 0)

    // Public API
    const getValue = () => currentValue

    const setValue = (value: string) => {
        const option = options.find(opt => opt.value === value)
        if (option) {
            handleOptionClick(value)
        }
    }

    const update = (newConfig: Partial<ContextSelectorConfig>) => {
        if (newConfig.selectedValue !== undefined) {
            setValue(newConfig.selectedValue)
        }

        // Update thread count and index if provided
        if (newConfig.threadCount !== undefined) {
            currentThreadCount = newConfig.threadCount
        }
        if (newConfig.currentThreadIndex !== undefined) {
            currentThreadIdx = newConfig.currentThreadIndex
        }

        // Re-render visualization if thread state changed
        if (newConfig.threadCount !== undefined || newConfig.currentThreadIndex !== undefined) {
            createVisualization(currentValue)
        }
    }

    const destroy = () => {
        // Clean up connector
        if (connector) {
            connector.destroy()
            connector = null
        }
        // Clean up event listeners (handled automatically by DOM removal)
        buttons.length = 0
        domRef = null
    }

    return {
        dom,
        getValue,
        setValue,
        update,
        destroy
    }
}
