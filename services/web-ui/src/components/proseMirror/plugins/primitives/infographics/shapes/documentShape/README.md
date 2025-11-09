# Document Shape Primitives

Reusable D3-based primitives for building document visualization components.

Inspired by: https://www.flaticon.com/free-icon/context_9874827
https://www.flaticon.com/authors/freepik
Premium Flaticon License issued to Shelby Carter


## File Structure

```
documentShape/
├── README.md                      # This file
├── index.ts                       # Exports all primitives
├── documentContentBlock.ts        # Lines + squares (top & bottom variants)
├── documentThreadShape.ts         # White rounded border + text
├── documentContextSelection.ts    # Animated gradient background
└── documentShape.ts               # Main composition - combines all primitives
```

## Components

### `documentContentBlock.ts`

Draws document content representation - combinations of lines and squares.

**API:**
```typescript
drawDocumentContentBlock(parent: D3Selection, config: {
  variant: 'top' | 'bottom'
})
```

**Variants:**
- `top`: Square on left + lines with gap + dots (rows above context)
- `bottom`: Lines with gaps + squares on right (rows below context)

**Usage:**
```typescript
import { drawDocumentContentBlock } from './documentShape'

drawDocumentContentBlock(svgGroup, { variant: 'top' })
drawDocumentContentBlock(svgGroup, { variant: 'bottom' })
```

---

### `documentThreadShape.ts`

Draws white rounded border rectangle with centered text label.

**API:**
```typescript
drawDocumentThreadShape(parent: D3Selection, config: {
  text: string
})
```

**Usage:**
```typescript
import { drawDocumentThreadShape } from './documentShape'

drawDocumentThreadShape(svgGroup, { text: 'CONTEXT' })
```

---

### `documentContextSelection.ts`

Handles animated gradient background for context selection.

**API:**
```typescript
// Setup gradient definition in SVG defs
setupContextGradient(defs: D3Selection, config: {
  gradientId: string
  colors?: string[]  // default: ['#a78bfa', '#60a5fa', '#a78bfa']
})

// Draw gradient-filled rectangle
drawContextSelection(parent: D3Selection, config: {
  gradientId: string
})
```

**Usage:**
```typescript
import { setupContextGradient, drawContextSelection } from './documentShape'

// In SVG defs section
setupContextGradient(defs, { gradientId: 'ctx-grad' })

// In SVG content
drawContextSelection(svgGroup, { gradientId: 'ctx-grad' })
```

---

### `documentShape.ts`

Main composition that combines all primitives to create the complete context visualization.

**API:**
```typescript
// Create complete context shape SVG
createContextShapeSVG(): string

// Start gradient animation
startContextShapeAnimation(
  container: HTMLElement,
  nodeId?: string,        // default: 'context'
  duration?: number       // default: 1500ms
): { stop: () => void }
```

**Usage:**
```typescript
import { createContextShapeSVG, startContextShapeAnimation } from './documentShape'

// Create SVG markup
const svgString = createContextShapeSVG()

// Start animation after DOM insertion
const animation = startContextShapeAnimation(containerElement)

// Stop animation when needed
animation.stop()
```

---

## Design Principles

1. **Modularity**: Each primitive is self-contained and reusable
2. **Composition**: Primitives can be combined to create complex visualizations
3. **Exact Positioning**: All coordinates are explicit for pixel-perfect rendering
4. **D3 Native**: Uses standard D3 patterns with chained attribute setters
5. **No Abstractions**: Direct SVG element creation without unnecessary wrappers

## Visual Structure

```
┌─────────────────────────────────┐
│  ■ ─────  ─────────────  • • •  │  ← Top content block
│  ──────────────────────────────  │
├─────────────────────────────────┤
│  ╔═══════════════════════════╗  │
│  ║       CONTEXT             ║  │  ← Thread shape + Context selection
│  ╚═══════════════════════════╝  │
├─────────────────────────────────┤
│  ─────  ─────────                │  ← Bottom content block
│  ──  ────────────         ■ ■ ■  │
└─────────────────────────────────┘
```
