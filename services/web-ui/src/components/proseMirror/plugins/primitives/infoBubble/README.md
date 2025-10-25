# InfoBubble Primitive

Generic floating bubble container for ProseMirror NodeViews. Lives outside the document schema – never part of saved content.

## What it is

A factory function that creates floating bubble UI controls with optional header and body sections. **Manages its own state** including open/close, click handling, and mutual exclusion with other bubbles.

**Key points:**
- Not a document node (no NodeSpec)
- Completely generic - no knowledge of specific content types
- **Owns its visibility state and event handling**
- Attaches click handler to provided anchor element
- Handles click-outside-to-close automatically
- **Enforces mutual exclusion** - only one bubble open at a time
- Supports header and body sections
- Side-aware arrow rendering (top/bottom/left/right)
- Appended directly to your controls container
- Returns `{dom, open, close, toggle, isOpen, destroy}`

## Architecture

The infoBubble is a **stateful interactive component**:
- **Wrapper** (`.bubble-wrapper`): Positioned container
- **Container** (`.bubble-container`): Main bubble with arrow
- **Header** (`.bubble-header`): Optional top section
- **Body** (`.bubble-body`): Main content area
- **State Manager**: Singleton that ensures only one bubble is open

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
  anchor: HTMLElement,                    // NEW: Element that triggers bubble
  theme?: 'dark' | 'light',
  renderPosition?: 'top' | 'bottom',
  arrowSide?: 'top' | 'bottom' | 'left' | 'right',
  headerContent?: HTMLElement,
  bodyContent: HTMLElement,
  visible?: boolean,
  onOpen?: () => void,                    // NEW: Called when bubble opens
  onClose?: () => void,                   // NEW: Called when bubble closes
  closeOnClickOutside?: boolean           // NEW: Default true
})
// Returns: { 
//   dom: HTMLElement, 
//   open: () => void,      // NEW: Was show()
//   close: () => void,     // NEW: Was hide()
//   toggle: () => void,    // NEW: Toggle open/close
//   isOpen: () => boolean, // NEW: Check state
//   destroy: () => void 
// }
```

### Configuration

- `id`: Unique identifier for this bubble
- **`anchor`**: **REQUIRED** - HTML element that triggers the bubble (e.g., button, icon)
- `theme`: 'dark' or 'light' (default: 'dark')
- `renderPosition`: 'top' or 'bottom' positioning (default: 'bottom')
- `arrowSide`: Arrow direction - 'top', 'bottom', 'left', or 'right' (default: 'top')
- `headerContent`: Optional HTML element for header section
- `bodyContent`: **REQUIRED** - HTML element for body section
- `visible`: Initial visibility state (default: false)
- **`onOpen`**: Callback executed when bubble opens
- **`onClose`**: Callback executed when bubble closes
- **`closeOnClickOutside`**: Whether to close when clicking outside (default: true)

### Return Value

- `dom`: HTMLElement to append to your container
- **`open()`**: Open the bubble (closes any other open bubbles)
- **`close()`**: Close the bubble
- **`toggle()`**: Toggle between open/closed
- **`isOpen()`**: Returns boolean indicating current state
- `destroy()`: Clean up event listeners and DOM

### State Manager

The `infoBubbleStateManager` singleton ensures only one bubble is open at a time:

```typescript
import { infoBubbleStateManager } from './primitives/infoBubble'

infoBubbleStateManager.closeAll()      // Close all open bubbles
infoBubbleStateManager.isOpen(id)      // Check if specific bubble is open
```

## Example Usage

### Simple Info Bubble

```typescript
import { createInfoBubble } from './primitives/infoBubble'

// Create anchor element
const infoIcon = html`
  <div class="info-icon" innerHTML=${infoIconSvg}></div>
`

// Create bubble with anchor
const infoBubble = createInfoBubble({
  id: 'help-tooltip',
  anchor: infoIcon,
  bodyContent: html`<p>Click me for help!</p>`,
  theme: 'dark',
  renderPosition: 'bottom',
  arrowSide: 'top'
})

// Append both to container
container.appendChild(infoIcon)
container.appendChild(infoBubble.dom)

// InfoBubble handles click on icon automatically!
// Clicking icon toggles bubble
// Clicking outside closes bubble
```

### With Callbacks

```typescript
const boundaryIcon = html`<div class="boundary-icon"></div>`

const infoBubble = createInfoBubble({
  id: 'thread-info',
  anchor: boundaryIcon,
  headerContent: html`<strong>Thread Context</strong>`,
  bodyContent: html`<p>Details here</p>`,
  onOpen: () => {
    console.log('Bubble opened')
    boundaryIcon.classList.add('active')
  },
  onClose: () => {
    console.log('Bubble closed')
    boundaryIcon.classList.remove('active')
  }
})
```

### Programmatic Control

```typescript
// You can still control bubble programmatically
infoBubble.open()           // Open manually
infoBubble.close()          // Close manually
infoBubble.toggle()         // Toggle state

if (infoBubble.isOpen()) {
  // Do something when open
}

// Close from within bubble content (e.g., on button click)
const closeButton = html`
  <button onclick=${() => infoBubble.close()}>Close</button>
`
```

## State Management

**Key architectural change**: InfoBubble now owns its state. Consumers don't need to:
- Track open/closed state
- Implement click handlers
- Handle click-outside detection
- Manage mutual exclusion

**The bubble does all of this automatically.**

### Communication Pattern

If you need to close the bubble from external code (e.g., when dropdown item selected):

```typescript
const dropdown = createPureDropdown({
  // ... config
  onSelect: (option) => {
    // Update selection
    updateState(option)
    
    // Tell infoBubble to close
    infoBubble.close()
  }
})
```

## Styling

Uses the generic infoBubble SCSS mixins:
- `infoBubblePlacement()` - positioning
- `infoBubbleStructure()` - shape and arrow
- `infoBubbleTheme()` - colors and shadows

Arrow positioning is controlled via `data-arrow-side` attribute, not CSS classes.

## Migration Guide

**Old API:**
```typescript
const bubble = createInfoBubble({ id, headerContent, bodyContent })
button.addEventListener('click', () => bubble.show())
document.addEventListener('click', handleClickOutside)
```

**New API:**
```typescript
const bubble = createInfoBubble({ 
  id, 
  anchor: button,  // Pass button as anchor
  headerContent, 
  bodyContent 
})
// That's it! Click handling is automatic
```

## Notes

- **Anchor element is required** - this is the element that triggers the bubble
- Bubble automatically attaches click handler to anchor
- Bubble automatically handles click-outside-to-close
- Only one bubble can be open at a time (enforced by state manager)
- For dropdowns with selection lists, use the `dropdown` primitive (which uses infoBubble internally)
