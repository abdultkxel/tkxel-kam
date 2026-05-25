import * as Dialog from '@radix-ui/react-dialog'
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, startOfMonth, subMonths } from 'date-fns'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ClipboardCheck, Download, ExternalLink, Loader2, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddGovernanceEventDialog } from '@/components/governance/AddGovernanceEventDialog'
import { useRole } from '@/hooks/useRole'
import { generateAISummary } from '@/services/aiSummary'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useV3Store } from '@/stores/v3Store'
import { AISummary } from '@/types/aiSummary'
import { GovernanceEventRecord } from '@/types/governance'
import { canViewTimelineEntry } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { buildUnifiedCalendarItems, UnifiedCalendarItem } from '@/utils/unifiedCalendar'

const tone = {
  QBR: 'bg-brand-blue',
  SteerCo: 'bg-brand-blue-dark',
  'Executive Review': 'bg-brand-orange',
} as const

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
  const [brief, setBrief] = useState<AISummary | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const events = useGovernanceStore(state => state.events)
  const scoreTasks = useScoreActivityStore(state => state.tasks)
  const signals = useV3Store(state => state.signals)
  const opportunities = useOpportunityStore(state => state.opportunities)
  const timelineEntries = useTimelineStore(state => state.entries)
  const visibleItems = useMemo(() => {
    const items = buildUnifiedCalendarItems(events, scoreTasks, signals)
    return items
      .filter(item => item.kind === 'governance' ? showGovernance : item.kind === 'score_activity' ? showScoreActivities : showRenewalItems)
      .filter(item => !mineOnly || item.ownerId === user.id)
      .filter(item => !accountFilter || item.accountId === accountFilter)
  }, [accountFilter, events, mineOnly, scoreTasks, showGovernance, showRenewalItems, showScoreActivities, signals, user.id])
  const monthItems = visibleItems.filter(item => new Date(item.date).getMonth() === month.getMonth() && new Date(item.date).getFullYear() === month.getFullYear())
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })

  async function buildBrief(event: GovernanceEventRecord) {
    const account = accounts.find(item => item.id === event.accountId)
    if (!account) return
    setBriefLoading(true)
    await new Promise(resolve => window.setTimeout(resolve, 360))
    const visibleEntries = timelineEntries.filter(entry => entry.accountId === event.accountId).filter(entry => canViewTimelineEntry(entry, user.role, user.id))
    setBrief(generateAISummary({ account, entries: visibleEntries, opportunities, governance: events, type: 'pre_meeting_brief' }))
    setBriefLoading(false)
  }

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
            <AddGovernanceEventDialog triggerClassName="tk-button-primary" />
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

        <div className="grid grid-cols-7 rounded-lg border border-surface-border bg-white">
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
                      className="flex w-full items-center gap-2 rounded-md bg-surface-tertiary px-2 py-1 text-left text-xs hover:bg-blue-tint-20"
                      onClick={() => {
                        setSelected(item)
                        setBrief(null)
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
      </section>

      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={open => {
          if (!open) {
            setSelected(null)
            setBrief(null)
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
                      {selected.kind === 'governance' ? selected.source.type : selected.kind === 'score_activity' ? 'Score activity' : 'Renewal signal'}
                    </p>
                    <Dialog.Title className="font-display text-2xl font-bold text-ink">{selected.accountName}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-secondary">{format(new Date(selected.date), 'MMM d, yyyy')} | {selected.status.replace('_', ' ')}</Dialog.Description>
                  </div>
                  <Dialog.Close className="tk-icon-button" aria-label="Close event detail">
                    <X className="h-5 w-5" />
                  </Dialog.Close>
                </div>
                <div className="space-y-4">
                  {selected.kind === 'governance' ? (
                    <>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Agenda</h3>
                        <p className="mt-2 text-sm text-ink-secondary">{selected.source.agenda}</p>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Attendees</h3>
                        <p className="mt-2 text-sm text-ink-secondary">{selected.source.attendees.join(', ') || 'No attendees recorded.'}</p>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <h3 className="text-sm font-semibold text-ink">Action items</h3>
                        <ul className="mt-2 space-y-2 text-sm text-ink-secondary">
                          {selected.source.actionItems.map(item => <li key={item}>{item}</li>)}
                        </ul>
                      </section>
                      <section className="rounded-lg border border-surface-border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI Brief</p>
                            <h3 className="text-sm font-semibold text-ink">Pre-meeting context</h3>
                          </div>
                          <button className="tk-button-secondary" disabled={briefLoading} onClick={() => buildBrief(selected.source)}>
                            {briefLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Generate
                          </button>
                        </div>
                        {brief ? (
                          <div className="mt-3 space-y-3">
                            {brief.sections.map(section => (
                              <div key={section.title} className="rounded-lg bg-surface-tertiary p-3">
                                <p className="text-xs font-semibold text-ink">{section.title}</p>
                                <p className="mt-1 text-xs leading-5 text-ink-secondary">{section.body}</p>
                              </div>
                            ))}
                            <p className="text-xs font-medium text-ink-secondary">{brief.disclaimer}</p>
                          </div>
                        ) : null}
                      </section>
                      <Link to={`/accounts/${selected.accountId}`} className="tk-button-primary w-full">
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
                  ) : (
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
                  )}
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function itemDotClass(item: UnifiedCalendarItem) {
  if (item.kind === 'governance' && new Date(item.date) < new Date() && item.status !== 'completed') return 'bg-rag-red'
  if (item.kind === 'score_activity' && new Date(item.date) < new Date() && item.status !== 'done') return 'bg-rag-red'
  if (item.kind === 'renewal_signal') return item.source.severity === 'critical' ? 'bg-rag-red' : 'bg-brand-orange'
  if (item.kind === 'score_activity') return 'bg-brand-orange'
  return tone[item.source.type]
}
