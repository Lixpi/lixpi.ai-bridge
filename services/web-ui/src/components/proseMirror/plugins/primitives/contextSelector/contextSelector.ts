
import { html } from '../../../components/domTemplates.ts'

type ContextOption = {
    label: string
    value: string
    icon?: string
}

type ContextSelectorConfig = {
    id: string
    options: ContextOption[]
    selectedValue?: string
    onChange?: (value: string) => void
}

export function createContextSelector(config: ContextSelectorConfig) {
    const {
        id,
        options,
        selectedValue,
        onChange
    } = config

    let currentValue = selectedValue || options[0]?.value || ''

    // Handle button click
    const handleOptionClick = (optionValue: string) => {
        if (currentValue === optionValue) return // Already selected

        currentValue = optionValue

        // Update button states
        buttons.forEach((btn, idx) => {
            if (options[idx].value === optionValue) {
                btn.classList.add('selected')
                btn.setAttribute('aria-pressed', 'true')
            } else {
                btn.classList.remove('selected')
                btn.setAttribute('aria-pressed', 'false')
            }
        })

        // Call onChange callback
        onChange?.(optionValue)
    }

    // Create buttons for each option
    const buttons: HTMLElement[] = []
    const buttonElements = options.map((option, idx) => {
        const isSelected = option.value === currentValue

        const button = html`
            <button
                type="button"
                className="context-option-button ${isSelected ? 'selected' : ''}"
                onclick=${() => handleOptionClick(option.value)}
                role="radio"
                aria-checked="${isSelected}"
                aria-pressed="${isSelected}"
                data-value="${option.value}"
            >
                ${option.icon ? html`<span className="option-icon" innerHTML=${option.icon}></span>` : ''}
                <span className="option-label">${option.label}</span>
            </button>
        ` as HTMLElement

        buttons.push(button)
        return button
    })

    // Create the container
    const dom = html`
        <div className="context-selector" id="${id}" role="radiogroup" aria-label="Context Selector">
            <div className="context-options flex gap-2 p-1">
                ${buttonElements}
            </div>
        </div>
    ` as HTMLElement

    // Public API
    const getValue = () => currentValue

    const setValue = (value: string) => {
        const option = options.find(opt => opt.value === value)
        if (option) {
            handleOptionClick(value)
        }
    }

    const update = (newConfig: Partial<ContextSelectorConfig>) => {
        if (newConfig.selectedValue !== undefined) {
            setValue(newConfig.selectedValue)
        }
    }

    const destroy = () => {
        // Clean up event listeners (handled automatically by DOM removal)
        buttons.length = 0
    }

    return {
        dom,
        getValue,
        setValue,
        update,
        destroy
    }
}
