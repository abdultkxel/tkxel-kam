import { create } from 'zustand'

interface UIStore {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  aiOpen: boolean
  aiPrefill: string
  activeAccountId: string
  shortcutModalOpen: boolean
  globalNoteOpen: boolean
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  openAI: (query?: string, accountId?: string) => void
  closeAI: () => void
  setActiveAccountId: (accountId: string) => void
  setShortcutModalOpen: (open: boolean) => void
  setGlobalNoteOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>(set => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  aiOpen: false,
  aiPrefill: '',
  activeAccountId: 'amd-001',
  shortcutModalOpen: false,
  globalNoteOpen: false,
  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: open => set({ mobileNavOpen: open }),
  openAI: (query = '', accountId) => set(state => ({ aiOpen: true, aiPrefill: query, activeAccountId: accountId ?? state.activeAccountId })),
  closeAI: () => set({ aiOpen: false, aiPrefill: '' }),
  setActiveAccountId: accountId => set({ activeAccountId: accountId }),
  setShortcutModalOpen: open => set({ shortcutModalOpen: open }),
  setGlobalNoteOpen: open => set({ globalNoteOpen: open }),
}))
