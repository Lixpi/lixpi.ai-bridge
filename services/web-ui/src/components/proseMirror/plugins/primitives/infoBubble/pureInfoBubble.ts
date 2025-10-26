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
        offset = { x: 0, y: 20 } // Default 20px spacing from anchor
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
    const bubbleContainer = dom.querySelector('.bubble-container') as HTMLElement
    const posAnchorEl = positioningAnchor ?? anchor

    // Calculate final offset based on arrow direction
    const getEffectiveOffset = () => {
        switch (arrowSide) {
            case 'top':
                return { x: offset.x, y: offset.y } // Offset below anchor
            case 'bottom':
                return { x: offset.x, y: -offset.y } // Offset above anchor
            case 'left':
                return { x: offset.y, y: offset.x } // Offset to the right
            case 'right':
                return { x: -offset.y, y: offset.x } // Offset to the left
            default:
                return { x: offset.x, y: offset.y }
        }
    }

    // Measure arrow dimensions from actual rendered CSS
    const measureArrowDimensions = () => {
        if (!bubbleContainer) return { crossOffset: 8, outerSize: 9 }

        const beforeStyle = window.getComputedStyle(bubbleContainer, '::before')

        // Extract arrow size from border-width
        const borders = beforeStyle.borderWidth.split(' ').map(parseFloat).filter(b => b > 0)
        const outerSize = Math.max(...borders, 9) // Fallback to 9

        // Extract cross-axis offset (right or top depending on arrow side)
        const positionValue = (arrowSide === 'top' || arrowSide === 'bottom')
            ? beforeStyle.right
            : beforeStyle.top
        const crossOffset = parseFloat(positionValue) || 8

        return { crossOffset, outerSize }
    }

    // Compute and apply viewport-relative position using the anchor rect
    const applyPosition = () => {
        if (!bubbleWrapper) return

        const anchorRect = posAnchorEl.getBoundingClientRect()

        // Temporarily make bubble visible and measurable
        const wasVisible = bubbleWrapper.classList.contains('visible')
        if (!wasVisible) {
            bubbleWrapper.classList.add('visible')
            bubbleWrapper.style.visibility = 'hidden'
        }

        const bubbleRect = bubbleWrapper.getBoundingClientRect()
        const { crossOffset, outerSize } = measureArrowDimensions()

        // Calculate target center and offsets
        const targetCenterX = anchorRect.left + anchorRect.width / 2
        const targetCenterY = anchorRect.top + anchorRect.height / 2
        const { x: offsetX, y: offsetY } = getEffectiveOffset()

        // Calculate arrow tip position relative to bubble origin based on arrow side
        const arrowTipOffset = {
            top:    { x: bubbleRect.width - crossOffset - outerSize, y: 0 },
            bottom: { x: bubbleRect.width - crossOffset - outerSize, y: bubbleRect.height },
            left:   { x: 0, y: crossOffset + outerSize },
            right:  { x: bubbleRect.width, y: crossOffset + outerSize }
        }[arrowSide]

        // Position bubble so arrow tip points to target center
        let left = targetCenterX - arrowTipOffset.x + offsetX
        let top = targetCenterY - arrowTipOffset.y + offsetY

        // Clamp within viewport
        const vw = window.innerWidth
        const vh = window.innerHeight
        left = Math.max(4, Math.min(left, vw - bubbleRect.width - 4))
        top = Math.max(4, Math.min(top, vh - bubbleRect.height - 4))

        // Apply position
        dom.style.left = `${Math.round(left)}px`
        dom.style.top = `${Math.round(top)}px`

        // Restore visibility state
        if (!wasVisible) {
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
