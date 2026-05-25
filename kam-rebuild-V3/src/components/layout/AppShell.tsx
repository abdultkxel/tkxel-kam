import * as Dialog from '@radix-ui/react-dialog'
import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AIChatbotLauncher } from '@/components/ai/AIChatbotLauncher'
import { AddNoteModal } from '@/components/timeline/AddNoteModal'
import { KAMAIPanel } from '@/components/ai/KAMAIPanel'
import { MobileNav } from '@/components/layout/MobileNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUIStore } from '@/stores/uiStore'

export function AppShell() {
  useKeyboardShortcuts()
  const shortcutOpen = useUIStore(state => state.shortcutModalOpen)
  const setShortcutOpen = useUIStore(state => state.setShortcutModalOpen)
  const noteOpen = useUIStore(state => state.globalNoteOpen)
  const setNoteOpen = useUIStore(state => state.setGlobalNoteOpen)
  const activeAccountId = useUIStore(state => state.activeAccountId)

  return (
    <div className="min-h-screen bg-surface-secondary text-ink">
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Topbar />
          <main className="mx-auto w-full max-w-[1500px] px-4 py-5 pb-24 lg:px-8 lg:py-7 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNav />
      <AIChatbotLauncher />
      <KAMAIPanel />
      <AddNoteModal accountId={activeAccountId} open={noteOpen} onOpenChange={setNoteOpen} />
      <Dialog.Root open={shortcutOpen} onOpenChange={setShortcutOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-6 shadow-panel">
            <Dialog.Title className="font-display text-2xl font-bold text-ink">Keyboard shortcuts</Dialog.Title>
            <div className="mt-5 space-y-3 text-sm text-ink-secondary">
              {[
                ['Cmd/Ctrl + K', 'Open KAM AI'],
                ['?', 'Open shortcuts'],
                ['N', 'Add timeline note'],
                ['E', 'Go to governance'],
                ['G then D', 'Go to dashboard'],
                ['G then A', 'Go to accounts'],
              ].map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between gap-4 border-b border-surface-border pb-3 last:border-b-0">
                  <span>{label}</span>
                  <span className="rounded-md border border-surface-border bg-surface-tertiary px-2 py-1 text-xs font-semibold text-ink">{keys}</span>
                </div>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
