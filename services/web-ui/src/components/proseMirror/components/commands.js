import { v4 as uuidv4 } from 'uuid'
import { nodeTypes } from "../customNodes"
import { aiChatThreadNodeType } from '../plugins/aiChatThreadPlugin/aiChatThreadNode.ts'

export const useAiInput = (state, dispatch) => {
    const attrs = {}
    const tr = state.tr.setMeta(`insert:${nodeTypes.aiUserInputNodeType}`, attrs)

    if (dispatch) {
        dispatch(tr)
        return true
    }

    return false
}

export const insertAiChatThread = (state, dispatch) => {
    console.log('[AI_DBG][CMD.insertAiChatThread] CALLED', { 
        hasDispatch: !!dispatch,
        selectionFrom: state.selection.from,
        selectionTo: state.selection.to,
        cursorPos: state.selection.$from.pos
    })
    
    const attrs = {
        threadId: uuidv4(),
        status: 'active'
    }
    
    console.log('[AI_DBG][CMD.insertAiChatThread] creating transaction', { 
        attrs,
        metaKey: `insert:${aiChatThreadNodeType}`
    })
    
    const tr = state.tr.setMeta(`insert:${aiChatThreadNodeType}`, attrs)

    if (dispatch) {
        console.log('[AI_DBG][CMD.insertAiChatThread] dispatching transaction')
        dispatch(tr)
        return true
    }

    console.log('[AI_DBG][CMD.insertAiChatThread] NO DISPATCH - returning false')
    return false
}
