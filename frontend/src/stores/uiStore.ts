import { create } from 'zustand'

interface UIStore {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  aiOpen: boolean
  aiPrefill: string
  aiAutoSubmitRequest: { id: number; query: string; accountId?: string } | null
  activeAccountId: string
  shortcutModalOpen: boolean
  globalNoteOpen: boolean
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  openAI: (query?: string, accountId?: string, autoSubmit?: boolean) => void
  setAIPrefill: (query: string) => void
  clearAIAutoSubmitRequest: (id: number) => void
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
  aiAutoSubmitRequest: null,
  activeAccountId: 'amd-001',
  shortcutModalOpen: false,
  globalNoteOpen: false,
  toggleSidebar: () => set(state => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: open => set({ mobileNavOpen: open }),
  openAI: (query, accountId, autoSubmit = false) => set(state => {
    const nextQuery = query ?? state.aiPrefill
    return {
      aiOpen: true,
      aiPrefill: nextQuery,
      aiAutoSubmitRequest: autoSubmit && nextQuery.trim()
        ? { id: Date.now(), query: nextQuery.trim(), accountId: accountId ?? state.activeAccountId }
        : state.aiAutoSubmitRequest,
      activeAccountId: accountId ?? state.activeAccountId,
    }
  }),
  setAIPrefill: query => set({ aiPrefill: query }),
  clearAIAutoSubmitRequest: id => set(state => (state.aiAutoSubmitRequest?.id === id ? { aiAutoSubmitRequest: null } : {})),
  closeAI: () => set({ aiOpen: false }),
  setActiveAccountId: accountId => set({ activeAccountId: accountId }),
  setShortcutModalOpen: open => set({ shortcutModalOpen: open }),
  setGlobalNoteOpen: open => set({ globalNoteOpen: open }),
}))
