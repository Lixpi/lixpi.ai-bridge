
import { html } from '../../../components/domTemplates.ts'
import { select } from 'd3-selection'
import { transition } from 'd3-transition'
import { createConnectorRenderer } from '../infographics/connectors/index.ts'
import { createThreadShape, createIconShape, createLabelShape } from '../infographics/shapes/index.ts'
import { aiRobotFaceIcon, contextShape } from '../../../../../svgIcons/index.ts'

// Custom easing function matching cubic-bezier(0.19, 1, 0.22, 1)
// Smooth, elegant easing similar to Material Design animations
function customEase(t: number): number {
    // Approximation of cubic-bezier(0.19, 1, 0.22, 1)
    // This creates a smooth acceleration with gentle deceleration
    const p1 = 0.19
    const p2 = 1
    const p3 = 0.22
    const p4 = 1

    // Cubic bezier formula for Y given t
    const t2 = t * t
    const t3 = t2 * t
    const mt = 1 - t
    const mt2 = mt * mt
    const mt3 = mt2 * mt

    return 3 * mt2 * t * p2 + 3 * mt * t2 * p4 + t3
}

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
    let activeAnimation: { stop: () => void } | null = null

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
        y: baselineY - 21,
        iconX: docRightX + gapX + 27,
        iconY: baselineY - 27,
        size: 54
    }

    const threadRightX = threadLayout.x + threadLayout.width

    const llmLayout = {
        size: 54,
        iconX: threadRightX + gapX,
        iconY: baselineY - 27
    }

    // Create visualization using shape factories and connector system
    const createVisualization = (contextValue: string) => {
        if (!domRef) return
        const visualizationContainer = domRef.querySelector('.context-visualization') as HTMLElement
        if (!visualizationContainer) return

        // Clean up existing connector
        if (connector) {
            connector.destroy()
        }

        // Stop any active animation
        if (activeAnimation) {
            activeAnimation.stop()
            activeAnimation = null
        }

        // Create new connector renderer
        connector = createConnectorRenderer({
            container: visualizationContainer,
            width: VIEWBOX_WIDTH,
            height: VIEWBOX_HEIGHT,
            instanceId
        })

        // Common thread layout parameters
        const docStackHeight = 34
        const docStackGap = 36
        const totalThreads = currentThreadCount
        const startOffset = -(totalThreads - 1) / 2

        // Add document/thread shapes using the thread shape factory
        for (let i = 0; i < totalThreads; i++) {
            const y = baselineY + (startOffset + i) * docStackGap - docStackHeight / 2
            const isCurrentThread = i === currentThreadIdx
            const isActive = contextValue === 'Thread' ? isCurrentThread : true

            // Use the thread shape factory to create a properly configured node
            const threadNode = createThreadShape({
                id: `doc-${i}`,
                x: documentLayout.x,
                y,
                width: documentLayout.width,
                height: docStackHeight,
                radius: 2,
                className: `ctx-document ${isActive ? 'ctx-document-active' : 'ctx-document-muted'}`,
                disabled: !isActive,
                notchDepth: 10,
                notchControlOffset:10
            })

            connector.addNode(threadNode)
        }

        // Add Context icon using the icon shape factory
        // Modify the SVG using D3 to add gradient and white stroke
        const tempContainer = select(document.createElement('div'))
        tempContainer.html(contextShape)

        const svg = tempContainer.select('svg')

        // Insert defs with gradient at the beginning
        let defs = svg.select('defs')
        if (defs.empty()) {
            defs = svg.insert('defs', ':first-child')
        }

        const gradient = defs.append('linearGradient')
            .attr('id', 'ctx-grad')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '100%')
            .attr('gradientUnits', 'userSpaceOnUse')

        // Create multiple color stops for smooth animation
        const stops = [
            { offset: 0, color: '#a78bfa' },
            { offset: 50, color: '#60a5fa' },
            { offset: 100, color: '#a78bfa' }
        ]

        stops.forEach((stop, idx) => {
            gradient.append('stop')
                .attr('offset', `${stop.offset}%`)
                .attr('id', `ctx-stop-${idx}`)
                .style('stop-color', stop.color)
                .style('stop-opacity', 1)
        })

        // Add a filled rectangle background with the gradient
        // Based on the first path: M109.583,179.95H17.5 to M452,332.05h42.5
        // The box goes from x=7.5 (with stroke) to x=504.5, y=179.95 to y=332.05
        svg.select('g').insert('rect', ':first-child')
            .attr('x', 7.5)
            .attr('y', 179.95)
            .attr('width', 497)
            .attr('height', 152.1)
            .attr('rx', 10)
            .attr('ry', 10)
            .attr('fill', 'url(#ctx-grad)')

        // Change all strokes to white
        svg.selectAll('path, line, polyline')
            .style('stroke', 'white')

        // Get the modified SVG as a string
        const contextSvgWithGradient = tempContainer.html()

        const contextNode = createIconShape({
            id: 'context',
            x: threadLayout.iconX,
            y: threadLayout.iconY,
            size: threadLayout.size,
            icon: contextSvgWithGradient,
            className: 'ctx-context'
        })
        connector.addNode(contextNode)

        // Add LLM icon using the icon shape factory
        const llmNode = createIconShape({
            id: 'llm',
            x: llmLayout.iconX,
            y: llmLayout.iconY,
            size: llmLayout.size,
            icon: aiRobotFaceIcon,
            className: 'ctx-llm'
        })
        connector.addNode(llmNode)

        // Add edges based on context mode
        for (let i = 0; i < totalThreads; i++) {
            const isCurrentThread = i === currentThreadIdx

            if (contextValue === 'Thread') {
                // Only current thread connects to context
                if (isCurrentThread) {
                    connector.addEdge({
                        id: `doc-${i}-to-context`,
                        source: { nodeId: `doc-${i}`, position: 'right', offset: { x: 2 } },
                        target: { nodeId: 'context', position: 'left', offset: { x: -6 } },
                        pathType: 'horizontal-bezier',
                        marker: 'arrowhead',
                        lineStyle: 'solid',
                        strokeWidth: 1.5
                    })
                }
            } else {
                // Document and Workspace modes: all threads connect to context
                connector.addEdge({
                    id: `doc-${i}-to-context`,
                    source: { nodeId: `doc-${i}`, position: 'right', offset: { x: 2 } },
                    target: { nodeId: 'context', position: 'left', offset: { x: -6 } },
                    pathType: 'horizontal-bezier',
                    marker: 'arrowhead',
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
            target: { nodeId: 'llm', position: 'left', offset: { x: -6 } },
            pathType: 'bezier',
            marker: 'arrowhead',
            curvature,
            lineStyle: 'solid',
            strokeWidth: 1.5
        })

        // Render all nodes and edges
        connector.render()

        // Start gradient animation on context icon
        const startGradientAnimation = (gradientElement: any) => {
            let isRunning = true

            const animate = () => {
                if (!isRunning) return
                gradientElement
                    .transition()
                    .duration(700)
                    .ease(customEase)
                    .attr('x1', '-50%')
                    .attr('x2', '50%')
                    .transition()
                    .duration(700)
                    .ease(customEase)
                    .attr('x1', '0%')
                    .attr('x2', '100%')
                    .on('end', () => isRunning && animate())
            }

            activeAnimation = {
                stop: () => {
                    isRunning = false
                    gradientElement.interrupt()
                }
            }

            animate()
        }

        // Try to find and animate gradient immediately
        const foreignObjNode = select(visualizationContainer)
            .select('foreignObject#node-context')
            .node() as SVGForeignObjectElement | null

        if (foreignObjNode?.children.length) {
            const svg = foreignObjNode.querySelector('.connector-icon svg')
            const gradientElement = svg && select(svg).select('#ctx-grad')

            if (gradientElement && !gradientElement.empty()) {
                startGradientAnimation(gradientElement)
                return
            }
        }

        // Fallback: Use MutationObserver if content not ready
        if (foreignObjNode) {
            const observer = new MutationObserver(() => {
                const svg = foreignObjNode.querySelector('.connector-icon svg')
                if (svg) {
                    const gradientElement = select(svg).select('#ctx-grad')
                    if (!gradientElement.empty()) {
                        observer.disconnect()
                        startGradientAnimation(gradientElement)
                    }
                }
            })

            observer.observe(foreignObjNode, { childList: true, subtree: true })
        }
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
