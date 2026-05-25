import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { sidebarLinks } from '@/components/layout/Sidebar'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { useRole } from '@/hooks/useRole'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

export function MobileNav() {
  const user = useRole()
  const open = useUIStore(state => state.mobileNavOpen)
  const setOpen = useUIStore(state => state.setMobileNavOpen)
  const links = sidebarLinks.filter(link => !link.privileged || user.role === 'leadership' || user.role === 'admin')

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(86vw,340px)] flex-col bg-brand-blue-dark p-4 text-white shadow-panel lg:hidden">
          <div className="flex h-14 items-center justify-between gap-3">
            <Dialog.Title className="sr-only">Mobile navigation</Dialog.Title>
            <span className="flex h-11 w-[156px] items-center overflow-hidden px-1">
              <TkxelLogo size="sidebar" tone="white" />
            </span>
            <Dialog.Close className="tk-icon-button text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close navigation">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <nav className="mt-5 flex-1 space-y-1">
            {links.map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/15 text-white font-semibold' : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <link.icon className="h-5 w-5 shrink-0" />
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/15 pt-4">
            <div className="flex items-center gap-3 rounded-lg bg-white/10 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-blue-dark">
                {user.avatarInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/65">{user.role}</p>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
