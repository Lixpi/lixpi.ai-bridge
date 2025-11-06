# Connector / Infographics System

A reusable abstraction for drawing connections between visual nodes using **XYFlow** edge utilities and **D3** for SVG manipulation.

## Overview

This system provides a declarative API for creating infographic-style visualizations with nodes and connecting edges. It's built on top of:

- **XYFlow** (`@xyflow/system`) — Industry-standard edge path utilities (bezier, straight, smoothstep)
- **D3** (`d3-selection`) — Powerful SVG element creation and manipulation

The connector system is completely **framework-agnostic** and can be used in any context where you need to visualize connections between elements.

## Design Philosophy

The connector system features **Miro-inspired visual design** with:

- **Bold, graceful lines** — 2.5px default stroke width for clear visibility
- **Rounded caps and joins** — Smooth, professional appearance throughout
- **Filled triangle arrowheads** — Prominent, well-proportioned markers (not thin polylines)
- **Refined dashed patterns** — 6px dash, 8px gap for elegant rhythm
- **Rich color saturation** — Vibrant yet professional color palette
- **Precise marker positioning** — Properly scaled and positioned for visual balance

All styling decisions prioritize **clarity, elegance, and professional polish**.

## Architecture

```
connectors/
├── types.ts       # TypeScript type definitions
├── markers.ts     # Marker (arrowhead) creation and management
├── paths.ts       # Path computation wrapping XYFlow utilities
├── renderer.ts    # Main rendering engine coordinating nodes/edges
├── index.ts       # Barrel exports
└── README.md      # This file
```

## Key Concepts

### Nodes

**Nodes** are visual elements that can be connected. Each node has:
- A shape (`rect`, `circle`, or `foreignObject`)
- Position and dimensions (`x`, `y`, `width`, `height`)
- Optional content (text, HTML, lines, icons)
- Computed anchor points (left, right, top, bottom, center)

### Edges

**Edges** are connections between nodes. Each edge has:
- Source and target anchors (node + position)
- Path type (bezier, straight, smoothstep, horizontal-bezier)
- Optional marker (arrowhead)
- Styling (className, dasharray)

### Markers

**Markers** are decorations on edge endpoints (typically arrowheads). The system:
- Auto-generates unique marker IDs to avoid conflicts
- Supports multiple marker styles (arrowhead, arrowhead-muted, circle)
- Automatically creates only the markers actually used by edges

### Coordinate System

All coordinates are in **SVG viewBox space**. You define:
- ViewBox dimensions (e.g., `360 × 150`)
- Node positions in those coordinates
- The system handles path computation and rendering

## API Reference

### `createConnectorRenderer(config)`

Creates a new connector renderer instance.

```typescript
import { createConnectorRenderer } from './primitives/infographics/connectors'

const connector = createConnectorRenderer({
  container: document.querySelector('.visualization'),
  width: 360,
  height: 150,
  instanceId?: 'my-viz'  // Optional unique ID (auto-generated if omitted)
})
```

**Returns:** `ConnectorRenderer` instance with the following methods:

#### `addNode(node: NodeConfig)`

Add a node to the visualization.

```typescript
connector.addNode({
  id: 'doc1',
  shape: 'rect',
  x: 30,
  y: 37,
  width: 88,
  height: 76,
  radius: 14,
  className: 'viz-document',
  content: { type: 'lines', count: 3 },
  disabled: false
})
```

**Node shapes:**
- `rect` — Rectangle (optionally rounded with `radius`)
- `circle` — Circle (uses `radius` or derives from dimensions)
- `foreignObject` — Container for arbitrary HTML/SVG content

**Content types:**
- `{ type: 'text', text: string, className?: string }` — Centered text
- `{ type: 'html', html: string, className?: string }` — Arbitrary HTML
- `{ type: 'lines', count: number, className?: string, padding?: {x, y} }` — Horizontal lines
- `{ type: 'icon', icon: string, className?: string }` — SVG icon

#### `addEdge(edge: EdgeConfig)`

Add an edge connecting two nodes.

```typescript
connector.addEdge({
  id: 'doc-to-thread',
  source: { nodeId: 'doc1', position: 'right' },
  target: { nodeId: 'thread1', position: 'left' },
  pathType: 'bezier',
  marker: 'arrowhead',
  markerStart: 'circle',     // Optional marker at start (for bidirectional)
  lineStyle: 'dashed',       // 'solid' (default) or 'dashed'
  strokeWidth: 2.5,          // Line thickness in pixels (default: 2.5)
  strokeDasharray: '6 8',    // Optional custom dash pattern (overrides lineStyle)
  className: 'custom-edge',
  curvature: 0.25
})
```

