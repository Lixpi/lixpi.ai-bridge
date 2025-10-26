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
        offset = { x: 0, y: 12 } // Default 12px spacing from anchor
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
        const baseX = offset.x ?? 0
        const baseY = offset.y ?? 12 // Default 12px spacing

        switch (arrowSide) {
            case 'top':
                return { x: baseX, y: baseY } // Offset below anchor
            case 'bottom':
                return { x: baseX, y: -baseY } // Offset above anchor
            case 'left':
                return { x: baseY, y: baseX } // Offset to the right
            case 'right':
                return { x: -baseY, y: baseX } // Offset to the left
            default:
                return { x: baseX, y: baseY }
        }
    }

    // Measure arrow dimensions from actual rendered CSS
    const measureArrowDimensions = () => {
        if (!bubbleContainer) return { crossOffset: 8, outerSize: 9 }

        const beforeEl = window.getComputedStyle(bubbleContainer, '::before')

        // Parse border-width to get arrow size
        const borderWidth = beforeEl.borderWidth
        const borders = borderWidth.split(' ').map(v => parseFloat(v))

        // For top/bottom arrows: border-width is "0 9px 9px 9px" -> outerSize = 9
        // For left/right arrows: border-width is "9px 9px 9px 0" -> outerSize = 9
        const outerSize = Math.max(...borders.filter(b => b > 0))

        // Parse positioning (right or top) to get cross offset
        let crossOffset = 8 // fallback

        if (arrowSide === 'top' || arrowSide === 'bottom') {
            const rightValue = beforeEl.right
            crossOffset = parseFloat(rightValue) || 8
        } else {
            const topValue = beforeEl.top
            crossOffset = parseFloat(topValue) || 8
        }

        return { crossOffset, outerSize }
    }

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

        // Measure arrow dimensions from rendered CSS
        const { crossOffset, outerSize } = measureArrowDimensions()

        // Calculate center of positioningAnchor
        const targetCenterX = anchorRect.left + anchorRect.width / 2
        const targetCenterY = anchorRect.top + anchorRect.height / 2

        // Get effective offset based on arrow direction
        const effectiveOffset = getEffectiveOffset()
        const offsetX = effectiveOffset.x
        const offsetY = effectiveOffset.y

        // Calculate arrow tip position relative to bubble's top-left corner
        // Arrow is positioned via CSS at right: crossOffset or top: crossOffset
        // Triangle base width = 2 * outerSize, tip is at center of base
        let arrowTipOffsetX = 0
        let arrowTipOffsetY = 0

        switch (arrowSide) {
            case 'top':
                // Arrow on top edge, pointing up, positioned at right: crossOffset
                // Arrow tip X: from left = bubbleWidth - crossOffset - outerSize (center of triangle base)
                arrowTipOffsetX = bubbleRect.width - crossOffset - outerSize
                arrowTipOffsetY = 0
                break
            case 'bottom':
                // Arrow on bottom edge, pointing down, positioned at right: crossOffset
                arrowTipOffsetX = bubbleRect.width - crossOffset - outerSize
                arrowTipOffsetY = bubbleRect.height
                break
            case 'left':
                // Arrow on left edge, pointing left, positioned at top: crossOffset
                arrowTipOffsetX = 0
                arrowTipOffsetY = crossOffset + outerSize
                break
            case 'right':
                // Arrow on right edge, pointing right, positioned at top: crossOffset
                arrowTipOffsetX = bubbleRect.width
                arrowTipOffsetY = crossOffset + outerSize
                break
        }

        // Position bubble so arrow tip aligns with target center
        let left = targetCenterX - arrowTipOffsetX + offsetX
        let top = targetCenterY - arrowTipOffsetY + offsetY

        // Clamp within viewport with padding
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
