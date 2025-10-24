// @ts-nocheck
import { html } from '../../../components/domTemplates.ts'

type InfoBubbleConfig = {
    id: string
    theme?: 'dark' | 'light'
    renderPosition?: 'top' | 'bottom'
    arrowSide?: 'top' | 'bottom' | 'left' | 'right'
    headerContent?: HTMLElement
    bodyContent: HTMLElement
    visible?: boolean
}

export function createInfoBubble(config: InfoBubbleConfig) {
    const {
        id,
        theme = 'dark',
        renderPosition = 'bottom',
        arrowSide = 'top',
        headerContent = null,
        bodyContent,
        visible = false
    } = config

    let isVisible = visible

    // Create the info bubble DOM structure
    const dom = html`
        <div class="info-bubble-wrapper theme-${theme}" data-arrow-side="${arrowSide}" data-bubble-id="${id}">
            <nav
                class="bubble-wrapper render-position-${renderPosition} ${isVisible ? 'visible' : ''}"
                contenteditable="false"
            >
                <div class="bubble-container">
                    ${headerContent && html`<div class="bubble-header">${headerContent}</div>`}
                    <div class="bubble-body">${bodyContent}</div>
                </div>
            </nav>
        </div>
    ` as HTMLElement

    const bubbleWrapper = dom.querySelector('.bubble-wrapper') as HTMLElement

    // Public API
    const show = () => {
        isVisible = true
        if (bubbleWrapper) {
            bubbleWrapper.classList.add('visible')
        }
    }

    const hide = () => {
        isVisible = false
        if (bubbleWrapper) {
            bubbleWrapper.classList.remove('visible')
        }
    }

    const destroy = () => {
        // Clean up any event listeners if needed
        dom.remove()
    }

    return {
        dom,
        show,
        hide,
        destroy
    }
}
