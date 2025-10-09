// Simple singleton to manage which dropdown is open (mutual exclusion)
class DropdownStateManager {
    private openDropdownId: string | null = null
    private listeners: Map<string, (isOpen: boolean) => void> = new Map()

    open(id: string): void {
        const previousId = this.openDropdownId
        this.openDropdownId = id

        // Notify previous to close
        if (previousId && previousId !== id) {
            this.listeners.get(previousId)?.(false)
        }

        // Notify new to open
        this.listeners.get(id)?.(true)
    }

    close(id: string): void {
        if (this.openDropdownId === id) {
            this.openDropdownId = null
            this.listeners.get(id)?.(false)
        }
    }

    closeAll(): void {
        const currentId = this.openDropdownId
        if (currentId) {
            this.openDropdownId = null
            this.listeners.get(currentId)?.(false)
        }
    }

    isOpen(id: string): boolean {
        return this.openDropdownId === id
    }

    subscribe(id: string, callback: (isOpen: boolean) => void): () => void {
        this.listeners.set(id, callback)
        return () => {
            this.listeners.delete(id)
        }
    }
}

export const dropdownStateManager = new DropdownStateManager()
