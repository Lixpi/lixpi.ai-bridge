# Pure Chrome Dropdown Primitive

A lightweight, framework-agnostic dropdown component designed for use as "chrome" (UI controls) in ProseMirror editors, completely independent of the document schema.

## Overview

This primitive provides a dropdown UI component that exists **outside** the ProseMirror document structure. Unlike document nodes that become part of the editor's content, pure chrome dropdowns are:

- **Not part of the document schema** - No NodeSpec, no content type
- **Rendered directly to the DOM** - No transactions, no decorations
- **Framework-agnostic** - Zero ProseMirror dependencies in the dropdown itself
- **Reusable across plugins** - Can be used in any NodeView or plugin UI

## Architecture

### Pure Chrome Pattern

The "pure chrome" pattern treats UI controls like toolbar buttons or editor controls - they're presentational elements that live outside the semantic document structure:

```
┌─────────────────────────────────────────┐
│  Plugin UI Container (chrome)           │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Dropdown   │  │   Button    │      │  ← Pure Chrome
│  └─────────────┘  └─────────────┘      │
├─────────────────────────────────────────┤
│  ProseMirror contentDOM                 │
│  ┌─────────────────────────────────┐   │
│  │  Document Content (paragraphs,  │   │  ← Document Schema
│  │  headings, etc.)                │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Why Not Document Nodes?

Document nodes (with NodeSpec) are semantic content that ProseMirror:
- Renders into `contentDOM`
- Manages via transactions
- Includes in document serialization
- Tracks in the document tree

This causes problems for UI controls:
- Initial render in wrong location (contentDOM instead of controls container)
- Requires complex relocation logic (requestAnimationFrame loops, MutationObserver)
- State management via decorations is awkward
- Controls become part of saved document content

Pure chrome avoids all these issues by staying outside the document entirely.

## Components

### `createPureDropdown(config)`

Factory function that creates a dropdown with lifecycle management.

#### Parameters

```typescript
interface DropdownConfig {
  id: string                    // Unique identifier for state management
  selectedValue: string         // Currently selected option value
  options: DropdownOption[]     // Array of available options
  onSelect: (value: string) => void  // Callback when option selected
  
  // Optional styling
  theme?: 'dark' | 'light'     // Color theme (default: 'dark')
  renderPosition?: 'top' | 'bottom'  // Menu position (default: 'bottom')
  buttonIcon?: string          // SVG icon for button (default: chevronDownIcon)
  
  // Optional behavior flags
  ignoreColorValues?: string[] // Option values to render without color styles
}

interface DropdownOption {
  value: string      // Option identifier
  label: string      // Display text
  icon?: string      // Optional SVG icon
  iconBgColor?: string  // Optional icon background color
}
```

#### Returns

```typescript
interface DropdownInstance {
  dom: HTMLElement              // The dropdown's root DOM element
  update: (newValue: string) => void  // Update selected value
  destroy: () => void           // Cleanup subscriptions and remove DOM
}
```

#### Example

```typescript
import { createPureDropdown } from '../primitives/dropdown/index.ts'

const dropdown = createPureDropdown({
  id: 'my-dropdown',
  selectedValue: 'option-1',
  options: [
    { value: 'option-1', label: 'Option 1', icon: iconSvg1 },
    { value: 'option-2', label: 'Option 2', icon: iconSvg2 }
  ],
  onSelect: (value) => {
    console.log('Selected:', value)
    // Update your state/store here
  },
  theme: 'dark',
  renderPosition: 'bottom'
})

// Append to your chrome container
controlsContainer.appendChild(dropdown.dom)

// Update selected value when external state changes
dropdown.update('option-2')

// Cleanup when NodeView is destroyed
dropdown.destroy()
```

### `dropdownStateManager`

Singleton that coordinates open/close state across all dropdowns, ensuring mutual exclusion (only one dropdown open at a time).

#### Methods

```typescript
class DropdownStateManager {
  // Open a dropdown (closes any other open dropdown)
  open(id: string): void
  
  // Close a specific dropdown
  close(id: string): void
  
  // Close all dropdowns
  closeAll(): void
  
  // Check if a dropdown is currently open
  isOpen(id: string): boolean
  
  // Subscribe to open/close events for a specific dropdown
  subscribe(id: string, callback: (isOpen: boolean) => void): () => void
}
```

#### Example

```typescript
import { dropdownStateManager } from '../primitives/dropdown/index.ts'

// Subscribe to state changes
const unsubscribe = dropdownStateManager.subscribe('my-dropdown', (isOpen) => {
  console.log('Dropdown is now:', isOpen ? 'open' : 'closed')
  // Update DOM classes, icons, etc.
})

// Manually control state
dropdownStateManager.open('my-dropdown')  // Opens this, closes others
dropdownStateManager.close('my-dropdown')
dropdownStateManager.closeAll()

