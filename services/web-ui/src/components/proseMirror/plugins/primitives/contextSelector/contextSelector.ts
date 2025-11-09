
import { html } from '../../../components/domTemplates.ts'
import { createConnectorRenderer } from '../infographics/connectors/index.ts'
import {
    createIconShape,
    createContextShapeSVG,
    startContextShapeAnimation
} from '../infographics/shapes/index.ts'
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
    let activeAnimations: Array<{ stop: () => void }> = []

    // Generate unique instance ID for this selector
    const instanceId = `ctx-${Math.random().toString(36).substr(2, 9)}`

    // Layout constants
    const VIEWBOX_WIDTH = 340
    const VIEWBOX_HEIGHT = 160
    const baselineY = 80
    const documentLayout = {
        width: 92,
        height: 92,
        x: 36,
        y: baselineY - 46
    }

    const docRightX = documentLayout.x + documentLayout.width
    const connectorGap = 120

    const llmLayout = {
        size: 58,
        iconX: docRightX + connectorGap,
        iconY: baselineY - 29
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
        if (activeAnimations.length > 0) {
            activeAnimations.forEach(anim => anim.stop())
            activeAnimations = []
        }

        // Create new connector renderer
        connector = createConnectorRenderer({
            container: visualizationContainer,
            width: VIEWBOX_WIDTH,
            height: VIEWBOX_HEIGHT,
            instanceId
        })

        // Common document stacking parameters
        const docStackGap = 60
        const totalThreads = currentThreadCount
        const startOffset = -(totalThreads - 1) / 2

        // Add document shapes using the document block factory
        for (let i = 0; i < totalThreads; i++) {
            const y = baselineY + (startOffset + i) * docStackGap - documentLayout.height / 2
            const isCurrentThread = i === currentThreadIdx
            const isActive = contextValue === 'Thread' ? isCurrentThread : true

            const documentNode = createIconShape({
                id: `doc-${i}`,
                x: documentLayout.x,
                y,
                size: documentLayout.width,
                icon: createContextShapeSVG({ withGradient: isActive, instanceId: `doc-${i}` }),
                className: `document-block-shape ctx-document ${isActive ? 'ctx-document-active' : 'ctx-document-muted'}`,
                disabled: contextValue === 'Thread' ? !isCurrentThread : false
            })

            connector.addNode(documentNode)
        }

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

            const shouldConnect = contextValue === 'Thread'
                ? isCurrentThread
                : true

            if (shouldConnect) {
                connector.addEdge({
                    id: `doc-${i}-to-llm`,
                    source: { nodeId: `doc-${i}`, position: 'right', offset: { x: 2 } },
                    target: { nodeId: 'llm', position: 'left', offset: { x: -6 } },
                    pathType: 'horizontal-bezier',
                    marker: 'arrowhead',
                    lineStyle: 'solid',
                    strokeWidth: 1.6,
                    curvature: contextValue === 'Workspace' ? 0.18 : 0.12
                })
            }
        }

        // Render all nodes and edges
        connector.render()

        // Start the context shape gradient animation for all active documents
        if (contextValue === 'Thread') {
            // Only animate the active thread
            const animationTargetId = `doc-${currentThreadIdx}`
            const animationGradientId = `ctx-grad-${animationTargetId}`
            activeAnimations.push(startContextShapeAnimation(visualizationContainer, animationTargetId, 1000, animationGradientId))
        } else {
            // Animate all documents
            for (let i = 0; i < totalThreads; i++) {
                const animationTargetId = `doc-${i}`
                const animationGradientId = `ctx-grad-${animationTargetId}`
                activeAnimations.push(startContextShapeAnimation(visualizationContainer, animationTargetId, 1000, animationGradientId))
            }
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
        // Clean up animations
        if (activeAnimations.length > 0) {
            activeAnimations.forEach(anim => anim.stop())
            activeAnimations = []
        }
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
