// Context document visualization - composed from modular document shape primitives
// Built entirely with D3 using reusable components

// @ts-ignore - runtime import
import { select } from 'd3-selection'
import { setupContextGradient, drawContextSelection } from './documentContextSelection.ts'
import { drawDocumentThreadShape } from './documentThreadShape.ts'
import { drawDocumentContentBlock } from './documentContentBlock.ts'

// Custom easing matching cubic-bezier(0.19, 1, 0.22, 1)
function customEase(t: number): number {
    const t2 = t * t
    const t3 = t2 * t
    const mt = 1 - t
    const mt2 = mt * mt
    return 3 * mt2 * t + 3 * mt * t2 + t3
}

// Creates the context shape SVG from scratch using modular primitives
// Returns complete SVG string with gradient and all shapes
export function createContextShapeSVG(config?: { withGradient?: boolean; instanceId?: string }): string {
    const withGradient = config?.withGradient !== false
    const instanceId = config?.instanceId || 'default'
    const gradientId = `ctx-grad-${instanceId}`
    const threadGradientId = `ctx-thread-grad-${instanceId}`
    const container = select(document.createElement('div'))

    const svg = container.append('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('viewBox', '-30 -30 572 572')
        .attr('width', '512')
        .attr('height', '512')

    const defs = svg.append('defs')
    const g = svg.append('g')

    // Setup gradient definitions
    const colors = ['#a78bfa', '#60a5fa', '#a78bfa']
    if (withGradient) {
        setupContextGradient(defs, { gradientId, colors })
        // Setup linear gradient for thread stroke with diagonal orientation
        // that will be rotated to create continuous flow effect
        const threadGradient = defs.append('linearGradient')
            .attr('id', threadGradientId)
            .attr('gradientUnits', 'userSpaceOnUse')
            .attr('x1', '0').attr('y1', '256')  // Center of the shape
            .attr('x2', '512').attr('y2', '256')

        // Create smooth gradient with more blue, less purple
        const extendedColors = [
            '#60a5fa',  // blue
            '#7c9ff9',  // blue-purple transition
            // '#b6a4eeff',  // purple
            '#a0afe8ff',  // purple
            '#7c9ff9',  // purple-blue transition
            '#60a5fa'   // blue
        ]

        const numRepeats = 2
        for (let i = 0; i <= numRepeats * extendedColors.length; i++) {
            const colorIndex = i % extendedColors.length
            const offset = (i / (numRepeats * extendedColors.length)) * 100
            threadGradient.append('stop')
                .attr('offset', `${offset}%`)
                .style('stop-color', extendedColors[colorIndex])
        }
    }

    // Draw top content block (square + lines above context box)
    drawDocumentContentBlock(g, { variant: 'top' })

    // T
    // Draw gradient background selection
    // if (withGradient) {
    //     drawContextSelection(g, { gradientId })
    // }

    // Draw thread shape with text (with optional gradient stroke)
    drawDocumentThreadShape(g, {
        text: 'THREAD',
        gradientId: withGradient ? threadGradientId : undefined,
        colors
    })

    // Draw bottom content block (lines + squares below context box)
    drawDocumentContentBlock(g, { variant: 'bottom' })

    return container.html()
}


// Animation controller for gradient
// Starts animation once SVG content is detected in the DOM
export function startContextShapeAnimation(
    container: HTMLElement,
    nodeId: string = 'context',
    duration: number = 1500,
    gradientId: string = 'ctx-grad',
    animateThreadGradient: boolean = false,
    threadGradientId: string = 'ctx-thread-grad'
): { stop: () => void } {
    let running = true
    let gradient: any = null
    let threadGradient: any = null

    const loop = () => {
        if (!running || !gradient) return

        gradient
            .transition().duration(duration).ease(customEase)
            .attr('x1', '-50%').attr('x2', '50%')
            .transition().duration(duration).ease(customEase)
            .attr('x1', '0%').attr('x2', '100%')
            .on('end', () => running && loop())
    }

    const threadLoop = () => {
        if (!running || !threadGradient) return

        // Get current angle and calculate new position for rotation effect
        const centerX = 256
        const centerY = 256
        const radius = 300

        let angle = 0

        const animate = () => {
            if (!running) return

            // Calculate gradient endpoints based on rotating angle
            const x1 = centerX + radius * Math.cos(angle)
            const y1 = centerY + radius * Math.sin(angle)
            const x2 = centerX + radius * Math.cos(angle + Math.PI)
            const y2 = centerY + radius * Math.sin(angle + Math.PI)

            threadGradient
                .transition()
                .duration(50)  // Small steps for smooth rotation
                .ease(customEase)
                .attr('x1', x1)
                .attr('y1', y1)
                .attr('x2', x2)
                .attr('y2', y2)
                .on('end', () => {
                    angle -= 0.1  // Negative for counterclockwise
                    if (running) animate()
                })
        }

        animate()
    }

    const foreignObj = select(container)
        .select(`foreignObject#node-${nodeId}`)
        .node() as SVGForeignObjectElement | null

    // Try immediate selection
    if (foreignObj?.children.length) {
        const svg = foreignObj.querySelector('.connector-icon svg')
        if (svg) {
            gradient = select(svg).select(`#${gradientId}`)
            if (gradient && !gradient.empty()) {
                loop()

                // Animate thread gradient if requested
                if (animateThreadGradient) {
                    threadGradient = select(svg).select(`#${threadGradientId}`)
                    if (threadGradient && !threadGradient.empty()) {
                        threadLoop()
                    }
                }

                return {
                    stop: () => {
                        running = false
                        gradient?.interrupt()
                        threadGradient?.interrupt()
                    }
                }
            }
        }
    }

    // Watch for content insertion
    if (foreignObj) {
        const observer = new MutationObserver(() => {
            const svg = foreignObj.querySelector('.connector-icon svg')
            if (svg) {
                gradient = select(svg).select(`#${gradientId}`)
                if (gradient && !gradient.empty()) {
                    observer.disconnect()
                    loop()

                    // Animate thread gradient if requested
                    if (animateThreadGradient) {
                        threadGradient = select(svg).select(`#${threadGradientId}`)
                        if (threadGradient && !threadGradient.empty()) {
                            threadLoop()
                        }
                    }
                }
            }
        })

        observer.observe(foreignObj, { childList: true, subtree: true })
    }

    return {
        stop: () => {
            running = false
            gradient?.interrupt()
            threadGradient?.interrupt()
        }
    }
}