// Cleanup subscription
unsubscribe()
```

## Usage in ProseMirror NodeViews

### Basic Integration

```typescript
class MyNodeView implements NodeView {
  dom: HTMLElement
  dropdown: { dom: HTMLElement; update: (v: string) => void; destroy: () => void }
  
  constructor(node: Node, view: EditorView, getPos: () => number) {
    // Create your container
    this.dom = document.createElement('div')
    const controlsContainer = document.createElement('div')
    this.dom.appendChild(controlsContainer)
    
    // Create dropdown as pure chrome
    this.dropdown = createPureDropdown({
      id: 'my-node-dropdown',
      selectedValue: node.attrs.someValue,
      options: [/* your options */],
      onSelect: (value) => {
        // Update node attributes via transaction
        const pos = getPos()
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, someValue: value })
        )
      }
    })
    
    // Append directly to controls (not contentDOM!)
    controlsContainer.appendChild(this.dropdown.dom)
  }
  
  update(node: Node) {
    // Update dropdown when node attributes change
    this.dropdown.update(node.attrs.someValue)
    return true
  }
  
  destroy() {
    // Clean up dropdown subscriptions
    this.dropdown.destroy()
  }
  
  ignoreMutation(mutation: MutationRecord) {
    // Tell ProseMirror to ignore dropdown mutations
    // to prevent unwanted NodeView recreation
    return mutation.target === this.dropdown.dom ||
           this.dropdown.dom.contains(mutation.target as Node)
  }
}
```

### Critical: ignoreMutation

When dropdowns open/close, they modify the DOM. ProseMirror sees these mutations and may try to recreate your NodeView. Always implement `ignoreMutation` to tell ProseMirror to ignore these chrome mutations:

```typescript
ignoreMutation(mutation: MutationRecord): boolean {
  // Ignore mutations in controls container or any chrome elements
  const chromeContainer = this.dom.querySelector('.controls-container')
  return chromeContainer?.contains(mutation.target as Node) || false
}
```

## Comparison to Alternatives

### vs Document Node Dropdowns

**Document Node Approach** (old, problematic):
```typescript
// Define in schema
dropdown: {
  group: 'block',
  atom: true,
  // ... NodeSpec config
}

// Insert via transaction
tr.insert(pos, schema.nodes.dropdown.create({ value: 'x' }))

// Problems:
// - Renders in contentDOM (wrong location)
// - Requires relocation via rAF/MutationObserver
// - State management via decorations is complex
// - Becomes part of document content
```

**Pure Chrome Approach** (current):
```typescript
// No schema definition needed
const dropdown = createPureDropdown({ /* config */ })
controlsContainer.appendChild(dropdown.dom)

// Benefits:
// - Renders exactly where appended
// - No relocation logic needed
// - Direct state management via singleton
// - Never part of document content
```

### vs Svelte Component Integration

You can also mount Svelte components as chrome using `SvelteComponentRenderer`:

```typescript
import { SvelteComponentRenderer } from '$lib/utils/SvelteComponentRenderer.js'
import DropdownMenu from './dropdown-menu.svelte'

const renderer = new SvelteComponentRenderer({
  component: DropdownMenu,
  props: { /* component props */ },
  target: controlsContainer
})

