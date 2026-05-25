import { ArrowLeft, Menu } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AISearchBar } from '@/components/ai/AISearchBar'
import { NotificationTray } from '@/components/notifications/NotificationTray'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { useUIStore } from '@/stores/uiStore'

export function Topbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const setMobileNavOpen = useUIStore(state => state.setMobileNavOpen)
  const title = location.pathname.split('/').filter(Boolean)[0] ?? 'dashboard'
  const historyIndex = typeof window !== 'undefined' ? Number(window.history.state?.idx ?? 0) : 0
  const onDashboard = location.pathname === '/' || location.pathname === '/dashboard'
  const backDisabled = historyIndex <= 0 && onDashboard

  function goBack() {
    if (backDisabled) return
    if (historyIndex > 0) navigate(-1)
    else navigate('/dashboard')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-surface-border bg-white">
      <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 sm:grid-cols-[minmax(280px,auto)_minmax(260px,680px)_auto] sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button className="tk-icon-button lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-2 rounded-md border border-surface-border bg-white px-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:text-ink-tertiary disabled:hover:bg-white"
            onClick={goBack}
            disabled={backDisabled}
            aria-label="Go back"
            title="Back"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden xl:inline">Back</span>
          </button>
          <TkxelLogo size="topbar" />
          <div className="hidden h-8 w-px shrink-0 bg-surface-border md:block" />
          <div className="hidden min-w-0 md:block">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KAM Platform</p>
            <p className="truncate capitalize text-sm font-semibold text-ink">{title.replace('-', ' ')}</p>
          </div>
        </div>
        <div className="hidden min-w-0 md:block">
          <AISearchBar compact />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          <NotificationTray />
        </div>
      </div>
      <div className="border-t border-surface-border px-3 py-2 md:hidden">
        <AISearchBar compact />
      </div>
    </header>
  )
}
