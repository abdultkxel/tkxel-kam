import { Activity, BarChart3, Bell, BriefcaseBusiness, Building2, CalendarDays, ChevronLeft, FileText, Home, ListChecks, PlaySquare, Settings, ShieldAlert, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { useUIStore } from '@/stores/uiStore'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { cn } from '@/utils/cn'

export const sidebarLinks: { to: string; label: string; icon: LucideIcon; privileged?: boolean }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/accounts', label: 'Accounts', icon: Building2 },
  { to: '/opportunities', label: 'Opportunities', icon: BriefcaseBusiness },
  { to: '/governance', label: 'Governance', icon: CalendarDays },
  { to: '/escalations', label: 'Escalations', icon: ShieldAlert },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/health-scores', label: 'Health Scores', icon: Activity },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, privileged: true },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/playbook', label: 'Playbook', icon: PlaySquare },
  { to: '/admin', label: 'Admin', icon: Settings, privileged: true },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export function Sidebar() {
  const user = useRole()
  const collapsed = useUIStore(state => state.sidebarCollapsed)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)

  return (
    <aside className={cn('v4-sidebar sticky top-0 hidden h-screen shrink-0 flex-col bg-brand-blue-dark text-white transition-all duration-200 lg:flex', collapsed ? 'w-20' : 'w-64')}>
      <div className="relative z-10 flex h-16 items-center justify-between gap-3 px-3">
        <div className={cn('flex h-11 items-center overflow-hidden px-1', collapsed ? 'w-12 justify-center' : 'w-[152px]')}>
          <TkxelLogo size={collapsed ? 'mark' : 'sidebar'} tone="white" />
        </div>
        <button className="tk-icon-button text-white/70 hover:bg-white/10 hover:text-white" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed ? 'rotate-180' : '')} />
        </button>
      </div>

      <nav className="relative z-10 flex-1 space-y-1 px-3 py-4">
        {sidebarLinks.filter(link => !link.privileged || user.role === 'leadership' || user.role === 'admin' || user.role === 'super_admin').map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                isActive ? 'bg-white/15 text-white font-semibold' : 'text-white/70 hover:bg-white/10 hover:text-white',
                collapsed ? 'justify-center' : '',
              )
            }
          >
            <link.icon className="h-5 w-5 shrink-0" />
            {collapsed ? null : <span>{link.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="relative z-10 border-t border-white/15 p-3">
        <div className={cn('flex items-center gap-3 rounded-lg bg-white/10 p-3', collapsed ? 'justify-center' : '')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-blue-dark">{user.avatarInitials}</div>
          {collapsed ? null : (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/65">{user.role}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