// Cleanup
renderer.destroy()
```

**When to use each:**

- **Pure Chrome Dropdown**: Simple dropdowns, minimal dependencies, need fine control over DOM structure
- **Svelte Component**: Complex UI, need Svelte reactivity, already have Svelte dropdown components

Both follow the pure chrome pattern - neither involves the document schema.

## Real-World Example: AI Chat Thread

See `aiChatThreadNode.ts` for a complete example. Key points:

```typescript
class AiChatThreadNodeView implements NodeView {
  constructor(node: Node, view: EditorView, getPos: () => number) {
    // Create two dropdowns as pure chrome
    const modelDropdown = createPureDropdown({
      id: `ai-model-selector-${node.attrs.threadId}`,
      selectedValue: node.attrs.selectedAiModel,
      options: aiModelsStore.getAllModels().map(m => ({
        value: m.id,
        label: m.name,
        icon: m.icon
      })),
      onSelect: (modelId) => {
        // Update thread attributes
        const pos = getPos()
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            selectedAiModel: modelId
          })
        )
      }
    })
    
    const contextDropdown = createPureDropdown({
      id: `thread-context-selector-${node.attrs.threadId}`,
      selectedValue: node.attrs.contextMode,
      options: [
        { value: 'workspace', label: 'Workspace' },
        { value: 'document', label: 'Document' }
      ],
      onSelect: (contextMode) => {
        const pos = getPos()
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            contextMode
          })
        )
      }
    })
    
    // Append to controls (not contentDOM)
    controlsContainer.appendChild(modelDropdown.dom)
    controlsContainer.appendChild(contextDropdown.dom)
  }
  
  ignoreMutation(mutation: MutationRecord): boolean {
    // Ignore all mutations in controls container
    const target = mutation.target
    return controlsContainer.contains(target) || 
           controlsContainer === target
  }
}
```

## Migration from Document Node Dropdowns

If migrating from the old document node approach:

### 1. Remove from Schema

**Before:**
```typescript
const schema = new Schema({
  nodes: {
    // ...
    dropdown: {
      group: 'block',
      atom: true,
      attrs: { value: { default: '' } },
      // ...
    }
  }
})
```

**After:**
```typescript
const schema = new Schema({
  nodes: {
    // No dropdown node
  }
})
```

### 2. Remove from Content Spec

**Before:**
```typescript
aiChatThread: {
  content: '(paragraph | dropdown | aiResponseMessage)+'
}
```

**After:**
```typescript
aiChatThread: {
  content: '(paragraph | aiResponseMessage)+'
}
```

### 3. Replace Transaction-Based Creation

**Before:**
```typescript
const dropdown = schema.nodes.dropdown.create({ value: 'x' })
tr.insert(pos, dropdown)
view.dispatch(tr)
```

**After:**
```typescript
const dropdown = createPureDropdown({ /* config */ })
controlsContainer.appendChild(dropdown.dom)
```

### 4. Remove Relocation Logic

**Before:**
```typescript
// Complex relocation with rAF and observers
moveDropdownsToControls() {
  requestAnimationFrame(() => {
    const dropdowns = this.dom.querySelectorAll('.dropdown-wrapper')
    dropdowns.forEach(d => controlsContainer.appendChild(d))
  })
}

// MutationObserver to catch late renders
const observer = new MutationObserver(() => this.moveDropdownsToControls())
```

**After:**
```typescript
// No relocation needed - renders in correct location immediately
```

### 5. Replace Decoration-Based State

**Before:**
```typescript
// Plugin managing dropdown open state via decorations
const dropdownPlugin = new Plugin({
  state: {
    init() { return DecorationSet.empty },
    apply(tr, set) { /* complex decoration logic */ }
  }
})
```

**After:**
```typescript
// Direct state management via singleton
import { dropdownStateManager } from '../primitives/dropdown/index.ts'
dropdownStateManager.open('my-dropdown')
```

## Troubleshooting

### Dropdown Closes Immediately After Opening

**Symptom:** Click dropdown, it opens then instantly closes.

**Cause:** ProseMirror sees DOM mutations and recreates the NodeView, destroying the dropdown.

**Solution:** Implement `ignoreMutation` in your NodeView:

```typescript
ignoreMutation(mutation: MutationRecord): boolean {
  return this.controlsContainer.contains(mutation.target as Node)
}
```

### Dropdown Appears in Wrong Location

**Symptom:** Dropdown appears inside contentDOM instead of controls.

**Cause:** Appending to wrong container or inserting via transaction.

**Solution:** Append directly to your chrome container, not contentDOM:

```typescript
// ✅ Correct
controlsContainer.appendChild(dropdown.dom)

// ❌ Wrong - this is for document content
this.contentDOM.appendChild(dropdown.dom)

// ❌ Wrong - transactions are for document nodes
tr.insert(pos, dropdown)
```

### Multiple Dropdowns Open Simultaneously

**Symptom:** Can open multiple dropdowns at once.

**Cause:** Dropdowns have duplicate IDs or aren't using dropdownStateManager.

**Solution:** Ensure unique IDs and that `createPureDropdown` is using the shared state manager:

```typescript
// ✅ Unique IDs per dropdown
createPureDropdown({ id: `dropdown-${uniqueIdentifier}`, /* ... */ })
```

### Dropdown State Not Updating

**Symptom:** External state changes don't reflect in dropdown.

**Cause:** Not calling `update()` when state changes.

**Solution:** Call `update()` in NodeView's `update()` method:

```typescript
update(node: Node): boolean {
  this.dropdown.update(node.attrs.selectedValue)
  return true
}
```

## Benefits Summary

Pure chrome dropdowns provide:

- ✅ **Zero flicker** - Render in correct location immediately
- ✅ **No relocation logic** - No rAF loops, no observers, no position calculations
- ✅ **Simple state management** - Direct pub/sub pattern via singleton
- ✅ **Not document content** - Never serialized, never part of saved content
- ✅ **Framework agnostic** - No ProseMirror dependencies in dropdown code
- ✅ **Reusable** - Use in any NodeView or plugin UI
- ✅ **Predictable** - Standard DOM patterns, no ProseMirror complexity

## Related

- `aiChatThreadNode.ts` - Complete real-world example
- `SvelteComponentRenderer` - Alternative for Svelte component chrome
- ProseMirror NodeView documentation - Understanding `ignoreMutation`
