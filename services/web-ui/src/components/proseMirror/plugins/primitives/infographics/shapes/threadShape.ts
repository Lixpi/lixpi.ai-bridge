// Thread/Document shape factory
// Creates NodeConfig for a document/thread visual with horizontal content lines

import type { ThreadShapeParams } from './types.ts'
import type { NodeConfig } from '../connectors/types.ts'

// Factory function that creates a properly configured NodeConfig for a thread/document
export function createThreadShape(params: ThreadShapeParams): NodeConfig {
    const {
        id,
        x,
        y,
        width,
        height,
        radius = 12,
        lineCount = 3,
        linePadding = { x: 12, y: 12 },
        className = '',
        disabled = false
    } = params

    return {
        id,
        shape: 'rect',
        x,
        y,
        width,
        height,
        radius,
        className: `thread-shape ${className}`.trim(),
        content: {
            type: 'lines',
            count: lineCount,
            padding: linePadding,
            className: 'thread-content'
        },
        disabled
    }
}
