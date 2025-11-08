// Thread/Document shape factory
// Renders a capsule with a chamfered left wedge directly via SVG path data

import type { ThreadShapeParams } from './types.ts'
import type { NodeConfig } from '../connectors/types.ts'

export function createThreadShape(params: ThreadShapeParams): NodeConfig {
    const {
        id,
        x,
        y,
        width,
        height,
        radius = height / 2,
        lineCount = 3,
    linePadding = {},
        lineSpacingScale,
        label,
        labelClassName,
        className = '',
        disabled = false,
        notchDepth: customNotchDepth,
        notchControlOffset: customControlOffset
    } = params

    const safeRadius = Math.max(4, Math.min(radius, height / 2, (width - 4) / 2))
    const defaultNotchDepth = Math.min(width * 0.14, height * 0.82)
    const notchDepth = Math.max(10, Math.min(customNotchDepth ?? defaultNotchDepth, width - safeRadius - 8))
    const controlOffset = Math.max(5, customControlOffset ?? notchDepth * 0.85)

    const topY = y
    const bottomY = y + height
    const tipX = x
    const tipY = y + height / 2
    const bodyLeftX = x + notchDepth
    const rightArcStartX = x + width - safeRadius
    const rightX = x + width

    const pathData = [
        `M ${bodyLeftX} ${topY}`,
        `H ${rightArcStartX}`,
        `A ${safeRadius} ${safeRadius} 0 0 1 ${rightX} ${topY + safeRadius}`,
        `V ${bottomY - safeRadius}`,
        `A ${safeRadius} ${safeRadius} 0 0 1 ${rightArcStartX} ${bottomY}`,
        `H ${bodyLeftX}`,
        `Q ${tipX + controlOffset} ${bottomY} ${tipX} ${tipY}`,
        `Q ${tipX + controlOffset} ${topY} ${bodyLeftX} ${topY}`,
        'Z'
    ].join(' ')

    const paddingX = linePadding?.x ?? notchDepth * 0.95
    const paddingY = linePadding?.y ?? Math.max(8, height * 0.22)

    const content = label
        ? {
            type: 'text' as const,
            text: label,
            className: labelClassName ?? 'thread-chip-label',
            align: 'middle' as const,
            dx: notchDepth * 0.3,
            dy: 0
        }
        : undefined

    return {
        id,
        shape: 'path',
        x,
        y,
        width,
        height,
        className: `thread-shape thread-chip ${className}`.trim(),
        pathData,
        content,
        disabled,
        anchorOverrides: {
            left: { x: tipX + notchDepth * 0.5, y: tipY }
        }
    }
}
