import * as Dialog from '@radix-ui/react-dialog'
import { Bell, Check, ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getNotifications, markAllNotificationsRead, markNotificationRead, NotificationRecord } from '@/services/notificationsReporting'
import { formatRelative } from '@/utils/formatters'

export function NotificationTray() {
  const { token } = useAuth()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getNotifications(token, { page: 1, page_size: 8 })
      .then(page => {
        if (!active) return
        setNotifications(page.items)
        setUnread(page.unread_count)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Notifications could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function markRead(id: string) {
    if (!token) return
    const updated = await markNotificationRead(token, id)
    setNotifications(items => items.map(item => (item.id === id ? updated : item)))
    setUnread(value => Math.max(0, value - 1))
  }

  async function markAllRead() {
    if (!token) return
    await markAllNotificationsRead(token)
    setNotifications(items => items.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
    setUnread(0)
  }

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
            <div className="flex gap-2">
              {unread ? <button type="button" className="tk-button-secondary" onClick={() => void markAllRead()}><Check className="h-4 w-4" />All read</button> : null}
              <Dialog.Close className="tk-icon-button" aria-label="Close notifications">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>

          <div className="divide-y divide-surface-border">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-sm font-medium text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications
              </div>
            ) : null}
            {error ? <div className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</div> : null}
            {!loading && !error && notifications.length === 0 ? <div className="p-4 text-sm text-ink-secondary">No notifications.</div> : null}
            {notifications.map(notification => (
              <article key={notification.id} className="grid gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-tint-20 text-xs font-bold text-brand-blue">{notification.priority.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{notification.title}</p>
                    {notification.account_id && notification.account_name_snapshot ? (
                      <Link to={`/accounts/${notification.account_id}`} className="mt-1 inline-flex text-xs font-semibold text-brand-blue hover:text-brand-blue-dark">
                        {notification.account_name_snapshot}
                      </Link>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{notification.body}</p>
                    <p className="mt-1 text-[11px] text-ink-tertiary">{formatRelative(notification.created_at)}{notification.email_queued ? ' | email queued' : ''}{notification.read_at ? ' | read' : ''}</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="tk-button-secondary" onClick={() => void markRead(notification.id)} disabled={Boolean(notification.read_at)}>
                    <Check className="h-4 w-4" />
                    Mark as read
                  </button>
                  {notification.source_record_route ? (
                    <Link to={notification.source_record_route} className="tk-button-primary">
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
