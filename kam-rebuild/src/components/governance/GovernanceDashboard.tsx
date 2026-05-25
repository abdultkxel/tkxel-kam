import { addMonths, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { ArrowLeft, ArrowRight, CalendarDays, Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddGovernanceEventDialog } from '@/components/governance/AddGovernanceEventDialog'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { cn } from '@/utils/cn'
import { buildUnifiedCalendarItems, UnifiedCalendarItem } from '@/utils/unifiedCalendar'

const dotClass = {
  QBR: 'bg-brand-blue',
  SteerCo: 'bg-brand-blue-dark',
  'Executive Review': 'bg-brand-orange',
} as const

export function GovernanceDashboard() {
  const [month, setMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [showGovernance, setShowGovernance] = useState(true)
  const [showScoreActivities, setShowScoreActivities] = useState(true)
  const [accountFilter, setAccountFilter] = useState('')
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const events = useGovernanceStore(state => state.events)
  const scoreTasks = useScoreActivityStore(state => state.tasks)
  const visibleItems = useMemo(() => {
    const items = buildUnifiedCalendarItems(events, scoreTasks)
    return items
      .filter(item => (item.kind === 'governance' ? showGovernance : showScoreActivities))
      .filter(item => !mineOnly || item.ownerId === user.id)
      .filter(item => !accountFilter || item.accountId === accountFilter)
  }, [accountFilter, events, mineOnly, scoreTasks, showGovernance, showScoreActivities, user.id])
  const monthItems = visibleItems.filter(item => isSameMonth(new Date(item.date), month))
  const upcoming = monthItems
    .filter(item => new Date(item.date) >= new Date())
    .filter(item => item.kind === 'governance' || item.status !== 'done')
    .slice(0, 3)
  const overdue = visibleItems
    .filter(item => new Date(item.date) < new Date())
    .filter(item => (item.kind === 'governance' ? item.status !== 'completed' : item.status !== 'done'))
    .slice(0, 3)
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const selectedItems = selectedDay ? monthItems.filter(item => isSameDay(new Date(item.date), selectedDay)) : []

  return (
    <section className="tk-card mt-6 p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Unified Calendar</p>
          <h2 className="text-base font-semibold text-ink">Governance and score activity cadence</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn('tk-button-secondary', showGovernance ? 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue' : '')}
            onClick={() => setShowGovernance(value => !value)}
            aria-pressed={showGovernance}
          >
            Governance
          </button>
          <button
            type="button"
            className={cn('tk-button-secondary', showScoreActivities ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : '')}
            onClick={() => setShowScoreActivities(value => !value)}
            aria-pressed={showScoreActivities}
          >
            Score activities
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-tertiary"
            onClick={() => setMineOnly(value => !value)}
            aria-pressed={mineOnly}
          >
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-sm border', mineOnly ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border bg-white')}>
              {mineOnly ? <Check className="h-3 w-3" /> : null}
            </span>
            My accounts only
          </button>
          <select className="tk-input w-auto min-w-[190px]" value={accountFilter} onChange={event => setAccountFilter(event.target.value)} aria-label="Calendar account filter">
            <option value="">All accounts</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <AddGovernanceEventDialog />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-surface-border p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Upcoming this month</h3>
          <div className="space-y-2">
            {upcoming.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-tertiary p-3 text-sm">
                <span><span className="font-semibold text-ink">{item.title}</span><span className="text-ink-secondary">, {item.accountName}</span></span>
                <span className="text-ink-secondary">{format(new Date(item.date), 'MMM d')}</span>
              </div>
            ))}
            {!upcoming.length ? <p className="rounded-md bg-surface-tertiary p-3 text-sm text-ink-secondary">No upcoming items match the calendar filters.</p> : null}
          </div>
        </div>
        <div className="rounded-lg border border-surface-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Overdue</h3>
            <Link to="/governance" className="inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-blue hover:text-brand-blue-dark">View all overdue</Link>
          </div>
          <div className="space-y-2">
            {overdue.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-rag-red/10 p-3 text-sm">
                <span><span className="font-semibold text-ink">{item.title}</span><span className="text-ink-secondary">, {item.accountName}</span></span>
                <span className="text-xs font-semibold text-rag-red">{differenceInCalendarDays(new Date(), new Date(item.date))} days overdue</span>
              </div>
            ))}
            {!overdue.length ? <p className="rounded-md bg-surface-tertiary p-3 text-sm text-ink-secondary">No overdue items match the calendar filters.</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-surface-border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button className="tk-icon-button" onClick={() => setMonth(value => subMonths(value, 1))} aria-label="Previous month">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarDays className="h-4 w-4 text-brand-blue" />
            {format(month, 'MMMM yyyy')}
          </div>
          <button className="tk-icon-button" onClick={() => setMonth(value => addMonths(value, 1))} aria-label="Next month">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-ink-secondary">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => <span key={day}>{day}</span>)}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map(day => {
            const dayItems = monthItems.filter(item => isSameDay(new Date(item.date), day))
            return (
              <button key={day.toISOString()} className="min-h-[54px] rounded-md border border-surface-border bg-white p-1 text-left hover:bg-surface-tertiary" onClick={() => setSelectedDay(day)}>
                <span className="text-xs font-semibold text-ink">{format(day, 'd')}</span>
                <span className="mt-2 flex gap-1">
                  {dayItems.slice(0, 3).map(item => (
                    <span key={item.id} className={cn('h-2 w-2 rounded-full', itemDotClass(item))} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        {selectedDay ? (
          <div className="mt-4 rounded-lg border border-surface-border bg-surface-tertiary p-3">
            <h3 className="text-sm font-semibold text-ink">{format(selectedDay, 'MMM d, yyyy')}</h3>
            <div className="mt-2 space-y-2">
              {selectedItems.length ? selectedItems.map(item => (
                <div key={item.id} className="rounded-md bg-white p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', itemDotClass(item))} />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{item.title}<span className="text-ink-secondary">, {item.accountName}</span></p>
                      <p className="text-xs text-ink-secondary">{item.kind === 'governance' ? '10:00' : 'Due'} | {item.detail}</p>
                      {item.kind === 'score_activity' ? (
                        <Link to={`/accounts/${item.accountId}?tab=health`} className="mt-2 inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-blue hover:text-brand-blue-dark">
                          Open Health tab
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              )) : <p className="text-sm text-ink-secondary">No calendar items scheduled.</p>}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function itemDotClass(item: UnifiedCalendarItem) {
  if (item.kind === 'governance' && new Date(item.date) < new Date() && item.status !== 'completed') return 'bg-rag-red'
  if (item.kind === 'score_activity' && new Date(item.date) < new Date() && item.status !== 'done') return 'bg-rag-red'
  if (item.kind === 'score_activity') return 'bg-brand-orange'
  return dotClass[item.source.type]
}
