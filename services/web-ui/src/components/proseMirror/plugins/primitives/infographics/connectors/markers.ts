// Marker (arrowhead) creation and management utilities
// Abstracts SVG marker definitions for reusable edge decorations

import type { Selection } from 'd3-selection'
import type { MarkerType } from './types.ts'

// Marker configuration for a specific marker type
type MarkerConfig = {
    id: string
    markerWidth: number
    markerHeight: number
    viewBox: string
    refX: number
    refY: number
    className: string
    path: string  // SVG path or polyline points
}

// Get marker configuration for a specific marker type
function getMarkerConfig(type: MarkerType, instanceId: string): MarkerConfig | null {
    switch (type) {
        case 'arrowhead':
            return {
                id: `${instanceId}-arrowhead`,
                markerWidth: 12,
                markerHeight: 12,
                viewBox: '-10 -10 20 20',
                refX: 0,
                refY: 0,
                className: 'viz-arrowhead-line',
                path: '-5,-4 0,0 -5,4'  // polyline points
            }

        case 'arrowhead-muted':
            return {
                id: `${instanceId}-arrowhead-muted`,
                markerWidth: 12,
                markerHeight: 12,
                viewBox: '-10 -10 20 20',
                refX: 0,
                refY: 0,
                className: 'viz-arrowhead-line-muted',
                path: '-5,-4 0,0 -5,4'  // polyline points
            }

        case 'circle':
            return {
                id: `${instanceId}-circle`,
                markerWidth: 8,
                markerHeight: 8,
                viewBox: '-4 -4 8 8',
                refX: 0,
                refY: 0,
                className: 'viz-marker-circle',
                path: 'M 0,0 m -2,0 a 2,2 0 1,0 4,0 a 2,2 0 1,0 -4,0'  // circle path
            }

        case 'none':
        default:
            return null
    }
}

// Create marker definitions in SVG defs element
// defs - D3 selection of the defs element
// instanceId - Unique instance identifier for marker IDs
// types - Array of marker types to create
export function createMarkers(
    defs: Selection<SVGDefsElement, unknown, null, undefined>,
    instanceId: string,
    types: MarkerType[]
): void {
    types.forEach(type => {
        if (type === 'none') return

        const config = getMarkerConfig(type, instanceId)
        if (!config) return

        const marker = defs.append('marker')
            .attr('id', config.id)
            .attr('class', 'viz-marker')
            .attr('markerWidth', config.markerWidth)
            .attr('markerHeight', config.markerHeight)
            .attr('viewBox', config.viewBox)
            .attr('orient', 'auto')
            .attr('refX', config.refX)
            .attr('refY', config.refY)
            .attr('markerUnits', 'strokeWidth')

        // Determine whether to use polyline or path based on marker type
        if (type === 'arrowhead' || type === 'arrowhead-muted') {
            marker.append('polyline')
                .attr('points', config.path)
                .attr('class', config.className)
        } else {
            marker.append('path')
                .attr('d', config.path)
                .attr('class', config.className)
        }
    })
}

// Get the marker URL reference for use in SVG path elements
// Returns URL reference string like "url(#instance-arrowhead)" or undefined for 'none'
export function getMarkerUrl(type: MarkerType, instanceId: string): string | undefined {
    if (type === 'none') return undefined
    const config = getMarkerConfig(type, instanceId)
    return config ? `url(#${config.id})` : undefined
}

// Get all unique marker types from a collection of edges
// Useful for determining which markers need to be created
export function collectMarkerTypes(edges: Iterable<{ marker?: MarkerType }>): MarkerType[] {
    const types = new Set<MarkerType>()
    for (const edge of edges) {
        if (edge.marker && edge.marker !== 'none') {
            types.add(edge.marker)
        }
    }
    return Array.from(types)
}
