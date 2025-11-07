# Shapes System

Reusable visual shape primitives for infographic rendering. Provides abstractions for common diagram elements like documents, icons, and labels.

## Philosophy

Shapes are **presentation-only primitives** that:
- Render SVG visual elements (rectangles, lines, text, icons)
- Provide anchor points for edge connections
- Are completely decoupled from business logic
- Can be styled via CSS classes
- Are framework-agnostic

**Shapes handle WHAT to draw, not WHERE or WHY.**

## Architecture

Each shape is a factory function that returns a `ShapeRenderer`:

```typescript
type ShapeRenderer = {
    render: (container: SVGGElement) => void
    getAnchors: () => ShapeAnchors
    update: (config: Partial<ShapeConfig>) => void
    destroy: () => void
}
```

### Separation of Concerns

- **Shapes** (this module): Visual rendering only
- **Connectors** (`../connectors`): Edge/arrow rendering
- **Consumer** (e.g., contextSelector): Layout, state, orchestration

## Available Shapes

### ThreadShape

Renders a document/thread visual with horizontal content lines.

```typescript
import { createThreadShape } from './shapes'

const thread = createThreadShape({
    id: 'doc-1',
    x: 100,
    y: 100,
    width: 88,
    height: 34,
    radius: 12,           // Corner radius (default: 12)
    lineCount: 3,         // Number of lines (default: 3)
    linePadding: { x: 12, y: 12 },  // Line padding
    className: 'my-thread',
    disabled: false
})

// Render into SVG group
const svg = d3.select('svg')
const shapesGroup = svg.append('g').attr('class', 'shapes')
thread.render(shapesGroup)

// Get anchor points for edges
const anchors = thread.getAnchors()
// { left: {x, y}, right: {x, y}, top: {x, y}, bottom: {x, y}, center: {x, y} }
```

**CSS Classes:**
- `.thread-shape-rect` - Rectangle container
- `.thread-shape-line` - Content lines
- `.thread-shape-disabled` - Disabled state

### IconShape

Renders an SVG icon in a foreignObject container.

```typescript
import { createIconShape } from './shapes'

const icon = createIconShape({
    id: 'llm',
    x: 300,
    y: 100,
    size: 54,
    icon: '<svg>...</svg>',  // SVG string
    className: 'my-icon',
    disabled: false
})

icon.render(shapesGroup)
```

**CSS Classes:**
- `.icon-shape-container` - ForeignObject wrapper
- `.icon-shape-content` - Inner div with flexbox centering
- `.icon-shape-disabled` - Disabled state

### LabelShape

Renders text content in a rounded rectangle.

```typescript
import { createLabelShape } from './shapes'

const label = createLabelShape({
    id: 'context',
    x: 200,
    y: 100,
    width: 96,
    height: 42,
    radius: 16,
    text: 'Context',
    className: 'my-label',
    disabled: false
})

label.render(shapesGroup)
```

**CSS Classes:**
- `.label-shape-rect` - Rectangle container
- `.label-shape-text` - Text element
- `.label-shape-disabled` - Disabled state

## Usage Pattern

Typical workflow for building an infographic:

```typescript
import { select } from 'd3-selection'
import { createThreadShape, createIconShape, createLabelShape } from './shapes'
import { createConnectorRenderer } from './connectors'

// 1. Create container
const container = document.querySelector('.visualization')
const svg = select(container)
    .append('svg')
    .attr('viewBox', '0 0 400 200')

// 2. Create groups for shapes and edges
const shapesGroup = svg.append('g').attr('class', 'shapes')
const edgesGroup = svg.append('g').attr('class', 'edges')

// 3. Create and render shapes
const docShape = createThreadShape({
    id: 'doc',
    x: 50, y: 75,
    width: 88, height: 34,
    lineCount: 3
})
docShape.render(shapesGroup)

const contextShape = createLabelShape({
    id: 'context',
    x: 180, y: 75,
    width: 96, height: 42,
    text: 'Context'
})
contextShape.render(shapesGroup)

const llmShape = createIconShape({
    id: 'llm',
    x: 320, y: 75,
    size: 54,
    icon: aiRobotIcon
})
llmShape.render(shapesGroup)

// 4. Get anchors for edge connections
const docAnchors = docShape.getAnchors()
const contextAnchors = contextShape.getAnchors()
const llmAnchors = llmShape.getAnchors()

// 5. Create connector for edges
const connector = createConnectorRenderer({
    container: edgesGroup.node(),
    width: 400,
    height: 200
})

// 6. Add edges using shape anchors
connector.addEdge({
    id: 'doc-to-context',
    source: {
        nodeId: 'doc',
        position: 'right',
        // Use anchor coordinates from shape
    },
    target: {
        nodeId: 'context',
        position: 'left'
    },
    marker: 'arrowhead'
})

connector.render()

// 7. Update shapes dynamically
docShape.update({ disabled: true })
contextShape.update({ text: 'Updated Context' })

// 8. Clean up
docShape.destroy()
contextShape.destroy()
llmShape.destroy()
connector.destroy()
```

## Styling

All shapes expose base CSS classes for styling. **Consumer components should add semantic classes** via the `className` property:

```typescript
const thread = createThreadShape({
    // ...
    className: 'ctx-document'  // Semantic class for styling
})
```

Then in your consumer's SCSS:

```scss
.ctx-document {
    .thread-shape-rect {
        fill: rgba(16, 185, 129, 0.12);
        stroke: rgba(52, 211, 153, 0.75);
    }
}
```

## Integration with Connectors

Shapes and connectors are designed to work together:

1. **Shapes** render visual nodes
2. **Connectors** render edges between nodes
3. **Anchors** bridge the two systems

```typescript
// Shape provides anchors
const anchors = shape.getAnchors()

// Connector uses anchors for edge endpoints
connector.addEdge({
    source: { nodeId: shape.id, position: 'right' },
    target: { nodeId: otherShape.id, position: 'left' }
})
```

The connector system automatically resolves anchor coordinates based on node IDs and positions.

## Design Principles

1. **Single Responsibility**: Each shape does ONE thing well
2. **Composable**: Shapes can be combined to create complex diagrams
3. **Decoupled**: No knowledge of consumer business logic
4. **Type-Safe**: Full TypeScript support
5. **Testable**: Pure functions with predictable output

## When to Create a New Shape

Create a new shape when you have a **reusable visual pattern** that:
- Appears in multiple contexts
- Has clear anchor points for connections
- Can be parameterized via configuration
- Is presentation-only (no business logic)

## When NOT to Use Shapes

Don't use shapes for:
- One-off visuals specific to a single component
- Complex interactive diagrams (use full diagram library)
- Business logic or state management
- Layout computation (shapes only render, not layout)

## Future Extensions

Possible additions:
- `createCircleShape` - Circular nodes
- `createStackShape` - Stacked document visual
- `createBadgeShape` - Small badge/indicator
- `createGroupShape` - Container for multiple shapes

## Credits

- D3 for DOM manipulation
- Inspired by XYFlow's node abstraction
- Built for the Lixpi contextSelector system
