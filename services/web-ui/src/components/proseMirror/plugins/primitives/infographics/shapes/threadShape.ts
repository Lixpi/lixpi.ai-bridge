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
        label,
        labelClassName,
        className = '',
        disabled = false,
        notchDepth: customNotchDepth,
        notchControlOffset: customControlOffset
    } = params

    const defaultNotchDepth = Math.min(width * 0.14, height * 0.82)
    const notchDepth = Math.max(10, Math.min(customNotchDepth ?? defaultNotchDepth, width - 12))
    const rightRadius = 2
    const leftRadius = 4
    const tipRoundness = 2
    const controlOffset = Math.max(4, customControlOffset ?? notchDepth * 0.82)

    const topY = y
    const bottomY = y + height
    const tipX = x
    const tipY = y + height / 2
    const bodyLeftX = x + notchDepth
    const rightArcStartX = x + width - rightRadius
    const rightX = x + width

    const pathData = [
        `M ${bodyLeftX} ${topY}`,
        `L ${rightArcStartX} ${topY}`,
        `A ${rightRadius} ${rightRadius} 0 0 1 ${rightX} ${topY + rightRadius}`,
        `L ${rightX} ${bottomY - rightRadius}`,
        `A ${rightRadius} ${rightRadius} 0 0 1 ${rightArcStartX} ${bottomY}`,
        `L ${bodyLeftX} ${bottomY}`,
        `Q ${tipX + controlOffset} ${bottomY} ${tipX + tipRoundness} ${tipY}`,
        `Q ${tipX + controlOffset} ${topY} ${bodyLeftX} ${topY}`,
        'Z'
    ].join(' ')

    const content = label
        ? {
            type: 'text' as const,
            text: label,
            className: labelClassName ?? 'thread-chip-label',
            align: 'middle' as const,
            dx: 0,
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
            left: { x: tipX + tipRoundness + (notchDepth - tipRoundness) * 0.4, y: tipY }
        }
    }
}
