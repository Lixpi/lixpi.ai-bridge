import { Plugin, PluginKey } from 'prosemirror-state'
import {Decoration, DecorationSet} from 'prosemirror-view';
import { useAiInput } from '../../components/commands.js'
import {
    gptAvatarIcon,
    microphoneIcon,
    trashBinIcon,
    checkMarkIcon
} from '../../../../svgIcons/index.ts'

let viewRef; // to store the reference to the view object

const key = new PluginKey('buttonPlugin')

export const buttonPlugin = new Plugin({
    key,
    state: {
      init() { return DecorationSet.empty; },
      apply(tr, set, oldState, newState) {
        let cursorPos = tr.selection.$cursor ? tr.selection.$cursor.pos : null;

        // Debug logging
        console.log('buttonPlugin apply:', {
          cursorPos,
          docChanged: tr.docChanged,
          selectionSet: tr.selectionSet,
          parentType: tr.selection.$from.parent.type.name,
          depth: tr.selection.$from.depth,
          parentOffset: tr.selection.$from.parentOffset
        });

        if (tr.docChanged || tr.selectionSet) {
          let button = document.createElement('button');
          button.className = 'user-avatar';
          button.innerHTML = gptAvatarIcon
          button.style.cssText = 'width: 24px; height: 24px; border: 1px solid red; background: white; cursor: pointer; display: inline-block; position: relative; z-index: 1000;';
          button.addEventListener('click', () => {
              console.log('AI button clicked!');
              useAiInput(newState, viewRef.dispatch);
          });

          if (cursorPos && tr.selection.$from.parent.type.name === 'paragraph') {
            console.log('Creating decoration at pos:', cursorPos);
            let deco = Decoration.widget(cursorPos, button, {side: -1});
            set = DecorationSet.create(tr.doc, [deco]);
          } else {
            console.log('Not creating decoration - conditions not met');
            set = DecorationSet.empty;
          }
        }
        return set;
      }
    },
    view(view) {
      viewRef = view; // store the view reference
      return {
        update() {}
      };
    },
    props: {
      decorations(state) { return this.getState(state); }
    }
  });
