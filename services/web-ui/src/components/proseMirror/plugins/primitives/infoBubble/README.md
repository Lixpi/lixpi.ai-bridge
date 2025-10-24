# InfoBubble Primitive

Generic floating bubble container for ProseMirror NodeViews. Lives outside the document schema – never part of saved content.

## What it is

A factory function that creates floating bubble UI controls with optional header and body sections. A pure, generic container component that can be used for tooltips, info panels, contextual menus, or any floating UI element with an arrow pointer.

**Key points:**
- Not a document node (no NodeSpec)
- Completely generic - no knowledge of specific content types
- Supports header and body sections
- Side-aware arrow rendering (top/bottom/left/right)
- Appended directly to your controls container
- Returns `{dom, destroy}`

## Architecture

The infoBubble is a pure presentation component:
- **Wrapper** (`.bubble-wrapper`): Positioned container
- **Container** (`.bubble-container`): Main bubble with arrow
- **Header** (`.bubble-header`): Optional top section
- **Body** (`.bubble-body`): Main content area

## Why not document nodes?

Previously, UI controls were ProseMirror document nodes. Problems:
- Rendered in `contentDOM` first, required relocation via `requestAnimationFrame`
- Complex state management via decorations
- Became part of document content (gets serialized)
- NodeView recreated on every interaction

Now: direct DOM append to controls container. Renders instantly where you put it.

## API

### `createInfoBubble(config)`

```typescript
createInfoBubble({
  id: 'unique-id',
  theme?: 'dark' | 'light',
  renderPosition?: 'top' | 'bottom',
  headerContent?: string | HTMLElement,
  bodyContent?: string | HTMLElement,
  visible?: boolean
})
// Returns: { dom: HTMLElement, show: () => void, hide: () => void, destroy: () => void }
```

### Configuration

- `id`: Unique identifier for this bubble
- `theme`: 'dark' or 'light' (default: 'dark')
- `renderPosition`: 'top' or 'bottom' arrow placement (default: 'bottom')
- `headerContent`: Optional HTML string or element for header section
- `bodyContent`: Required HTML string or element for body section
- `visible`: Initial visibility state (default: false)

### Return value

- `dom`: HTMLElement to append to your container
- `show()`: Make bubble visible
- `hide()`: Hide bubble
- `destroy()`: Clean up event listeners and DOM

## Example Usage

```typescript
import { createInfoBubble } from './primitives/infoBubble'

// Simple tooltip
const tooltip = createInfoBubble({
  id: 'node-tooltip',
  bodyContent: 'This is a helpful tooltip',
  theme: 'dark',
  renderPosition: 'top'
})
container.appendChild(tooltip.dom)
tooltip.show()

// Info panel with header
const infoPanel = createInfoBubble({
  id: 'context-info',
  headerContent: '<strong>Context Information</strong>',
  bodyContent: '<ul><li>Item 1</li><li>Item 2</li></ul>',
  theme: 'light',
  renderPosition: 'bottom'
})
```

## Styling

Uses the generic infoBubble SCSS mixins:
- `infoBubblePlacement()` - positioning
- `infoBubbleStructure()` - shape and arrow
- `infoBubbleTheme()` - colors and shadows

No dropdown-specific styles - this is a pure generic component.

## Notes

- This component is intentionally minimal and generic
- For dropdowns with trigger buttons and options, use the `dropdown` primitive instead
- For custom interactions, extend this component or use it as a building block
- The component handles its own DOM structure but not visibility state management
