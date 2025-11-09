// Document context selection - animated gradient background

type ContextSelectionConfig = {
    gradientId: string
    colors?: string[]
}

// Sets up the gradient definition in SVG defs
export function setupContextGradient(defs: any, config: ContextSelectionConfig) {
    const colors = config.colors || ['#a78bfa', '#60a5fa', '#a78bfa']

    const gradient = defs.append('linearGradient')
        .attr('id', config.gradientId)
        .attr('x1', '0%').attr('y1', '0%')
        .attr('x2', '100%').attr('y2', '100%')

    colors.forEach((color, i) => {
        gradient.append('stop')
            .attr('offset', `${i * 50}%`)
            .attr('id', `${config.gradientId}-stop-${i}`)
            .style('stop-color', color)
    })
}

// Draws the gradient-filled background rectangle for context selection
export function drawContextSelection(parent: any, config: ContextSelectionConfig) {
    parent.append('rect')
        .attr('x', -25)
        .attr('y', 147.45)
        .attr('width', 562)
        .attr('height', 217.1)
        .attr('rx', 17)
        .attr('ry', 17)
        .attr('fill', `url(#${config.gradientId})`)
}
