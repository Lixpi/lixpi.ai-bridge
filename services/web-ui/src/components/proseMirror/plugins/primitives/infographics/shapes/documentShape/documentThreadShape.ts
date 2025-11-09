// Document thread shape - white rounded border with centered text

type ThreadShapeConfig = {
    text: string
}

// Draws the white rounded border rectangle with centered text
export function drawDocumentThreadShape(parent: any, config: ThreadShapeConfig) {
    // White rounded border (two path segments - left and right)
    parent.append('path')
        .attr('d', 'M109.583,179.95H17.5c-5.523,0-10,4.477-10,10V322.05c0,5.523,4.477,10,10,10H417')
        .attr('fill', 'none')
        .attr('stroke', 'white')
        .attr('stroke-width', 15)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')

    parent.append('path')
        .attr('d', 'M452,332.05h42.5c5.523,0,10-4.477,10-10V189.95c0-5.523-4.477-10-10-10H144.583')
        .attr('fill', 'none')
        .attr('stroke', 'white')
        .attr('stroke-width', 15)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')

    // Centered text label
    parent.append('text')
        .attr('x', 256)
        .attr('y', 270)
        .attr('fill', 'white')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '60px')
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .text(config.text)
}
