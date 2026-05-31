import * as Dialog from '@radix-ui/react-dialog'
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, startOfMonth, subMonths } from 'date-fns'
import { ArrowLeft, ArrowRight, Ban, CalendarDays, Check, ClipboardCheck, Download, ExternalLink, Loader2, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AddGovernanceEventDialog } from '@/components/governance/AddGovernanceEventDialog'
import { CompleteGovernanceEventDialog } from '@/components/governance/CompleteGovernanceEventDialog'
import { EditGovernanceEventDialog } from '@/components/governance/EditGovernanceEventDialog'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { useV3Store } from '@/stores/v3Store'
import { GovernanceEventRecord, GovernanceEventStatus, GovernanceEventType, GovernanceGeneratedOutputCitationRecord, GovernanceGeneratedOutputRecord } from '@/types/governance'
import { cn } from '@/utils/cn'
import { filterAndSortGovernanceEvents, GovernanceSortDirection, GovernanceSortKey } from '@/utils/governanceFlow'
import { buildUnifiedCalendarItems, UnifiedCalendarItem } from '@/utils/unifiedCalendar'

const tone = {
  QBR: 'bg-brand-blue',
  SteerCo: 'bg-brand-blue-dark',
  'Monthly Review': 'bg-rag-green',
  'Executive Review': 'bg-brand-orange',
} as const

const governanceTypes: GovernanceEventType[] = ['QBR', 'SteerCo', 'Monthly Review', 'Executive Review']
const governanceStatuses: GovernanceEventStatus[] = ['upcoming', 'overdue', 'completed', 'cancelled']

