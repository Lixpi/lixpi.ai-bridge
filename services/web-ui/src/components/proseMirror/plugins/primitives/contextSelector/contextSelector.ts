// @ts-nocheck
import { html } from '../../../components/domTemplates.ts'
import { getBezierPath, Position } from '@xyflow/system'
import { select } from 'd3-selection'
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
}

export function createContextSelector(config: ContextSelectorConfig) {
    const {
        id,
        options,
        selectedValue,
        onChange
    } = config

    let currentValue = selectedValue || options[0]?.value || ''
    let domRef: HTMLElement | null = null

    // Create visualization SVG using D3 for element creation and management
    const createVisualization = (contextValue: string) => {
        if (!domRef) return
        const visualizationContainer = domRef.querySelector('.context-visualization') as HTMLElement
        if (!visualizationContainer) return

        // Clear previous visualization using D3
        select(visualizationContainer).selectAll('*').remove()

        const VIEWBOX_WIDTH = 360
        const VIEWBOX_HEIGHT = 150
    const arrowMarkerId = 'context-viz-arrowhead'
    const arrowMutedMarkerId = 'context-viz-arrowhead-muted'

    const baselineY = 75
    // Use edge-to-edge equal gaps instead of equal center spacing
    const gapX = 30
    const documentCenterX = 74

        const documentLayout = {
            width: 88,
            height: 76,
            radius: 14,
            x: documentCenterX - 44,
            y: baselineY - 38
        }

        // Derived edges for equal-gap positioning
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

        const initSvg = () => {
            const svg = select(visualizationContainer)
                .append('svg')
                .attr('class', 'context-viz-svg')
                .attr('viewBox', `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`)
                .attr('width', '100%')
                .attr('height', VIEWBOX_HEIGHT)

            const defs = svg.append('defs')
            const marker = defs.append('marker')
                .attr('id', arrowMarkerId)
                .attr('class', 'viz-marker')
                .attr('markerWidth', '12')
                .attr('markerHeight', '12')
                .attr('viewBox', '-10 -10 20 20')
                .attr('orient', 'auto')
                .attr('refX', '0')
                .attr('refY', '0')
                .attr('markerUnits', 'strokeWidth')

            marker.append('polyline')
                .attr('points', '-5,-4 0,0 -5,4')
                .attr('class', 'viz-arrowhead-line')

            const markerMuted = defs.append('marker')
                .attr('id', arrowMutedMarkerId)
                .attr('class', 'viz-marker')
                .attr('markerWidth', '12')
                .attr('markerHeight', '12')
                .attr('viewBox', '-10 -10 20 20')
                .attr('orient', 'auto')
                .attr('refX', '0')
                .attr('refY', '0')
                .attr('markerUnits', 'strokeWidth')

            markerMuted.append('polyline')
                .attr('points', '-5,-4 0,0 -5,4')
                .attr('class', 'viz-arrowhead-line-muted')

            return {
                svg,
                defs,
                gEdges: svg.append('g').attr('class', 'viz-edges'),
                gNodes: svg.append('g').attr('class', 'viz-nodes')
            }
        }

        const appendThreadNode = (gNodes: any, layout: { x: number; y: number; width: number; height: number; radius: number }) => {
            const centerY = layout.y + layout.height / 2
            const leftX = layout.x
            const rightX = layout.x + layout.width

            gNodes.append('rect')
                .attr('x', layout.x)
                .attr('y', layout.y)
                .attr('width', layout.width)
                .attr('height', layout.height)
                .attr('rx', layout.radius)
                .attr('class', 'viz-node viz-thread')

            gNodes.append('text')
                .attr('x', layout.x + layout.width / 2)
                .attr('y', centerY)
                .attr('class', 'viz-text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .text('Context')

            return { centerY, leftX, rightX }
        }

        const appendDocumentNode = (gNodes: any, layout: { x: number; y: number; width: number; height: number; radius: number }, lineCount: number, isDisabled = false) => {
            const centerY = layout.y + layout.height / 2
            const rightX = layout.x + layout.width

            gNodes.append('rect')
                .attr('x', layout.x)
                .attr('y', layout.y)
                .attr('width', layout.width)
                .attr('height', layout.height)
                .attr('rx', layout.radius)
                .attr('class', `viz-node viz-document${isDisabled ? ' viz-node-disabled' : ''}`)

            if (lineCount > 0) {
                const paddingX = 12
                const paddingY = 12
                const availableHeight = layout.height - paddingY * 2
                const lineSpacing = lineCount > 1 ? availableHeight / (lineCount - 1) : 0

                for (let i = 0; i < lineCount; i += 1) {
                    const lineY = layout.y + paddingY + lineSpacing * i
                    gNodes.append('line')
                        .attr('x1', layout.x + paddingX)
                        .attr('y1', lineY)
                        .attr('x2', layout.x + layout.width - paddingX)
                        .attr('y2', lineY)
                        .attr('class', `viz-content-line${isDisabled ? ' viz-content-line-disabled' : ''}`)
                }
            }

            return { centerY, rightX }
        }

        const appendLlmCluster = (gNodes: any, layout: { iconX: number; iconY: number; size: number }) => {
            const centerY = layout.iconY + layout.size / 2
            const leftX = layout.iconX

            const llmIcon = gNodes.append('foreignObject')
                .attr('x', layout.iconX)
                .attr('y', layout.iconY)
                .attr('width', layout.size)
                .attr('height', layout.size)

            llmIcon.append('xhtml:div')
                .attr('class', 'viz-llm-icon')
                .html(aiRobotFaceIcon)

            return { leftX, centerY }
        }

        const threadBaselineLayout = threadLayout
        const llmBaselineLayout = llmLayout

        if (contextValue === 'Thread') {
            const { gEdges, gNodes } = initSvg()

            // Render document stack with middle one active
            const docStackHeight = 34
            const docStackGap = 36
            const docLayouts = [-1, 0, 1].map((offset) => ({
                x: documentLayout.x,
                y: baselineY + offset * docStackGap - docStackHeight / 2,
                width: documentLayout.width,
                height: docStackHeight,
                radius: 12
            }))

            // Render top and bottom as disabled, middle as active
            const docAnchors = docLayouts.map((layout, index) => {
                const isMiddle = index === 1
                return appendDocumentNode(gNodes, layout, 3, !isMiddle)
            })

            const threadAnchors = appendThreadNode(gNodes, threadBaselineLayout)
            const llmAnchor = appendLlmCluster(gNodes, llmBaselineLayout)

            // Arrow from middle document to thread
            const middleDoc = docAnchors[1]
            const [docToThreadPath] = getBezierPath({
                sourceX: middleDoc.rightX,
                sourceY: middleDoc.centerY,
                sourcePosition: Position.Right,
                targetX: threadAnchors.leftX,
                targetY: threadAnchors.centerY,
                targetPosition: Position.Left,
                curvature: 0.15
            })

            gEdges.append('path')
                .attr('d', docToThreadPath)
                .attr('class', 'viz-arrow viz-arrow-strong')
                .attr('marker-end', `url(#${arrowMarkerId})`)

            const [threadToLlmPath] = getBezierPath({
                sourceX: threadAnchors.rightX,
                sourceY: threadAnchors.centerY,
                sourcePosition: Position.Right,
                targetX: llmAnchor.leftX - 2,
                targetY: llmAnchor.centerY,
                targetPosition: Position.Left,
                curvature: 0.1
            })

            gEdges.append('path')
                .attr('d', threadToLlmPath)
                .attr('class', 'viz-arrow viz-arrow-strong')
                .attr('marker-end', `url(#${arrowMarkerId})`)

        } else if (contextValue === 'Document') {
            const { gEdges, gNodes } = initSvg()

            const docStackHeight = 34
            const docStackGap = 36
            const docLayouts = [-1, 0, 1].map((offset) => ({
                x: documentLayout.x,
                y: baselineY + offset * docStackGap - docStackHeight / 2,
                width: documentLayout.width,
                height: docStackHeight,
                radius: 12
            }))

            const docAnchors = docLayouts.map((layout) => appendDocumentNode(gNodes, layout, 3))
            const threadAnchors = appendThreadNode(gNodes, threadBaselineLayout)
            const llmAnchor = appendLlmCluster(gNodes, llmBaselineLayout)

            docAnchors.forEach((anchor, index) => {
                const curvature = 0.18 + index * 0.05
                const [docToThreadPath] = getBezierPath({
                    sourceX: anchor.rightX,
                    sourceY: anchor.centerY,
                    sourcePosition: Position.Right,
                    targetX: threadAnchors.leftX,
                    targetY: threadAnchors.centerY,
                    targetPosition: Position.Left,
                    curvature
                })

                gEdges.append('path')
                    .attr('d', docToThreadPath)
                    .attr('class', 'viz-arrow viz-arrow-strong')
                    .attr('marker-end', `url(#${arrowMarkerId})`)
            })

            const [threadToLlmPath] = getBezierPath({
                sourceX: threadAnchors.rightX,
                sourceY: threadAnchors.centerY,
                sourcePosition: Position.Right,
                targetX: llmAnchor.leftX - 2,
                targetY: llmAnchor.centerY,
                targetPosition: Position.Left,
                curvature: 0.1
            })

            gEdges.append('path')
                .attr('d', threadToLlmPath)
                .attr('class', 'viz-arrow viz-arrow-strong')
                .attr('marker-end', `url(#${arrowMarkerId})`)

        } else if (contextValue === 'Workspace') {
            const { gEdges, gNodes } = initSvg()

            const docStackHeight = 34
            const docStackGap = 36
            const docLayouts = [-1, 0, 1].map((offset) => ({
                x: documentLayout.x,
                y: baselineY + offset * docStackGap - docStackHeight / 2,
                width: documentLayout.width,
                height: docStackHeight,
                radius: 12
            }))

            const docAnchors = docLayouts.map((layout) => appendDocumentNode(gNodes, layout, 3))
            const threadAnchors = appendThreadNode(gNodes, threadBaselineLayout)
            const llmAnchor = appendLlmCluster(gNodes, llmBaselineLayout)

            docAnchors.forEach((anchor, index) => {
                const curvature = 0.18 + index * 0.05
                const [docToThreadPath] = getBezierPath({
                    sourceX: anchor.rightX,
                    sourceY: anchor.centerY,
                    sourcePosition: Position.Right,
                    targetX: threadAnchors.leftX,
                    targetY: threadAnchors.centerY,
                    targetPosition: Position.Left,
                    curvature
                })

                gEdges.append('path')
                    .attr('d', docToThreadPath)
                    .attr('class', 'viz-arrow viz-arrow-strong')
                    .attr('marker-end', `url(#${arrowMarkerId})`)
            })

            const [threadToLlmPath] = getBezierPath({
                sourceX: threadAnchors.rightX,
                sourceY: threadAnchors.centerY,
                sourcePosition: Position.Right,
                targetX: llmAnchor.leftX - 2,
                targetY: llmAnchor.centerY,
                targetPosition: Position.Left,
                curvature: 0.16
            })

            gEdges.append('path')
                .attr('d', threadToLlmPath)
                .attr('class', 'viz-arrow viz-arrow-strong')
                .attr('marker-end', `url(#${arrowMarkerId})`)
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
    }

    const destroy = () => {
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
