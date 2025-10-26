// @ts-nocheck
import { html } from '../../../components/domTemplates.ts'
import { infoBubbleStateManager } from './infoBubbleStateManager.ts'

type InfoBubbleConfig = {
    id: string
    anchor: HTMLElement
    positioningAnchor?: HTMLElement
    theme?: 'dark' | 'light'
    arrowSide?: 'top' | 'bottom' | 'left' | 'right'
    headerContent?: HTMLElement
    bodyContent: HTMLElement
    visible?: boolean
    onOpen?: () => void
    onClose?: () => void
    closeOnClickOutside?: boolean
    offset?: { x?: number, y?: number }
}

export function createInfoBubble(config: InfoBubbleConfig) {
    const {
        id,
        anchor,
        positioningAnchor,
    theme = 'dark',
        arrowSide = 'top',
        headerContent = null,
        bodyContent,
        visible = false,
        onOpen,
        onClose,
        closeOnClickOutside = true,
        offset = {}
    } = config

    let isVisible = visible

    // Create the info bubble DOM structure
    const dom = html`
        <div class="info-bubble-wrapper theme-${theme}" data-arrow-side="${arrowSide}" data-bubble-id="${id}">
            <nav class="bubble-wrapper ${isVisible ? 'visible' : ''}" contenteditable="false">
                <div class="bubble-container">
                    ${headerContent && html`<div class="bubble-header">${headerContent}</div>`}
                    <div class="bubble-body">${bodyContent}</div>
                </div>
            </nav>
        </div>
    ` as HTMLElement

    const bubbleWrapper = dom.querySelector('.bubble-wrapper') as HTMLElement
    const posAnchorEl = positioningAnchor ?? anchor

    const getOffsetX = () => (offset?.x ?? 0)
    const getOffsetY = () => (offset?.y ?? 0)

    // Compute and apply viewport-relative position using the anchor rect
    const applyPosition = () => {
        if (!bubbleWrapper) return

    const anchorRect = posAnchorEl.getBoundingClientRect()

        // Temporarily ensure bubble is measurable
        const wasVisible = bubbleWrapper.classList.contains('visible')
        let restoreVisibility = false
        if (!wasVisible) {
            bubbleWrapper.classList.add('visible')
            bubbleWrapper.style.visibility = 'hidden'
            restoreVisibility = true
        }

    const bubbleRect = bubbleWrapper.getBoundingClientRect()
        let top = 0
        let left = 0

        const ox = getOffsetX()
        const oy = getOffsetY()

        switch (arrowSide) {
            case 'top':
                // Bubble below anchor, horizontally centered to positioning anchor
                top = anchorRect.bottom + oy
                left = anchorRect.left + (anchorRect.width - bubbleRect.width) / 2 + ox
                break
            case 'bottom':
                // Bubble above anchor, horizontally centered
                top = anchorRect.top - bubbleRect.height + oy
                left = anchorRect.left + (anchorRect.width - bubbleRect.width) / 2 + ox
                break
            case 'left':
                // Bubble to the right of anchor, vertically centered
                top = anchorRect.top + (anchorRect.height - bubbleRect.height) / 2 + oy
                left = anchorRect.right + ox
                break
            case 'right':
            default:
                // Bubble to the left of anchor, vertically centered
                top = anchorRect.top + (anchorRect.height - bubbleRect.height) / 2 + oy
                left = anchorRect.left - bubbleRect.width + ox
                break
        }

        // Clamp within viewport horizontally if needed (simple bounds)
        const vw = window.innerWidth
        const vh = window.innerHeight
        left = Math.max(4, Math.min(left, vw - bubbleRect.width - 4))
        top = Math.max(4, Math.min(top, vh - bubbleRect.height - 4))

        // Apply to wrapper container (position: fixed)
        ;(dom as HTMLElement).style.left = `${Math.round(left)}px`
        ;(dom as HTMLElement).style.top = `${Math.round(top)}px`

        if (restoreVisibility) {
            bubbleWrapper.classList.remove('visible')
            bubbleWrapper.style.visibility = ''
        }
    }

    // Internal close method (called by state manager)
    const closeInternal = () => {
        if (!isVisible) return

        isVisible = false
        if (bubbleWrapper) {
            bubbleWrapper.classList.remove('visible')
        }

        infoBubbleStateManager.close(id)
        onClose?.()
    }

    // Public API
    const open = () => {
        if (isVisible) return

        isVisible = true
        if (bubbleWrapper) {
            bubbleWrapper.classList.add('visible')
        }

        infoBubbleStateManager.open(id)
        onOpen?.()

        // Position after becoming visible
        applyPosition()
    }

    const close = () => {
        closeInternal()
    }

    const toggle = () => {
        if (isVisible) {
            close()
        } else {
            open()
        }
    }

    const isOpen = () => {
        return isVisible
    }

    // Handle anchor click to toggle
    const handleAnchorClick = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        toggle()
    }

    // Handle click outside to close
    const handleWindowClick = (e: Event) => {
        if (!closeOnClickOutside || !isVisible) return

        // Check if click is outside both anchor and bubble
        const path = e.composedPath()
        if (!path.includes(anchor) && !path.includes(dom)) {
            close()
        }
    }

    // Reposition on viewport changes
    const handleViewportChange = () => {
        if (isVisible) applyPosition()
    }

    // Attach anchor click handler
    anchor.addEventListener('click', handleAnchorClick)

    // Attach window click handler
    if (closeOnClickOutside) {
        document.addEventListener('click', handleWindowClick)
    }

    window.addEventListener('resize', handleViewportChange, { passive: true })
    window.addEventListener('scroll', handleViewportChange, { passive: true })

    // Register with state manager
    infoBubbleStateManager.register(id, { close: closeInternal })

    // Initialize visibility if needed
    if (visible) {
        open()
    }

    const destroy = () => {
        // Clean up event listeners
        anchor.removeEventListener('click', handleAnchorClick)
        if (closeOnClickOutside) {
            document.removeEventListener('click', handleWindowClick)
        }

        window.removeEventListener('resize', handleViewportChange)
        window.removeEventListener('scroll', handleViewportChange)

        // Unregister from state manager
        infoBubbleStateManager.unregister(id)

        // Remove DOM
        dom.remove()
    }

    return {
        dom,
        open,
        close,
        toggle,
        isOpen,
        destroy
    }
}
