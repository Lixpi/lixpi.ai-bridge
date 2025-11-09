// Context visualization primitives with animated gradient background
// Built entirely with D3 using simple, direct SVG element creation

// @ts-ignore - runtime import
import { select } from 'd3-selection'

// Custom easing matching cubic-bezier(0.19, 1, 0.22, 1)
function customEase(t: number): number {
    const t2 = t * t
    const t3 = t2 * t
    const mt = 1 - t
    const mt2 = mt * mt
    return 3 * mt2 * t + 3 * mt * t2 + t3
}

// Creates the context shape SVG from scratch using D3
// Returns complete SVG string with gradient and all shapes
export function createContextShapeSVG(): string {
    const container = select(document.createElement('div'))

    const svg = container.append('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('viewBox', '-30 -30 572 572')
        .attr('width', '512')
        .attr('height', '512')

    // Gradient definition
    const gradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', 'ctx-grad')
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '100%').attr('y2', '100%')

    ;['#a78bfa', '#60a5fa', '#a78bfa'].forEach((color, i) => {
        gradient.append('stop')
            .attr('offset', `${i * 50}%`)
            .attr('id', `ctx-stop-${i}`)
            .style('stop-color', color)
    })

    const g = svg.append('g')

    // Gradient background rectangle
    g.append('rect')
        .attr('x', -25).attr('y', 147.45)
        .attr('width', 562).attr('height', 217.1)
        .attr('rx', 17).attr('ry', 17)
        .attr('fill', 'url(#ctx-grad)')

    // White rounded border (two path segments)
    g.append('path')
        .attr('d', 'M109.583,179.95H17.5c-5.523,0-10,4.477-10,10V322.05c0,5.523,4.477,10,10,10H417')
        .attr('fill', 'none').attr('stroke', 'white')
        .attr('stroke-width', 15).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')

    g.append('path')
        .attr('d', 'M452,332.05h42.5c5.523,0,10-4.477,10-10V189.95c0-5.523-4.477-10-10-10H144.583')
        .attr('fill', 'none').attr('stroke', 'white')
        .attr('stroke-width', 15).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')

    // "CONTEXT" text
    g.append('text')
        .attr('x', 256).attr('y', 270)
        .attr('fill', 'white')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '60px')
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text('CONTEXT')

    // Helper for white stroked shapes
    const addStroke = (elem: any) => elem
        .attr('fill', 'none').attr('stroke', 'white')
        .attr('stroke-width', 15).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')

    // Top square
    addStroke(g.append('rect')
        .attr('x', 12.5).attr('y', 92)
        .attr('width', 42.5).attr('height', 42.5)
        .attr('rx', 5).attr('ry', 5))

    // Top line (row 1) - two segments with gap between 136-163
    addStroke(g.append('line').attr('x1', 92).attr('y1', 94.5).attr('x2', 136).attr('y2', 94.5))
    addStroke(g.append('line').attr('x1', 163).attr('y1', 94.5).attr('x2', 399).attr('y2', 94.5))

    // Top line dots
    ;[425, 461, 497].forEach(x => {
        addStroke(g.append('line').attr('x1', x).attr('y1', 94.5).attr('x2', x + 8).attr('y2', 94.5))
    })

    // Middle line (row 2) - solid, no gaps
    addStroke(g.append('line').attr('x1', 92.119).attr('y1', 132.018).attr('x2', 504.5).attr('y2', 132.018))

    // Bottom line 1 (row 3) - two segments with gap at 183-210
    addStroke(g.append('line').attr('x1', 7.5).attr('y1', 380).attr('x2', 183).attr('y2', 380))
    addStroke(g.append('line').attr('x1', 210).attr('y1', 380).attr('x2', 248.502).attr('y2', 380))

    // Bottom line 2 (row 4) - two segments with gap at 54-89
    addStroke(g.append('line').attr('x1', 7.5).attr('y1', 417.5).attr('x2', 54).attr('y2', 417.5))
    addStroke(g.append('line').attr('x1', 89).attr('y1', 417.5).attr('x2', 248.502).attr('y2', 417.5))

    // Bottom three squares
    ;[286, 371, 457].forEach(x => {
        addStroke(g.append('rect')
            .attr('x', x).attr('y', 377.5)
            .attr('width', 42.5).attr('height', 42.5)
            .attr('rx', 5).attr('ry', 5))
    })

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
