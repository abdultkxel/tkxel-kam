import { Command, Menu, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { AISearchBar } from '@/components/ai/AISearchBar'
import { NotificationTray } from '@/components/notifications/NotificationTray'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { useUIStore } from '@/stores/uiStore'

export function Topbar() {
  const location = useLocation()
  const openAI = useUIStore(state => state.openAI)
  const setMobileNavOpen = useUIStore(state => state.setMobileNavOpen)
  const title = location.pathname.split('/').filter(Boolean)[0] ?? 'dashboard'

  return (
    <header className="sticky top-0 z-30 grid h-14 grid-cols-[1fr_auto] items-center gap-2 border-b border-surface-border bg-white px-3 sm:h-16 sm:grid-cols-[minmax(220px,auto)_minmax(260px,1fr)_auto] sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button className="tk-icon-button lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
        <TkxelLogo size="topbar" />
        <div className="hidden h-8 w-px shrink-0 bg-surface-border md:block" />
        <div className="hidden min-w-0 md:block">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KAM Platform</p>
          <p className="truncate capitalize text-sm font-semibold text-ink">{title.replace('-', ' ')}</p>
        </div>
      </div>
      <div className="hidden min-w-0 lg:block">
        <AISearchBar compact />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
        <button className="tk-icon-button" onClick={() => openAI()} aria-label="Open KAM AI">
          <Command className="h-5 w-5" />
        </button>
        <button className="tk-icon-button hidden sm:inline-flex" onClick={() => openAI('Search accounts, timeline, tasks, and risks')} aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
        <NotificationTray />
      </div>
    </header>
  )
}
