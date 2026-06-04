import * as Dialog from '@radix-ui/react-dialog'
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AddNoteModal } from '@/components/timeline/AddNoteModal'
import { KAMAIPanel } from '@/components/ai/KAMAIPanel'
import { MobileNav } from '@/components/layout/MobileNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { V4AmbientScene } from '@/components/layout/V4AmbientScene'
import { MeetingCapturePanel } from '@/components/meeting/MeetingCapturePanel'
import { useAuth } from '@/contexts/AuthContext'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { listAccounts } from '@/services/accountWorkspace'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useUIStore } from '@/stores/uiStore'

export function AppShell() {
  useKeyboardShortcuts()
  const shortcutOpen = useUIStore(state => state.shortcutModalOpen)
  const setShortcutOpen = useUIStore(state => state.setShortcutModalOpen)
  const noteOpen = useUIStore(state => state.globalNoteOpen)
  const setNoteOpen = useUIStore(state => state.setGlobalNoteOpen)
  const activeAccountId = useUIStore(state => state.activeAccountId)
  const { token, user } = useAuth()
  const setAccounts = useAccountStore(state => state.setAccounts)
  const setAccountsLoading = useAccountStore(state => state.setAccountsLoading)
  const setAccountsError = useAccountStore(state => state.setAccountsError)
  const governanceEvents = useGovernanceStore(state => state.events)
  const loadGovernanceEvents = useGovernanceStore(state => state.loadEvents)
  const loadOpportunities = useOpportunityStore(state => state.loadOpportunities)
  const loadOpportunityReferenceData = useOpportunityStore(state => state.loadReferenceData)
  const addNotification = useNotificationStore(state => state.addNotification)

  useEffect(() => {
    if (token) void loadGovernanceEvents(token, { pageSize: 100, sort: 'event_date', direction: 'asc' })
  }, [loadGovernanceEvents, token])

  useEffect(() => {
    if (!token) return
    void loadOpportunityReferenceData(token)
    void loadOpportunities(token, { pageSize: 500, sort: 'target_date', direction: 'asc' })
  }, [loadOpportunities, loadOpportunityReferenceData, token])

  useEffect(() => {
    if (!token) return
    const query = new URLSearchParams()
    query.set('sort', 'name')
    query.set('direction', 'asc')
    query.set('page', '1')
    query.set('page_size', '100')

    let active = true
    setAccountsLoading(true)
    listAccounts(token, query)
      .then(result => {
        if (active) setAccounts(result.items)
      })
      .catch(err => {
        if (!active) return
        setAccounts([])
        setAccountsError(err instanceof Error ? err.message : 'Unable to load accounts')
      })

    return () => {
      active = false
    }
  }, [setAccounts, setAccountsError, setAccountsLoading, token])

  useEffect(() => {
    if (!user) return
    governanceEvents
      .filter(event => event.ownerId === user.id && event.status === 'overdue')
      .forEach(event => {
        addNotification({
          userId: event.ownerId,
          trigger: 'governance_overdue',
          sentence: `${event.type} is overdue for ${event.accountName}`,
          accountId: event.accountId,
          accountName: event.accountName,
          contentPreview: event.agenda,
          route: `/accounts/${event.accountId}?tab=governance`,
          sourceKey: event.id,
        })
      })
  }, [addNotification, governanceEvents, user])

  return (
    <div className="v4-shell text-ink">
      <V4AmbientScene />
      <div className="v4-main-surface flex">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Topbar />
          <main className="relative mx-auto w-full max-w-[1500px] px-4 py-5 pb-24 lg:px-8 lg:py-7 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNav />
      <KAMAIPanel />
      <MeetingCapturePanel />
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
