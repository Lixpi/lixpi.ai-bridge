# ContextSelector Primitive

Generic toggle button group for selecting one option from multiple choices. Lives outside the document schema – never part of saved content.

## What it is

A factory function that creates a button group with radio-button-like behavior where only one option can be selected at a time. **Manages its own state** including selection state and change events.

**Key features:**
- Not a document node (no NodeSpec)
- Completely generic - works with any set of options
- **Owns its selection state**
- Toggle buttons with visual feedback
- Single selection (radio button behavior)
- Optional icons for each option
- Callback on selection change
- Returns `{dom, getValue, setValue, update, destroy}`

## Architecture

The contextSelector is a **stateful interactive component**:
- **Container** (`.context-selector`): Main wrapper with role="radiogroup"
- **Options** (`.context-options`): Flex container for buttons
- **Buttons** (`.context-option-button`): Individual toggle buttons with selected state
- **State**: Internally tracks currently selected value
- **Events**: Handles clicks and dispatches onChange callback

## Why not document nodes?

UI controls like this should live outside the document schema:
- Not semantic content that needs to be saved
- Pure presentational control
- Simple state management
- Never part of document serialization

## API

### `createContextSelector(config)`

```typescript
createContextSelector({
  id: 'unique-id',
  options: [
    { label: 'Option 1', value: 'opt1', icon?: '<svg>...</svg>' },
    { label: 'Option 2', value: 'opt2' },
    // ... more options
  ],
  selectedValue?: 'opt1',          // Initial selection (defaults to first option)
  onChange?: (value: string) => void
})
// Returns: {
//   dom: HTMLElement,
//   getValue: () => string,          // Get currently selected value
//   setValue: (value: string) => void, // Programmatically set selection
//   update: (config: Partial<Config>) => void, // Update configuration
//   destroy: () => void
// }
```

### Configuration

- `id`: Unique identifier for this selector
- `options`: Array of options with label, value, and optional icon
- `selectedValue`: Initial selected value (default: first option)
- `onChange`: Callback executed when selection changes

### Return Value

- `dom`: HTMLElement to append to your container
- `getValue()`: Returns currently selected value
- `setValue(value)`: Programmatically change selection
- `update(config)`: Update configuration (e.g., change selected value)
- `destroy()`: Clean up event listeners

## Usage Example

```typescript
import { createContextSelector } from './primitives/contextSelector'

const selector = createContextSelector({
  id: 'thread-context-selector',
  options: [
    { label: 'Thread', value: 'Thread' },
    { label: 'Document', value: 'Document' },
    { label: 'Workspace', value: 'Workspace' }
  ],
  selectedValue: 'Thread',
  onChange: (value) => {
    console.log('Selected:', value)
    // Update your application state
  }
})

// Append to container
container.appendChild(selector.dom)

// Get current value
const current = selector.getValue() // 'Thread'

// Programmatically change selection
selector.setValue('Document')

// Clean up when done
selector.destroy()
```

## Styling

The component combines Tailwind utilities with purpose-built SCSS that mirrors the default XYFlow look-and-feel:
- `.context-selector`: Main container where we expose CSS custom properties (edge colors, node fills) for theming.
- `.context-options`: Flex wrapper for the toggle buttons.
- `.context-option-button`: Individual buttons with hover/selected affordances; receives `.selected` for the active state.
- `.context-visualization`: Dark canvas that hosts the D3-rendered SVG.

Key visualization details inspired by `packages-vendor/xyflow/packages/{system,react,svelte}`:
- Open arrowheads (`polyline`) and curved edges reuse the same stroke widths as XYFlow defaults.
- Edges originate directly from each node boundary, run along a shared horizontal baseline, and terminate flush with the AI avatar so the arrow tip makes contact.
- Node centers are spaced evenly across the baseline to mimic XYFlow's layout rhythm, making the Thread pillar line up between Document and Workspace visuals.
- Alignment math is centralized so thread, document, and workspace diagrams share the same baselines and anchor coordinates.

You can override the exposed CSS variables inside `.context-selector` to tweak colors or thickness without touching the TypeScript. See `contextSelector.scss` for the complete list of variables and defaults.

## Integration with ProseMirror

This primitive is designed to be used in NodeViews or plugin UI controls:

```typescript
function createMyNodeView(node, view, getPos) {
  const selector = createContextSelector({
    id: `selector-${node.attrs.id}`,
    options: [...],
    selectedValue: node.attrs.context,
    onChange: (value) => {
      // Update node attributes via transaction
      const pos = getPos()
      if (pos !== undefined) {
        const tr = view.state.tr.setNodeMarkup(
          pos,
          undefined,
          { ...node.attrs, context: value }
        )
        view.dispatch(tr)
      }
    }
  })

  controlsContainer.appendChild(selector.dom)

  return {
    dom,
    contentDOM,
    update: (newNode) => {
      selector.update({ selectedValue: newNode.attrs.context })
      return true
    },
    destroy: () => {
      selector.destroy()
    }
  }
}
```

## Accessibility

The component includes proper ARIA attributes:
- `role="radiogroup"` on container
- `role="radio"` on buttons
- `aria-checked` and `aria-pressed` on buttons
- `aria-label` on container

This ensures screen readers can properly announce the selection state and allow keyboard navigation.
