// Context shape factory with animated gradient background
// Renders a browser/code window icon with flowing gradient animation
// Built entirely with D3 - no external SVG dependencies

import { select } from 'd3-selection'

// Custom easing function matching cubic-bezier(0.19, 1, 0.22, 1)
// Smooth, elegant easing similar to Material Design animations
function customEase(t: number): number {
    const p1 = 0.19
    const p2 = 1
    const p3 = 0.22
    const p4 = 1

    const t2 = t * t
    const t3 = t2 * t
    const mt = 1 - t
    const mt2 = mt * mt
    const mt3 = mt2 * mt

    return 3 * mt2 * t * p2 + 3 * mt * t2 * p4 + t3
}

// Reusable shape building blocks
type ShapeBuilder = any

// Creates a rounded rectangle using simple dimensions
function createRoundedRect(
    parent: ShapeBuilder,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    style: Record<string, any>
) {
    parent.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', width)
        .attr('height', height)
        .attr('rx', radius)
        .attr('ry', radius)
        .attrs(style)
}

// Creates a horizontal line
function createHLine(
    parent: ShapeBuilder,
    x1: number,
    x2: number,
    y: number,
    style: Record<string, any>
) {
    parent.append('line')
        .attr('x1', x1)
        .attr('x2', x2)
        .attr('y1', y)
        .attr('y2', y)
        .attrs(style)
}

// Creates a vertical line
function createVLine(
    parent: ShapeBuilder,
    x: number,
    y1: number,
    y2: number,
    style: Record<string, any>
) {
    parent.append('line')
        .attr('x1', x)
        .attr('x2', x)
        .attr('y1', y1)
        .attr('y2', y2)
        .attrs(style)
}

// Creates text label
function createText(parent: ShapeBuilder, text: string, x: number, y: number, style: Record<string, any>) {
    parent.append('text')
        .attr('x', x)
        .attr('y', y)
        .text(text)
        .attrs(style)
}