**Anchor positions:**
- `'left'`, `'right'`, `'top'`, `'bottom'` — Node perimeter
- `'center'` — Node center

**Path types:**
- `'bezier'` — XYFlow standard bezier (respects Position)
- `'straight'` — Direct line
- `'smoothstep'` — Orthogonal with rounded corners
- `'horizontal-bezier'` — Custom symmetric S-curve for horizontal flows

**Markers (Miro-inspired filled triangles):**
- `'arrowhead'` — Standard filled arrowhead
- `'arrowhead-muted'` — Muted/disabled arrowhead
- `'circle'` — Circle marker
- `'none'` — No marker

**Line styling:**
- `lineStyle` — Quick toggle: `'solid'` (default) or `'dashed'` (6px dash, 8px gap)
- `strokeWidth` — Line thickness in pixels (default: 2.5)
- `strokeDasharray` — Custom dash pattern (e.g., `'6 8'`), overrides `lineStyle`
- All lines have rounded caps and joins for smooth appearance

#### `removeNode(nodeId: string)`

Remove a node and all connected edges.

```typescript
connector.removeNode('doc1')
```

#### `removeEdge(edgeId: string)`

Remove an edge.

```typescript
connector.removeEdge('doc-to-thread')
```

#### `updateNode(nodeId: string, updates: Partial<NodeConfig>)`

Update node properties.

```typescript
connector.updateNode('doc1', {
  disabled: true,
  className: 'viz-document viz-node-disabled'
})
```

#### `updateEdge(edgeId: string, updates: Partial<EdgeConfig>)`

Update edge properties.

```typescript
connector.updateEdge('doc-to-thread', {
  pathType: 'straight',
  marker: 'circle'
})
```

#### `render()`

Render all nodes and edges to the SVG.

```typescript
connector.render()
```

**Note:** You must call `render()` after adding/updating nodes and edges.

#### `clear()`

Remove all nodes and edges, reset state.

```typescript
connector.clear()
```

#### `destroy()`

Clean up all resources and remove SVG from container.

```typescript
connector.destroy()
```

#### `getNode(nodeId: string)`

Get node configuration.

```typescript
const node = connector.getNode('doc1')
```

#### `getEdge(edgeId: string)`

Get edge configuration.

```typescript
const edge = connector.getEdge('doc-to-thread')
```

#### `getAnchor(nodeId: string, position: AnchorPosition)`

Get computed anchor coordinates.

```typescript
const anchor = connector.getAnchor('doc1', 'right')
// => { x: 118, y: 75 }
```

## Usage Examples

### Basic Example

```typescript
import { createConnectorRenderer } from './primitives/infographics/connectors'

// Create renderer
const connector = createConnectorRenderer({
  container: document.querySelector('.visualization'),
  width: 400,
  height: 200
})

// Add nodes
connector.addNode({
  id: 'source',
  shape: 'rect',
  x: 50, y: 75,
  width: 100, height: 50,
  radius: 8,
  className: 'viz-node viz-source',
  content: { type: 'text', text: 'Source' }
})

connector.addNode({
  id: 'target',
  shape: 'rect',
  x: 250, y: 75,
  width: 100, height: 50,
  radius: 8,
  className: 'viz-node viz-target',
  content: { type: 'text', text: 'Target' }
})

// Add edge
connector.addEdge({
  id: 'source-to-target',
  source: { nodeId: 'source', position: 'right' },
  target: { nodeId: 'target', position: 'left' },
  pathType: 'bezier',
  marker: 'arrowhead',
  className: 'viz-arrow'
})

// Render
connector.render()
```

### Dynamic Updates

```typescript
// Update node state
connector.updateNode('source', { disabled: true })

// Update edge path
connector.updateEdge('source-to-target', {
  pathType: 'smoothstep',
  strokeDasharray: '4 4'
})

// Re-render
connector.render()
```

### Multiple Paths

```typescript
const nodes = ['node1', 'node2', 'node3']

// Add nodes
nodes.forEach((id, i) => {
  connector.addNode({
    id,
    shape: 'rect',
    x: 50 + i * 150,
    y: 75,
    width: 80,
    height: 50,
    radius: 10,
    className: 'viz-node',
    content: { type: 'text', text: `Node ${i + 1}` }
  })
})

// Connect nodes
connector.addEdge({
  id: 'edge1',
  source: { nodeId: 'node1', position: 'right' },
  target: { nodeId: 'node2', position: 'left' },
  pathType: 'bezier',
  marker: 'arrowhead'
})

connector.addEdge({
  id: 'edge2',
  source: { nodeId: 'node2', position: 'right' },
  target: { nodeId: 'node3', position: 'left' },
  pathType: 'bezier',
  marker: 'arrowhead'
})

connector.render()
```

