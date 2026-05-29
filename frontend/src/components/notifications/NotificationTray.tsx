import * as Dialog from '@radix-ui/react-dialog'
import { Bell, Check, ExternalLink, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useNotificationStore } from '@/stores/notificationStore'
import { formatRelative } from '@/utils/formatters'

export function NotificationTray() {
  const notifications = useNotificationStore(state => state.notifications)
  const markRead = useNotificationStore(state => state.markRead)
  const unread = notifications.filter(item => !item.read).length

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="tk-icon-button relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-orange" /> : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content className="fixed right-4 top-16 z-50 max-h-[min(760px,calc(100vh-5rem))] w-[min(440px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-surface-border bg-white shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border p-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Notifications</p>
              <Dialog.Title className="text-base font-semibold text-ink">{unread} unread updates</Dialog.Title>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close notifications">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="divide-y divide-surface-border">
            {notifications.map(notification => (
              <article key={notification.id} className="grid gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-tint-20 text-xs font-bold text-brand-blue">{notification.avatarInitials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{notification.sentence}</p>
                    {notification.accountId && notification.accountName ? (
                      <Link to={`/accounts/${notification.accountId}`} className="mt-1 inline-flex text-xs font-semibold text-brand-blue hover:text-brand-blue-dark">
                        {notification.accountName}
                      </Link>
                    ) : null}
                    <p className="mt-1 line-clamp-1 text-xs text-ink-secondary">{notification.contentPreview}</p>
                    <p className="mt-1 text-[11px] text-ink-tertiary">{formatRelative(notification.timestamp)}{notification.emailQueued ? ' | email queued' : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="tk-button-secondary" onClick={() => markRead(notification.id)}>
                    <Check className="h-4 w-4" />
                    Mark as read
                  </button>
                  {notification.route ? (
                    <Link to={notification.route} className="tk-button-primary">
                      <ExternalLink className="h-4 w-4" />
                      View
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
