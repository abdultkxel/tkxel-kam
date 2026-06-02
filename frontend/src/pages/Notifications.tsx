import { Bell, Check, Loader2, Search } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { getNotifications, markAllNotificationsRead, markNotificationRead, NotificationRecord } from '@/services/notificationsReporting'
import { formatRelative } from '@/utils/formatters'

export function Notifications() {
  const { token } = useAuth()
  const [items, setItems] = useState<NotificationRecord[]>([])
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [readState, setReadState] = useState('')
  const [trigger, setTrigger] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getNotifications(token, { search, read_state: readState, trigger, page, page_size: 12 })
      .then(result => {
        if (!active) return
        setItems(result.items)
        setPages(result.pages)
        setUnread(result.unread_count)
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
  }, [page, readState, search, token, trigger])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setSearch(draftSearch)
  }

  async function markRead(item: NotificationRecord) {
    if (!token || item.read_at) return
    const updated = await markNotificationRead(token, item.id)
    setItems(current => current.map(value => (value.id === item.id ? updated : value)))
    setUnread(value => Math.max(0, value - 1))
  }

  async function markAllRead() {
    if (!token) return
    await markAllNotificationsRead(token)
    setItems(current => current.map(item => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
    setUnread(0)
    toast.success('Notifications marked read')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Notifications"
        title="Notification Center"
        description="Search, filter, and review account alerts, SLA escalations, mentions, and governance reminders."
        actions={unread ? <button className="tk-button-secondary" type="button" onClick={() => void markAllRead()}><Check className="h-4 w-4" />Mark all read</button> : null}
      />

      <section className="tk-card p-4">
        <form className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]" onSubmit={submitSearch}>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input className="tk-input pl-9" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Search title, body, account" />
          </label>
          <select className="tk-input" value={readState} onChange={event => { setReadState(event.target.value); setPage(1) }}>
            <option value="">All states</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
          <select className="tk-input" value={trigger} onChange={event => { setTrigger(event.target.value); setPage(1) }}>
            <option value="">All triggers</option>
            <option value="sla_escalation">SLA escalation</option>
            <option value="stale_kyc">Stale KYC</option>
            <option value="renewal_due">Renewal due</option>
            <option value="governance_reminder">Governance reminder</option>
            <option value="timeline_mention">Mention</option>
          </select>
          <button className="tk-button-primary" type="submit">
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>
      </section>

      <section className="tk-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border p-4">
          <h2 className="text-base font-semibold text-ink">Inbox</h2>
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{unread} unread</span>
        </div>
        {loading ? <div className="flex items-center gap-2 p-5 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading notifications</div> : null}
        {error ? <div className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</div> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-8 text-center text-sm text-ink-secondary">
            <Bell className="h-8 w-8 text-brand-blue" />
            No notifications match this view.
          </div>
        ) : null}
        <div className="divide-y divide-surface-border">
          {items.map(item => (
            <article key={item.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                  {!item.read_at ? <span className="rounded-full bg-brand-orange/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-orange">Unread</span> : null}
                  <span className="rounded-full bg-surface-tertiary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">{item.trigger.replace(/_/g, ' ')}</span>
                </div>
                <p className="mt-1 text-sm text-ink-secondary">{item.body}</p>
                <p className="mt-1 text-xs text-ink-tertiary">{formatRelative(item.created_at)}{item.email_queued ? ' | email queued' : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="tk-button-secondary" type="button" disabled={Boolean(item.read_at)} onClick={() => void markRead(item)}>
                  <Check className="h-4 w-4" />
                  Read
                </button>
                {item.source_record_route ? <Link className="tk-button-primary" to={item.source_record_route}>Open</Link> : null}
              </div>
            </article>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-surface-border p-4">
          <button className="tk-button-secondary" type="button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
          <span className="text-sm text-ink-secondary">Page {page} of {pages || 1}</span>
          <button className="tk-button-secondary" type="button" disabled={!pages || page >= pages} onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </section>
    </div>
  )
}
