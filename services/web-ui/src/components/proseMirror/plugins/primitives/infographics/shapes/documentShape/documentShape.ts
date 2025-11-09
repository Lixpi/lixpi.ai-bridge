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
export function createContextShapeSVG(): string {
    const container = select(document.createElement('div'))

    const svg = container.append('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('viewBox', '-30 -30 572 572')
        .attr('width', '512')
        .attr('height', '512')

    const defs = svg.append('defs')
    const g = svg.append('g')

    // Setup gradient definition
    setupContextGradient(defs, { gradientId: 'ctx-grad' })

    // Draw top content block (square + lines above context box)
    drawDocumentContentBlock(g, { variant: 'top' })

    // Draw gradient background selection
    drawContextSelection(g, { gradientId: 'ctx-grad' })

    // Draw thread shape with text
    drawDocumentThreadShape(g, { text: 'CONTEXT' })

    // Draw bottom content block (lines + squares below context box)
    drawDocumentContentBlock(g, { variant: 'bottom' })

    return container.html()
}


// Animation controller for gradient
// Starts animation once SVG content is detected in the DOM
export function startContextShapeAnimation(
    container: HTMLElement,
    nodeId: string = 'context',
    duration: number = 1500
): { stop: () => void } {
    let running = true
    let gradient: any = null

    const loop = () => {
        if (!running || !gradient) return

        gradient
            .transition().duration(duration).ease(customEase)
            .attr('x1', '-50%').attr('x2', '50%')
            .transition().duration(duration).ease(customEase)
            .attr('x1', '0%').attr('x2', '100%')
            .on('end', () => running && loop())
    }

    const foreignObj = select(container)
        .select(`foreignObject#node-${nodeId}`)
        .node() as SVGForeignObjectElement | null

    // Try immediate selection
    if (foreignObj?.children.length) {
        const svg = foreignObj.querySelector('.connector-icon svg')
        if (svg) {
            gradient = select(svg).select('#ctx-grad')
            if (gradient && !gradient.empty()) {
                loop()
                return { stop: () => { running = false; gradient?.interrupt() } }
            }
        }
    }

    // Watch for content insertion
    if (foreignObj) {
        const observer = new MutationObserver(() => {
            const svg = foreignObj.querySelector('.connector-icon svg')
            if (svg) {
                gradient = select(svg).select('#ctx-grad')
                if (gradient && !gradient.empty()) {
                    observer.disconnect()
                    loop()
                }
            }
        })

        observer.observe(foreignObj, { childList: true, subtree: true })
    }

    return { stop: () => { running = false; gradient?.interrupt() } }
}