### Complex Content

```typescript
// Node with document lines
connector.addNode({
  id: 'document',
  shape: 'rect',
  x: 30, y: 40,
  width: 88, height: 76,
  radius: 14,
  className: 'viz-document',
  content: {
    type: 'lines',
    count: 4,
    className: 'viz-content-line',
    padding: { x: 12, y: 12 }
  }
})

// Node with icon
connector.addNode({
  id: 'llm',
  shape: 'foreignObject',
  x: 250, y: 50,
  width: 54, height: 54,
  className: 'viz-llm',
  content: {
    type: 'icon',
    icon: '<svg>...</svg>',
    className: 'viz-llm-icon'
  }
})
```

## Integration with contextSelector

The contextSelector has been refactored to use this connector system. Here's how:

### Before (Inline Logic)

```typescript
// Hard-coded node rendering
const docNode = gNodes.append('rect')
  .attr('x', x)
  .attr('y', y)
  ...

// Hard-coded edge rendering
const path = buildHorizontalBezierPath(...)
gEdges.append('path')
  .attr('d', path)
  ...
```

### After (Using Connectors)

```typescript
import { createConnectorRenderer } from './primitives/infographics/connectors'

const connector = createConnectorRenderer({
  container: visualizationContainer,
  width: 360,
  height: 150
})

// Declarative node definitions
connector.addNode({
  id: 'doc1',
  shape: 'rect',
  ...
})

// Declarative edge definitions
connector.addEdge({
  id: 'doc-to-thread',
  source: { nodeId: 'doc1', position: 'right' },
  target: { nodeId: 'thread', position: 'left' },
  pathType: 'horizontal-bezier',
  marker: 'arrowhead'
})

connector.render()
```

## Styling

The connector system applies standard CSS classes that should be styled via SCSS:

```scss
.viz-node {
  fill: rgba(19, 26, 41, 0.88);
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 1.25;
}

.viz-node-disabled {
  opacity: 0.4;
}

.viz-arrow {
  fill: none;
  stroke: rgba(177, 177, 183, 0.85);
  stroke-width: 1.05;
}

.viz-arrowhead-line {
  fill: none;
  stroke: rgba(177, 177, 183, 0.85);
  stroke-width: 1.05;
}

.viz-text {
  fill: rgba(243, 244, 246, 0.96);
  font-size: 13px;
  font-weight: 600;
}

.viz-content-line {
  stroke: rgba(156, 163, 175, 0.35);
  stroke-width: 1;
}
```

## Advanced Usage

### Custom Path Types

You can extend the path system by modifying `paths.ts`:

```typescript
// Add new path type to PathType union
export type PathType = ... | 'custom-s-curve'

// Implement in computePath function
case 'custom-s-curve': {
  const path = buildCustomSCurve(...)
  return { path, labelX, labelY, offsetX, offsetY }
}
```

### Custom Markers

Add new marker types in `markers.ts`:

```typescript
case 'diamond':
  return {
    id: `${instanceId}-diamond`,
    markerWidth: 10,
    markerHeight: 10,
    viewBox: '-5 -5 10 10',
    refX: 0,
    refY: 0,
    className: 'viz-marker-diamond',
    path: 'M 0,-3 L 3,0 L 0,3 L -3,0 Z'
  }
```

### Performance Considerations

- **Batch operations**: Add multiple nodes/edges before calling `render()`
- **Selective updates**: Use `updateNode`/`updateEdge` instead of remove + add
- **Memory**: Call `destroy()` when done to clean up event listeners and DOM

## Design Principles

1. **Declarative**: Define what you want, not how to render it
2. **Composable**: Nodes and edges are independent, reusable building blocks
3. **Framework-agnostic**: Works in any JavaScript environment
4. **Type-safe**: Full TypeScript support with comprehensive types
5. **Extensible**: Easy to add new path types, markers, and node shapes

## XYFlow Integration

This system wraps XYFlow's battle-tested edge utilities:

- `getBezierPath` — Curved edges with configurable curvature
- `getStraightPath` — Direct line connections
- `getSmoothStepPath` — Orthogonal routing with rounded corners

All paths respect anchor positions (left, right, top, bottom) and compute proper control points automatically.

## Credits

Built on top of:
- [XYFlow](https://github.com/xyflow/xyflow) — React/Svelte flow library with excellent edge utilities
- [D3](https://d3js.org/) — The gold standard for SVG manipulation

Inspired by the XYFlow documentation structure and design patterns.
