import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state'
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view'
import { dropdownNodeView } from './dropdownNode.js'

export const dropdownNodeType = 'dropdown'

export const dropdownNodeSpec = {
    group: 'block',
    inline: false,
    draggable: false,
    attrs: {
        id: { default: null },
        selectedValue: { default: {} },
        dropdownOptions: { default: [] },
        theme: { default: 'light' },
        renderPosition: { default: 'bottom' },
        buttonIcon: { default: null },
        ignoreColorValuesForOptions: { default: false },
        ignoreColorValuesForSelectedValue: { default: false }
    },
    parseDOM: [
        {
            tag: 'span.dropdown-menu-tag-pill-wrapper',
            getAttrs: (dom) => ({
                id: dom.getAttribute('data-id'),
                theme: dom.getAttribute('data-theme') || 'light',
                renderPosition: dom.getAttribute('data-render-position') || 'bottom'
            })
        }
    ],
    toDOM: (node) => [
        'span',
        {
            class: `dropdown-menu-tag-pill-wrapper theme-${node.attrs.theme}`,
            'data-id': node.attrs.id,
            'data-theme': node.attrs.theme,
            'data-render-position': node.attrs.renderPosition
        },
        0
    ]
}

type DropdownPluginState = {
    decorations: DecorationSet
    openDropdownId: string | null
}

class DropdownPlugin {
    private key: PluginKey<DropdownPluginState>

    constructor() {
        this.key = new PluginKey<DropdownPluginState>('dropdown')
    }

    createPlugin(): Plugin<DropdownPluginState> {
        return new Plugin<DropdownPluginState>({
            key: this.key,

            state: {
                init: () => ({
                    decorations: DecorationSet.empty,
                    openDropdownId: null
                }),

                apply: (tr: Transaction, pluginState: DropdownPluginState) => {
                    console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] CALLED', {
                        docChanged: tr.docChanged,
                        steps: tr.steps.length,
                        currentOpenId: pluginState.openDropdownId,
                        hasToggleMeta: !!tr.getMeta('toggleDropdown'),
                        hasCloseMeta: !!tr.getMeta('closeDropdown')
                    })

                    let { decorations, openDropdownId } = pluginState
                    let stateChanged = false

                    // Handle dropdown toggle metadata
                    const toggleDropdown = tr.getMeta('toggleDropdown')
                    if (toggleDropdown) {
                        console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] toggleDropdown meta found', { toggleDropdown, currentOpenId: openDropdownId })
                        const newOpenId = openDropdownId === toggleDropdown.id ? null : toggleDropdown.id
                        if (newOpenId !== openDropdownId) {
                            console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] openDropdownId changed', { from: openDropdownId, to: newOpenId })
                            openDropdownId = newOpenId
                            stateChanged = true
                        }
                    }

                    // Handle close dropdown metadata
                    const closeDropdown = tr.getMeta('closeDropdown')
                    if (closeDropdown && openDropdownId !== null) {
                        console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] closeDropdown meta found', { closingId: openDropdownId })
                        openDropdownId = null
                        stateChanged = true
                    }

                    // Only recreate decorations if state changed or document structure changed
                    if (stateChanged || tr.docChanged) {
                        console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] recreating decorations', { stateChanged, docChanged: tr.docChanged, openDropdownId })
                        decorations = this.createDecorations(tr.doc, openDropdownId)
                        console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] decorations created', { openDropdownId })
                    }

                    const newState = {
                        decorations: decorations.map(tr.mapping, tr.doc),
                        openDropdownId
                    }
                    console.log('[AI_DBG][DROPDOWN_PLUGIN.apply] returning new state', { openDropdownId: newState.openDropdownId })
                    return newState
                }
            },

            props: {
                decorations: (state: EditorState) => {
                    const pluginState = this.key.getState(state)
                    return pluginState?.decorations
                },

                nodeViews: {
                    [dropdownNodeType]: dropdownNodeView
                }
            }
        })
    }

    private createDecorations(doc: any, openDropdownId: string | null): DecorationSet {
        const decorations: Decoration[] = []
        console.log('[AI_DBG][DROPDOWN_PLUGIN.createDecorations] CALLED', { openDropdownId })

        if (openDropdownId) {
            let foundCount = 0
            doc.descendants((node: any, pos: number) => {
                if (node.type.name === dropdownNodeType) {
                    foundCount++
                    console.log('[AI_DBG][DROPDOWN_PLUGIN.createDecorations] found dropdown node', {
                        pos,
                        nodeId: node.attrs.id,
                        openDropdownId,
                        matches: node.attrs.id === openDropdownId
                    })
                }
                if (node.type.name === dropdownNodeType && node.attrs.id === openDropdownId) {
                    const decoration = Decoration.node(pos, pos + node.nodeSize, {
                        class: 'dropdown-open'
                    })
                    decorations.push(decoration)
                    console.log('[AI_DBG][DROPDOWN_PLUGIN.createDecorations] created decoration for dropdown', { pos, nodeSize: node.nodeSize, dropdownId: node.attrs.id })
                }
            })
            console.log('[AI_DBG][DROPDOWN_PLUGIN.createDecorations] scan complete', { foundDropdowns: foundCount, createdDecorations: decorations.length })
        }

        const decorationSet = DecorationSet.create(doc, decorations)
        console.log('[AI_DBG][DROPDOWN_PLUGIN.createDecorations] returning DecorationSet', { decorationsCount: decorations.length })
        return decorationSet
    }
}

export function createDropdownPlugin(): Plugin<DropdownPluginState> {
    const plugin = new DropdownPlugin()
    return plugin.createPlugin()
}