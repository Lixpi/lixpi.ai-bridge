# Dropdown Primitive

Dropdown menus for ProseMirror NodeViews. Lives outside the document schema – never part of saved content.

## What it is

A factory function that creates dropdown UI controls. Used by AI Chat Thread for model/context selection. Zero ProseMirror dependencies – just DOM + state coordinator.

**Key points:**
- Not a document node (no NodeSpec)
- Appended directly to your controls container
- State managed by singleton (`dropdownStateManager`)
- Returns `{dom, update, destroy}`

## Why not document nodes?

Previously, dropdowns were ProseMirror document nodes. Problems:
- Rendered in `contentDOM` first, required relocation via `requestAnimationFrame`
- Complex state management via decorations
- Became part of document content (gets serialized)
- NodeView recreated when dropdown opened/closed

Now: direct DOM append to controls container. Renders instantly where you put it.

## API

### `createPureDropdown(config)`

```typescript
createPureDropdown({
  id: 'unique-id',
  selectedValue: 'current-value',
  options: [
    { value: 'val1', label: 'Label 1', icon: svgString, iconBgColor: '#color' }
  ],
  onSelect: (value) => { /* dispatch transaction to update node attrs */ },
  theme?: 'dark' | 'light',
  renderPosition?: 'top' | 'bottom',
  buttonIcon?: svgString,
  ignoreColorValues?: ['val1', 'val2']
})
// Returns: { dom: HTMLElement, update: (val) => void, destroy: () => void }
```

### `dropdownStateManager`

Singleton. Ensures only one dropdown open at a time.

```typescript
dropdownStateManager.open(id)        // Opens this, closes others
dropdownStateManager.close(id)       // Close specific
dropdownStateManager.closeAll()      // Close all
dropdownStateManager.isOpen(id)      // Check state
dropdownStateManager.subscribe(id, callback)  // Listen to changes, returns unsubscribe fn
```

## Usage pattern

```typescript
class MyNodeView implements NodeView {
  dropdown = createPureDropdown({
    id: 'my-dropdown',
    selectedValue: node.attrs.value,
    options: [...],
    onSelect: (val) => {
      view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, {...node.attrs, value: val}))
    }
  })

  constructor() {
    controlsContainer.appendChild(this.dropdown.dom)
  }

  update(node) {
    this.dropdown.update(node.attrs.value)
    return true
  }

  destroy() {
    this.dropdown.destroy()
  }

  ignoreMutation(mutation) {
    // CRITICAL: Prevents NodeView recreation when dropdown opens/closes
    return controlsContainer.contains(mutation.target)
  }
}
```

See `aiChatThreadNode.ts` for real example.

## Common issues

**Dropdown closes immediately after opening**
- Forgot `ignoreMutation()` in NodeView. PM sees DOM changes and recreates your NodeView.
- Solution: `ignoreMutation(m) { return controlsContainer.contains(m.target) }`

**Dropdown appears in contentDOM**
- Appending to wrong container.
- Solution: Append to your controls container, not `this.contentDOM`

**State not updating**
- Forgot to call `dropdown.update()` in NodeView's `update()` method.