function exportIcs(items: UnifiedCalendarItem[], monthLabel: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tkxel KAM//Unified Calendar//EN',
    ...items.flatMap(item => [
      'BEGIN:VEVENT',
      `UID:${item.id}@tkxel-kam`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${new Date(item.date).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `SUMMARY:${item.kind === 'governance' ? item.source.type : item.kind === 'score_activity' ? 'Score activity' : 'Renewal signal'} - ${item.accountName}`,
      `DESCRIPTION:${item.detail}`,
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ]
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/calendar' }))
  link.download = `tkxel-calendar-${monthLabel}.ics`
  link.click()
  URL.revokeObjectURL(link.href)
}

export function GovernancePanel() {
  const [month, setMonth] = useState(new Date())
  const [selected, setSelected] = useState<UnifiedCalendarItem | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [showGovernance, setShowGovernance] = useState(true)
  const [showScoreActivities, setShowScoreActivities] = useState(true)
  const [showRenewalItems, setShowRenewalItems] = useState(true)
  const [accountFilter, setAccountFilter] = useState('')
  const [engagementFilter, setEngagementFilter] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<GovernanceEventStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<GovernanceEventType | 'all'>('all')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [attendeeFilter, setAttendeeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [sortKey, setSortKey] = useState<GovernanceSortKey>('event_date')
  const [sortDirection, setSortDirection] = useState<GovernanceSortDirection>('asc')
  const [page, setPage] = useState(1)
  const [brief, setBrief] = useState<GovernanceGeneratedOutputRecord | null>(null)
  const [agendaDraft, setAgendaDraft] = useState<GovernanceGeneratedOutputRecord | null>(null)
  const [agendaDraftText, setAgendaDraftText] = useState('')
  const [outputLoading, setOutputLoading] = useState<'agenda' | 'brief' | 'accept' | ''>('')
  const [mutatingId, setMutatingId] = useState('')
  const { token } = useAuth()
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const events = useGovernanceStore(state => state.events)
  const governanceLoading = useGovernanceStore(state => state.loading)
  const governanceError = useGovernanceStore(state => state.error)
  const loadEvents = useGovernanceStore(state => state.loadEvents)
  const updateEvent = useGovernanceStore(state => state.updateEvent)
  const generateAgendaDraft = useGovernanceStore(state => state.generateAgendaDraft)
  const updateAgenda = useGovernanceStore(state => state.updateAgenda)
  const generateBrief = useGovernanceStore(state => state.generateBrief)
  const scoreTasks = useScoreActivityStore(state => state.tasks)
  const signals = useV3Store(state => state.signals)
  const visibleItems = useMemo(() => {
    const items = buildUnifiedCalendarItems(events, scoreTasks, signals)
    return items
      .filter(item => item.kind === 'governance' ? showGovernance : item.kind === 'score_activity' ? showScoreActivities : showRenewalItems)
      .filter(item => !mineOnly || item.ownerId === user.id)
      .filter(item => !accountFilter || item.accountId === accountFilter)
  }, [accountFilter, events, mineOnly, scoreTasks, showGovernance, showRenewalItems, showScoreActivities, signals, user.id])
  const monthItems = visibleItems.filter(item => new Date(item.date).getMonth() === month.getMonth() && new Date(item.date).getFullYear() === month.getFullYear())
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const ownerOptions = useMemo(
    () =>
      Array.from(new Map(events.filter(event => event.ownerId).map(event => [event.ownerId, event.ownerName || event.ownerId])).entries())
        .sort((a, b) => a[1].localeCompare(b[1])),
    [events],
  )
  const engagementOptions = useMemo(
    () =>
      Array.from(new Map(events.filter(event => event.engagementId).map(event => [event.engagementId ?? '', event.engagementName ?? event.engagementId ?? 'Engagement'])).entries())
        .sort((a, b) => a[1].localeCompare(b[1])),
    [events],
  )
  const sourceOptions = useMemo(
    () => Array.from(new Set(events.map(event => event.source).filter(Boolean))).sort() as string[],
    [events],
  )
  const governanceRows = useMemo(
    () =>
      filterAndSortGovernanceEvents(
        events,
        {
          search,
          accountId: accountFilter,
          engagementId: engagementFilter,
          ownerId: ownerFilter,
          attendee: attendeeFilter,
          source: sourceFilter,
          dateFrom: dateFromFilter,
          dateTo: dateToFilter,
          status: statusFilter,
          governanceType: typeFilter,
          mineOnly,
          currentUserId: user.id,
        },
        sortKey,
        sortDirection,
      ),
    [accountFilter, attendeeFilter, dateFromFilter, dateToFilter, engagementFilter, events, mineOnly, ownerFilter, search, sortDirection, sortKey, sourceFilter, statusFilter, typeFilter, user.id],
  )
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(governanceRows.length / pageSize))
  const pagedGovernanceRows = governanceRows.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [accountFilter, attendeeFilter, dateFromFilter, dateToFilter, engagementFilter, mineOnly, ownerFilter, search, sortDirection, sortKey, sourceFilter, statusFilter, typeFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  async function buildAgendaDraft(event: GovernanceEventRecord) {
    if (!token) return toast.error('Sign in again before generating the agenda.')
    setOutputLoading('agenda')
    try {
      const draft = await generateAgendaDraft(token, event.id, { sourceModules: ['timeline', 'health', 'engagements', 'governance'] })
      setAgendaDraft(draft)
      setAgendaDraftText(draft.content)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to generate agenda draft')
    } finally {
      setOutputLoading('')
    }
  }

  async function acceptAgenda(event: GovernanceEventRecord, draft: GovernanceGeneratedOutputRecord) {
    if (!token) return toast.error('Sign in again before updating the agenda.')
    if (!agendaDraftText.trim()) return toast.error('Review or edit the agenda draft before accepting it.')
    setOutputLoading('accept')
    try {
      const savedEvent = await updateAgenda(token, event.id, agendaDraftText.trim(), draft.id)
      setSelected(current => current && current.kind === 'governance' && current.source.id === savedEvent.id
        ? { ...current, date: savedEvent.date, detail: savedEvent.agenda, status: savedEvent.status, source: savedEvent }
        : current)
      toast.success('Agenda updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update agenda')
    } finally {
      setOutputLoading('')
    }
  }

  async function buildBrief(event: GovernanceEventRecord) {
    if (!token) return toast.error('Sign in again before generating the brief.')
    setOutputLoading('brief')
    try {
      setBrief(await generateBrief(token, event.id, { sourceModules: ['timeline', 'opportunities', 'health', 'governance'] }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to generate governance brief')
    } finally {
      setOutputLoading('')
    }
  }

  async function refreshEvents() {
    if (!token) return toast.error('Sign in again before refreshing governance.')
    await loadEvents(token, { pageSize: 100, sort: 'event_date', direction: 'asc' })
  }

  function openGovernanceEvent(event: GovernanceEventRecord) {
    setSelected(governanceEventToCalendarItem(event))
    setBrief(null)
    setAgendaDraft(null)
    setAgendaDraftText('')
  }

  function syncSelectedEvent(event: GovernanceEventRecord) {
    setSelected(current => current && current.kind === 'governance' && current.source.id === event.id ? governanceEventToCalendarItem(event) : current)
  }

  async function cancelEvent(event: GovernanceEventRecord) {
    if (!token) return toast.error('Sign in again before cancelling governance.')
    const confirmed = window.confirm(`Cancel ${event.type} for ${event.accountName}?`)
    if (!confirmed) return
    setMutatingId(event.id)
    try {
      const savedEvent = await updateEvent(token, event.id, { status: 'cancelled' })
      syncSelectedEvent(savedEvent)
      toast.success('Governance event cancelled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to cancel governance event')
    } finally {
      setMutatingId('')
    }
  }

  const selectedGovernanceEvent = selected?.kind === 'governance' ? events.find(event => event.id === selected.source.id) ?? selected.source : null

  return (
    <>
      <section className="tk-card p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Calendar view</p>
            <h2 className="text-base font-semibold text-ink">{format(month, 'MMMM yyyy')}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={cn('tk-button-secondary', showGovernance ? 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue' : '')}
              onClick={() => setShowGovernance(value => !value)}
              aria-pressed={showGovernance}
            >
              {showGovernance ? <Check className="h-4 w-4" /> : null}
              Governance
            </button>
            <button
              className={cn('tk-button-secondary', showScoreActivities ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : '')}
              onClick={() => setShowScoreActivities(value => !value)}
              aria-pressed={showScoreActivities}
            >
              {showScoreActivities ? <Check className="h-4 w-4" /> : null}
              Score activities
            </button>
            <button
              className={cn('tk-button-secondary', showRenewalItems ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : '')}
              onClick={() => setShowRenewalItems(value => !value)}
              aria-pressed={showRenewalItems}
            >
              {showRenewalItems ? <Check className="h-4 w-4" /> : null}
              Renewals
            </button>
            <label className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
              <input type="checkbox" checked={mineOnly} onChange={event => setMineOnly(event.target.checked)} className="peer sr-only" />
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-surface-border bg-white text-white peer-checked:border-brand-blue peer-checked:bg-brand-blue">
                <Check className="h-3 w-3" />
              </span>
              My accounts only
            </label>
            <select className="tk-input w-auto min-w-[200px]" value={accountFilter} onChange={event => setAccountFilter(event.target.value)} aria-label="Calendar account filter">
              <option value="">All accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <button className="tk-button-secondary" onClick={() => exportIcs(monthItems, format(month, 'yyyy-MM'))}>
              <Download className="h-4 w-4" />
              Export iCal
            </button>
            <AddGovernanceEventDialog triggerClassName="tk-button-primary" onCreated={openGovernanceEvent} />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-center gap-2">
          <button className="tk-icon-button" onClick={() => setMonth(value => subMonths(value, 1))} aria-label="Previous month">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border px-4 text-sm font-semibold text-ink">
            <CalendarDays className="h-4 w-4 text-brand-blue" />
            {format(month, 'MMMM yyyy')}
          </span>
          <button className="tk-icon-button" onClick={() => setMonth(value => addMonths(value, 1))} aria-label="Next month">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 rounded-lg border border-surface-border bg-white">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="border-b border-surface-border p-2 text-center text-xs font-semibold uppercase tracking-wider text-ink-secondary">{day}</div>
            ))}
            {days.map(day => {
              const dayItems = monthItems.filter(item => isSameDay(new Date(item.date), day))
              return (
                <div key={day.toISOString()} className="min-h-[130px] border-b border-r border-surface-border p-2 last:border-r-0">
                  <p className="mb-2 text-xs font-semibold text-ink">{format(day, 'd')}</p>
                  <div className="space-y-1">
                    {dayItems.map(item => (
                      <button
                        key={item.id}
                        className="flex min-h-[44px] w-full min-w-[44px] items-center gap-2 rounded-md bg-surface-tertiary px-2 py-2 text-left text-xs hover:bg-blue-tint-20"
                        onClick={() => {
                          setSelected(item)
                          setBrief(null)
                          setAgendaDraft(null)
                        }}
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', itemDotClass(item))} />
                        <span className="truncate font-semibold text-ink">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="tk-card mt-5 overflow-hidden">
        <header className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Event register</p>
              <h2 className="text-base font-semibold text-ink">Governance events</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                Create, find, sort, edit, complete, cancel, and open governance records without leaving the calendar workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="tk-button-secondary bg-white" onClick={() => void refreshEvents()} disabled={governanceLoading}>
                <RefreshCw className={cn('h-4 w-4', governanceLoading && 'animate-spin')} />
                Refresh
              </button>
              <AddGovernanceEventDialog triggerClassName="tk-button-primary" onCreated={openGovernanceEvent} />
            </div>
          </div>
        </header>

        <div className="grid gap-4 border-b border-surface-border p-5 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(8,minmax(130px,auto))]">
          <label className="space-y-1">
            <span className="tk-label">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" />
              <input className="tk-input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Agenda, account, attendee, decision" />
            </span>
          </label>
          <label className="space-y-1">
            <span className="tk-label">Type</span>
            <select className="tk-input" value={typeFilter} onChange={event => setTypeFilter(event.target.value as GovernanceEventType | 'all')}>
              <option value="all">All types</option>
              {governanceTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label">Engagement</span>
            <select className="tk-input" value={engagementFilter} onChange={event => setEngagementFilter(event.target.value)}>
              <option value="">All engagements</option>
              {engagementOptions.map(([engagementId, engagementName]) => <option key={engagementId} value={engagementId}>{engagementName}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label">Status</span>
            <select className="tk-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value as GovernanceEventStatus | 'all')}>
              <option value="all">All statuses</option>
              {governanceStatuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label">Owner</span>
            <select className="tk-input" value={ownerFilter} onChange={event => setOwnerFilter(event.target.value)}>
              <option value="">All owners</option>
              {ownerOptions.map(([ownerId, ownerName]) => <option key={ownerId} value={ownerId}>{ownerName}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label">Attendee</span>
            <input className="tk-input" value={attendeeFilter} onChange={event => setAttendeeFilter(event.target.value)} placeholder="email" />
          </label>
          <label className="space-y-1">
            <span className="tk-label">Source</span>
            <select className="tk-input" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}>
              <option value="">All sources</option>
              {sourceOptions.map(source => <option key={source} value={source}>{source.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label">From</span>
            <input type="date" className="tk-input" value={dateFromFilter} onChange={event => setDateFromFilter(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="tk-label">To</span>
            <input type="date" className="tk-input" value={dateToFilter} onChange={event => setDateToFilter(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="tk-label">Sort</span>
            <select className="tk-input" value={sortKey} onChange={event => setSortKey(event.target.value as GovernanceSortKey)}>
              <option value="event_date">Event date</option>
              <option value="updated_at">Updated date</option>
              <option value="account">Account</option>
              <option value="type">Type</option>
              <option value="status">Status</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label">Order</span>
            <select className="tk-input" value={sortDirection} onChange={event => setSortDirection(event.target.value as GovernanceSortDirection)}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>

        <div className="p-5">
          {governanceError ? <p className="mb-4 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm font-semibold text-rag-red">{governanceError}</p> : null}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{governanceRows.length} governance events</p>
            <button
              type="button"
              className="text-sm font-semibold text-brand-blue hover:text-brand-blue-dark"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setTypeFilter('all')
                setEngagementFilter('')
                setOwnerFilter('')
                setAttendeeFilter('')
                setSourceFilter('')
                setDateFromFilter('')
                setDateToFilter('')
                setAccountFilter('')
                setMineOnly(false)
                setSortKey('event_date')
                setSortDirection('asc')
              }}
            >
              Clear filters
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-0 overflow-hidden rounded-lg border border-surface-border bg-white text-sm">
              <thead className="bg-surface-secondary text-left text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                <tr>
                  <th className="border-b border-surface-border px-4 py-3">Event</th>
                  <th className="border-b border-surface-border px-4 py-3">Account</th>
                  <th className="border-b border-surface-border px-4 py-3">Date</th>
                  <th className="border-b border-surface-border px-4 py-3">Owner</th>
                  <th className="border-b border-surface-border px-4 py-3">Status</th>
                  <th className="border-b border-surface-border px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedGovernanceRows.map(event => (
                  <tr key={event.id} className="align-top">
                    <td className="border-b border-surface-border px-4 py-4">
                      <p className="font-semibold text-ink">{event.type}</p>
                      <p className="mt-1 line-clamp-2 max-w-md text-xs leading-5 text-ink-secondary">{event.agenda}</p>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">{event.attendeeEmails.length} attendees | Actions: {event.actionItems.length}</p>
                    </td>
                    <td className="border-b border-surface-border px-4 py-4 font-medium text-ink">{event.accountName}</td>
                    <td className="border-b border-surface-border px-4 py-4 text-ink-secondary">{format(new Date(event.date), 'MMM d, yyyy h:mm a')}</td>
                    <td className="border-b border-surface-border px-4 py-4 text-ink-secondary">{event.ownerName || event.ownerId || 'Unassigned'}</td>
                    <td className="border-b border-surface-border px-4 py-4">
                      <GovernanceStatusBadge status={event.status} />
                    </td>
                    <td className="border-b border-surface-border px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className="tk-button-secondary min-h-[38px] px-3" onClick={() => openGovernanceEvent(event)}>
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </button>
                        <EditGovernanceEventDialog event={event} triggerClassName="tk-button-secondary min-h-[38px] px-3" onSaved={syncSelectedEvent} />
                        {event.status !== 'completed' && event.status !== 'cancelled' ? (
                          <CompleteGovernanceEventDialog event={event} triggerClassName="tk-button-primary min-h-[38px] px-3" triggerLabel="Complete" onCompleted={syncSelectedEvent} />
                        ) : null}
                        {event.status !== 'cancelled' && event.status !== 'completed' ? (
                          <button type="button" className="tk-button-secondary min-h-[38px] px-3" onClick={() => void cancelEvent(event)} disabled={mutatingId === event.id}>
                            {mutatingId === event.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!governanceRows.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-secondary">No governance events match the current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-ink-secondary">
              Showing {governanceRows.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, governanceRows.length)} of {governanceRows.length}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
                <ArrowLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="min-h-[44px] rounded-md border border-surface-border bg-white px-3 py-3 text-xs font-semibold text-ink">
                Page {page} of {totalPages}
              </span>
              <button type="button" className="tk-button-secondary" disabled={page >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={open => {
          if (!open) {
            setSelected(null)
            setBrief(null)
            setAgendaDraft(null)
            setAgendaDraftText('')
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(520px,100vw)] overflow-y-auto border-l border-surface-border bg-white p-6 shadow-panel">
            {selected ? (
              <>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">
                      {selected.kind === 'governance' ? selectedGovernanceEvent?.type : selected.kind === 'score_activity' ? 'Score activity' : 'Renewal signal'}
                    </p>
                    <Dialog.Title className="font-display text-2xl font-bold text-ink">{selected.accountName}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                      {format(new Date(selectedGovernanceEvent?.date ?? selected.date), 'MMM d, yyyy')} | {(selectedGovernanceEvent?.status ?? selected.status).replace('_', ' ')}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close className="tk-icon-button" aria-label="Close event detail">
                    <X className="h-5 w-5" />
                  </Dialog.Close>
                </div>
                <div className="space-y-4">
                  {selected.kind === 'governance' && selectedGovernanceEvent ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <EditGovernanceEventDialog event={selectedGovernanceEvent} triggerClassName="tk-button-secondary" onSaved={syncSelectedEvent} />
                        {selectedGovernanceEvent.status !== 'completed' && selectedGovernanceEvent.status !== 'cancelled' ? (
                          <CompleteGovernanceEventDialog event={selectedGovernanceEvent} triggerClassName="tk-button-primary" onCompleted={syncSelectedEvent} />
                        ) : null}
                        {selectedGovernanceEvent.status !== 'completed' && selectedGovernanceEvent.status !== 'cancelled' ? (
                          <button type="button" className="tk-button-secondary" onClick={() => void cancelEvent(selectedGovernanceEvent)} disabled={mutatingId === selectedGovernanceEvent.id}>
                            {mutatingId === selectedGovernanceEvent.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                            Cancel event
                          </button>
                        ) : null}
                      </div>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Agenda</h3>
                        <p className="mt-2 text-sm text-ink-secondary">{selectedGovernanceEvent.agenda}</p>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Attendees</h3>
                        <p className="mt-2 text-sm text-ink-secondary">{selectedGovernanceEvent.attendees.join(', ') || 'No attendees recorded.'}</p>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Action items</h3>
                        <ul className="mt-2 space-y-2 text-sm text-ink-secondary">
                          {selectedGovernanceEvent.actionItems.map(item => <li key={item}>{item}</li>)}
                        </ul>
                        {!selectedGovernanceEvent.actionItems.length ? <p className="mt-2 text-sm text-ink-secondary">No action items recorded.</p> : null}
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Agenda draft</p>
                            <h3 className="text-sm font-semibold text-ink">Source-backed agenda</h3>
                          </div>
                          <button className="tk-button-secondary" disabled={Boolean(outputLoading)} onClick={() => buildAgendaDraft(selectedGovernanceEvent)}>
                            {outputLoading === 'agenda' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Generate draft
                          </button>
                        </div>
                        {agendaDraft ? (
                          <div className="mt-3 space-y-3">
                            <label className="space-y-1">
                              <span className="tk-label text-xs">Editable agenda draft</span>
                              <textarea
                                className="tk-input min-h-[220px] resize-y text-xs leading-5"
                                value={agendaDraftText}
                                onChange={event => setAgendaDraftText(event.target.value)}
                              />
                            </label>
                            <p className="text-xs font-medium text-ink-secondary">{agendaDraft.disclaimer}</p>
                            <SourceCitationList citations={agendaDraft.citations} />
                            <button className="tk-button-primary w-full" disabled={Boolean(outputLoading)} onClick={() => acceptAgenda(selectedGovernanceEvent, agendaDraft)}>
                              {outputLoading === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              Accept agenda
                            </button>
                          </div>
                        ) : null}
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance brief</p>
                            <h3 className="text-sm font-semibold text-ink">Pre-meeting context</h3>
                          </div>
                          <button className="tk-button-secondary" disabled={Boolean(outputLoading)} onClick={() => buildBrief(selectedGovernanceEvent)}>
                            {outputLoading === 'brief' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Generate brief
                          </button>
                        </div>
                        {brief ? (
                          <div className="mt-3 space-y-3">
                            <p className="whitespace-pre-line rounded-lg bg-surface-tertiary p-3 text-xs leading-5 text-ink-secondary">{brief.content}</p>
                            <p className="text-xs font-medium text-ink-secondary">{brief.disclaimer}</p>
                            <SourceCitationList citations={brief.citations} />
                          </div>
                        ) : null}
                      </section>
                      <Link to={`/accounts/${selected.accountId}?tab=governance`} className="tk-button-primary w-full">
                        <ExternalLink className="h-4 w-4" />
                        Open account
                      </Link>
                    </>
                  ) : selected.kind === 'score_activity' ? (
                    <>
                      <section className="rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-4">
                        <div className="flex items-start gap-3">
                          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                          <div>
                            <h3 className="text-sm font-semibold text-ink">{selected.source.title}</h3>
                            <p className="mt-2 text-sm text-ink-secondary">{selected.source.description}</p>
                          </div>
                        </div>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Task details</h3>
                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Calculator</dt>
                            <dd className="mt-1 font-medium capitalize text-ink">{selected.source.calculatorId}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Criterion</dt>
                            <dd className="mt-1 font-medium text-ink">{selected.source.criterionId.replace(/_/g, ' ')}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Owner</dt>
                            <dd className="mt-1 font-medium text-ink">{selected.source.ownerName}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Priority</dt>
                            <dd className="mt-1 font-medium capitalize text-ink">{selected.source.priority}</dd>
                          </div>
                        </dl>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Evidence</h3>
                        <p className="mt-2 text-sm text-ink-secondary">{selected.source.evidenceNote || selected.source.skippedReason || 'No evidence has been recorded yet.'}</p>
                      </section>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Link to={`/accounts/${selected.accountId}?tab=health`} className="tk-button-primary">
                          <ExternalLink className="h-4 w-4" />
                          Open Health tab
                        </Link>
                        <Link to="/tasks" className="tk-button-secondary">
                          <ClipboardCheck className="h-4 w-4" />
                          Open Tasks
                        </Link>
                      </div>
                    </>
                  ) : selected.kind === 'renewal_signal' ? (
                    <>
                      <section className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4">
                        <div className="flex items-start gap-3">
                          <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-rag-red" />
                          <div>
                            <h3 className="text-sm font-semibold text-ink">{selected.source.headline}</h3>
                            <p className="mt-2 text-sm text-ink-secondary">{selected.source.detail}</p>
                          </div>
                        </div>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Signal evidence</h3>
                        <div className="mt-3 space-y-2">
                          {selected.source.evidence.map(item => <p key={item} className="rounded-md bg-surface-tertiary p-2 text-sm text-ink-secondary">{item}</p>)}
                        </div>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Recommended playbook</h3>
                        <p className="mt-2 text-sm text-ink-secondary">{selected.source.recommendedPlaybook}</p>
                      </section>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Link to={`/accounts/${selected.accountId}?tab=engagements`} className="tk-button-primary">
                          <ExternalLink className="h-4 w-4" />
                          Open Engagements
                        </Link>
                        <Link to="/tasks" className="tk-button-secondary">
                          <ClipboardCheck className="h-4 w-4" />
                          Open Tasks
                        </Link>
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function governanceEventToCalendarItem(event: GovernanceEventRecord): UnifiedCalendarItem {
  return {
    id: event.id,
    kind: 'governance',
    accountId: event.accountId,
    accountName: event.accountName,
    ownerId: event.ownerId,
    date: event.date,
    title: event.type,
    detail: event.agenda,
    status: event.status,
    source: event,
  }
}

function GovernanceStatusBadge({ status }: { status: GovernanceEventStatus }) {
  const displayStatus = status === 'scheduled' || status === 'draft' ? 'upcoming' : status
  const className = {
    upcoming: 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue',
    overdue: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    completed: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    cancelled: 'border-surface-border bg-surface-secondary text-ink-secondary',
    review_required: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
  }[displayStatus]

  return <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', className)}>{displayStatus.replace('_', ' ')}</span>
}

function SourceCitationList({ citations }: { citations: GovernanceGeneratedOutputCitationRecord[] }) {
  if (!citations.length) return null

  return (
    <div className="space-y-2">
      {citations.map(citation => (
        <div key={citation.id} className="rounded-md border border-surface-border p-2 text-xs leading-5 text-ink-secondary">
          <p>
            <span className="font-semibold text-ink">{citation.sourceTitle}:</span> {citation.snippet}
          </p>
          {citation.sourceUrl ? <SourceLink href={citation.sourceUrl} /> : null}
        </div>
      ))}
    </div>
  )
}

function SourceLink({ href }: { href: string }) {
  const className = 'mt-1 inline-flex items-center gap-1 font-semibold text-brand-blue hover:text-brand-blue-dark'
  const content = (
    <>
      <ExternalLink className="h-3.5 w-3.5" />
      Open source
    </>
  )
  return href.startsWith('http') ? <a href={href} target="_blank" rel="noreferrer" className={className}>{content}</a> : <Link to={href} className={className}>{content}</Link>
}

function itemDotClass(item: UnifiedCalendarItem) {
  if (item.kind === 'governance' && item.status === 'cancelled') return 'bg-surface-border-strong'
  if (item.kind === 'governance' && new Date(item.date) < new Date() && item.status !== 'completed') return 'bg-rag-red'
  if (item.kind === 'score_activity' && new Date(item.date) < new Date() && item.status !== 'done') return 'bg-rag-red'
  if (item.kind === 'renewal_signal') return item.source.severity === 'critical' ? 'bg-rag-red' : 'bg-brand-orange'
  if (item.kind === 'score_activity') return 'bg-brand-orange'
  return tone[item.source.type]
}