// Creates the context shape SVG from scratch using D3
// Returns complete SVG string with gradient and all paths
export function createContextShapeSVG(): string {
    const tempContainer = select(document.createElement('div'))

    // SVG dimensions and layout constants
    const viewBox = { x: -30, y: -30, width: 572, height: 572 }
    const browserWindow = { x: 7.5, y: 179.95, width: 497, height: 152.1, radius: 10 }
    const gradientArea = { x: -25, y: 147.45, width: 562, height: 217.1, radius: 17 }
    const textY = { top: 221.189, bottom: 290.811, middle: 256 }

    const svg = tempContainer.append('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`)
        .attr('width', '512')
        .attr('height', '512')

    // Setup animated gradient
    const defs = svg.append('defs')
    const gradient = defs.append('linearGradient')
        .attr('id', 'ctx-grad')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%')

    const gradientColors = ['#a78bfa', '#60a5fa', '#a78bfa']
    gradientColors.forEach((color, i) => {
        gradient.append('stop')
            .attr('offset', `${i * 50}%`)
            .attr('id', `ctx-stop-${i}`)
            .style('stop-color', color)
            .style('stop-opacity', 1)
    })

    const g = svg.append('g')

    // Common stroke styling
    const stroke = {
        fill: 'none',
        stroke: 'white',
        'stroke-width': 15,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
    }

    // Gradient background (extends beyond border)
    createRoundedRect(g, gradientArea.x, gradientArea.y, gradientArea.width, gradientArea.height, gradientArea.radius, { fill: 'url(#ctx-grad)' })

    // Main browser window border (custom paths for exact shape)
    g.append('path')
        .attr('d', 'M109.583,179.95H17.5c-5.523,0-10,4.477-10,10V322.05c0,5.523,4.477,10,10,10H417')
        .attrs(stroke)
    g.append('path')
        .attr('d', 'M452,332.05h42.5c5.523,0,10-4.477,10-10V189.95c0-5.523-4.477-10-10-10H144.583')
        .attrs(stroke)

    // Top browser chrome
    const chrome = g.append('g')
    createRoundedRect(chrome, 12.5, 92, 42.5, 42.5, 5, stroke)
    createHLine(chrome, 92, 136, 94.5, stroke)
    createHLine(chrome, 163, 399, 94.5, stroke)
    createHLine(chrome, 92, 504.5, 132, stroke)

    // Menu dots (three short lines)
    ;[425, 461, 497].forEach(x => createHLine(chrome, x, x + 8, 94.5, stroke))

    // "CONTEXT" text
    createText(g, 'CONTEXT', 256, 270, {
        fill: 'white',
        'font-family': 'Arial, sans-serif',
        'font-size': '60px',
        'font-weight': 'bold',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle'
    })

    // Bottom section - buttons and lines
    const bottom = g.append('g')
    ;[286, 371, 457].forEach((x, i) => {
        createRoundedRect(bottom, x, 377.5, 42.5, 42.5, 5, stroke)
    })

    createHLine(bottom, 208, 248.5, 380, stroke)
    createHLine(bottom, 7.5, 183, 380, stroke)
    createHLine(bottom, 7.5, 54, 417.5, stroke)
    createHLine(bottom, 89, 248.5, 417.5, stroke)

    return tempContainer.html()
}

// Helper to set multiple attributes at once
declare module 'd3-selection' {
    type Selection<GElement extends d3.BaseType, Datum, PElement extends d3.BaseType, PDatum> = {
        attrs(obj: Record<string, string | number>): Selection<GElement, Datum, PElement, PDatum>
    }
}

// Extend D3 selection prototype
const originalSelection = select(document.createElement('div')).constructor.prototype
if (!originalSelection.attrs) {
    originalSelection.attrs = function(obj: Record<string, string | number>) {
        for (const key in obj) {
            this.attr(key, obj[key])
        }
        return this
    }
}

// Animation controller for context shape gradient
// Call this after the SVG is rendered in the DOM
// container - The container element where the foreignObject is rendered
// nodeId - The ID of the node (default: 'context')
// duration - Animation duration in milliseconds (default: 1500)
// Returns object with stop() method to halt the animation
export function startContextShapeAnimation(
    container: HTMLElement,
    nodeId: string = 'context',
    duration: number = 1500
): { stop: () => void } {
    let isRunning = true
    let gradientElement: any = null

    const animate = () => {
        if (!isRunning || !gradientElement) return

        gradientElement
            .transition()
            .duration(duration)
            .ease(customEase)
            .attr('x1', '-50%')
            .attr('x2', '50%')
            .transition()
            .duration(duration)
            .ease(customEase)
            .attr('x1', '0%')
            .attr('x2', '100%')
            .on('end', () => isRunning && animate())
    }

    // Try to find and animate gradient immediately
    const foreignObjNode = select(container)
        .select(`foreignObject#node-${nodeId}`)
        .node() as SVGForeignObjectElement | null

    if (foreignObjNode?.children.length) {
        const svg = foreignObjNode.querySelector('.connector-icon svg')
        if (svg) {
            gradientElement = select(svg).select('#ctx-grad')
            if (gradientElement && !gradientElement.empty()) {
                animate()
                return {
                    stop: () => {
                        isRunning = false
                        if (gradientElement) {
                            gradientElement.interrupt()
                        }
                    }
                }
            }
        }
    }

    // Fallback: Use MutationObserver if content not ready
    if (foreignObjNode) {
        const observer = new MutationObserver(() => {
            const svg = foreignObjNode.querySelector('.connector-icon svg')
            if (svg) {
                gradientElement = select(svg).select('#ctx-grad')
                if (gradientElement && !gradientElement.empty()) {
                    observer.disconnect()
                    animate()
                }
            }
        })

        observer.observe(foreignObjNode, { childList: true, subtree: true })
    }

    return {
        stop: () => {
            isRunning = false
            if (gradientElement) {
                gradientElement.interrupt()
            }
        }
    }
}
