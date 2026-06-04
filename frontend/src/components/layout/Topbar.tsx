import { ArrowLeft, LogOut, Menu, Sparkles, UserRound, Video } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AISearchBar } from '@/components/ai/AISearchBar'
import { NotificationTray } from '@/components/notifications/NotificationTray'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { useAuth } from '@/contexts/AuthContext'
import { useUIStore } from '@/stores/uiStore'

export function Topbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout, user } = useAuth()
  const setMobileNavOpen = useUIStore(state => state.setMobileNavOpen)
  const openAI = useUIStore(state => state.openAI)
  const setMeetingCaptureOpen = useUIStore(state => state.setMeetingCaptureOpen)
  const title = location.pathname.split('/').filter(Boolean)[0] ?? 'dashboard'
  const historyIndex = typeof window !== 'undefined' ? Number(window.history.state?.idx ?? 0) : 0
  const onDashboard = location.pathname === '/' || location.pathname === '/dashboard'
  const backDisabled = historyIndex <= 0 && onDashboard

  function goBack() {
    if (backDisabled) return
    if (historyIndex > 0) navigate(-1)
    else navigate('/dashboard')
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="v4-topbar sticky top-0 z-30 border-b border-surface-border bg-white">
      <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 sm:grid-cols-[minmax(280px,auto)_minmax(260px,820px)_auto] sm:px-5">
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
          <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
            <AISearchBar compact />
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark"
              onClick={() => openAI('Summarise my assigned projects')}
              title="Ask KAM AI across assigned projects"
            >
              <Sparkles className="h-4 w-4" />
              KAM AI
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          <button
            type="button"
            className="tk-icon-button"
            onClick={() => setMeetingCaptureOpen(true)}
            aria-label="Open meeting capture"
            title="Meeting capture"
          >
            <Video className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="tk-icon-button bg-brand-blue text-white hover:bg-brand-blue-dark md:hidden"
            onClick={() => openAI('Summarise my assigned projects')}
            aria-label="Open KAM AI"
            title="Ask KAM AI across assigned projects"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <NotificationTray />
          <button
            type="button"
            className="hidden min-h-[44px] items-center justify-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-tertiary lg:inline-flex"
            onClick={() => navigate('/profile')}
            title="Open profile"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-[11px] font-bold text-white">
              {user?.avatarInitials ?? <UserRound className="h-4 w-4" />}
            </span>
            <span className="max-w-28 truncate">{user?.name ?? 'Profile'}</span>
          </button>
          <button className="tk-icon-button" type="button" onClick={handleLogout} aria-label="Logout" title="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-t border-surface-border px-3 py-2 md:hidden">
        <AISearchBar compact />
      </div>
    </header>
  )
}
