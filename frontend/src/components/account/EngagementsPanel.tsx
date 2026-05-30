import { Archive, ArrowRight, ChevronLeft, ChevronRight, FileText, Loader2, Pencil, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Engagement360View } from '@/components/account/Engagement360View'
import { EngagementFormDialog } from '@/components/account/EngagementFormDialog'
import { KYCIntakeFlow } from '@/components/account/KYCIntakeFlow'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { ApiError } from '@/services/api'
import { archiveEngagementApi, listAccountEngagements } from '@/services/engagements'
import { useV3Store } from '@/stores/v3Store'
import { Account } from '@/types/account'
import { EngagementRecord } from '@/types/v3'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatCompactCurrency, formatDate, formatRelative } from '@/utils/formatters'

type SortKey = 'renewal_date' | 'end_date' | 'value' | 'delivery_status' | 'updated_date'
type RenewalWindow = 'all' | 'next_30' | 'next_60' | 'next_90' | 'expired'
type RiskFilter = 'all' | 'healthy' | 'warning' | 'critical'

const pageSize = 5

export function EngagementsPanel({ account }: { account: Account }) {
  const user = useRole()
  const { token } = useAuth()
  const engagements = useV3Store(state => state.engagements).filter(engagement => engagement.accountId === account.id)
  const archiveEngagement = useV3Store(state => state.archiveEngagement)
  const replaceAccountEngagements = useV3Store(state => state.replaceAccountEngagements)
  const [selectedId, setSelectedId] = useState(engagements[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [owner, setOwner] = useState('all')
  const [serviceLine, setServiceLine] = useState('all')
  const [renewalWindow, setRenewalWindow] = useState<RenewalWindow>('all')
  const [risk, setRisk] = useState<RiskFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('updated_date')
  const [page, setPage] = useState(1)
  const canManage = ['account_manager', 'kam_head', 'admin', 'super_admin'].includes(user.role)
  const canArchive = ['kam_head', 'admin', 'super_admin'].includes(user.role)

  const owners = useMemo(() => Array.from(new Set(engagements.map(engagement => engagement.ownerName))).sort(), [engagements])
  const serviceLines = useMemo(() => Array.from(new Set(engagements.flatMap(engagement => engagement.serviceLines))).sort(), [engagements])
  const filtered = useMemo(
    () =>
      engagements
        .filter(engagement => (status === 'all' ? true : engagement.status === status))
        .filter(engagement => (owner === 'all' ? true : engagement.ownerName === owner))
        .filter(engagement => (serviceLine === 'all' ? true : engagement.serviceLines.includes(serviceLine)))
        .filter(engagement => (risk === 'all' ? true : riskStatus(engagement) === risk))
        .filter(engagement => matchesRenewalWindow(engagement, renewalWindow))
        .filter(engagement => matchesSearch(engagement, search))
        .sort((a, b) => compareEngagements(a, b, sortKey)),
    [engagements, owner, renewalWindow, risk, search, serviceLine, sortKey, status],
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
  const selected = engagements.find(engagement => engagement.id === selectedId) ?? paged[0] ?? engagements[0]

  useEffect(() => {
    setPage(1)
  }, [owner, renewalWindow, risk, search, serviceLine, sortKey, status])

  useEffect(() => {
    if (!token) return

    let active = true
    setLoading(true)
    setApiError(null)
    listAccountEngagements(token, account.id, { page_size: 100, sort_by: 'updated_date', sort_dir: 'desc' })
      .then(response => {
        if (!active) return
        replaceAccountEngagements(account.id, response.items)
        setSelectedId(current => (current && response.items.some(engagement => engagement.id === current) ? current : response.items[0]?.id ?? ''))
      })
      .catch(error => {
        if (!active) return
        setApiError(error instanceof ApiError ? error.message : 'Unable to load engagement records')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [account.id, replaceAccountEngagements, token])

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  async function archive(selectedEngagement: EngagementRecord) {
    setArchivingId(selectedEngagement.id)
    let archived: EngagementRecord | undefined
    try {
      if (token) {
        await archiveEngagementApi(token, selectedEngagement.id)
        archived = { ...selectedEngagement, status: 'completed', updatedAt: new Date().toISOString() }
        replaceAccountEngagements(account.id, engagements.filter(engagement => engagement.id !== selectedEngagement.id))
        setSelectedId(current => (current === selectedEngagement.id ? '' : current))
      } else {
        archived = archiveEngagement(selectedEngagement.id)
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Unable to archive engagement')
      return
    } finally {
      setArchivingId(null)
    }
    if (!archived) return
    emitTimelineEvent({
      accountId: account.id,
      eventType: 'approval_event',
      module: 'approval',
      title: 'Engagement archived',
      description: `${archived.name} was archived and removed from active Account Health contribution.`,
      performedBy: user.id,
      performedByName: user.name,
      sourceRecordId: archived.id,
      sourceRecordType: 'engagement',
      sourceRecordRoute: `/engagements/${archived.id}`,
      metadata: { engagementId: archived.id },
      tags: ['engagement', 'archived'],
      isSensitive: false,
      isSystemGenerated: false,
      isImmutable: true,
    })
    toast.success('Engagement archived')
  }

  if (!engagements.length && loading) {
    return (
      <div className="space-y-5">
        <KYCIntakeFlow account={account} />
        <section className="tk-card p-6">
          <div className="flex items-center gap-3 text-sm font-semibold text-ink-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
            Loading engagement records
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[0, 1].map(item => <div key={item} className="h-24 animate-pulse rounded-lg bg-surface-secondary" />)}
          </div>
        </section>
      </div>
    )
  }

  if (!engagements.length) {
    return (
      <div className="space-y-5">
        <KYCIntakeFlow account={account} />
        {apiError ? <ApiState message={apiError} /> : null}
        <section className="tk-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement/SOW</p>
                <h3 className="mt-1 text-base font-semibold text-ink">No engagement records yet</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">Create from an approved SOW intake draft or add a manual engagement record for this account.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? <EngagementFormDialog account={account} /> : null}
              <Link className="tk-button-secondary shrink-0" to="/accounts/onboarding">
                Start intake
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <KYCIntakeFlow account={account} />
      {loading ? <ApiState message="Refreshing engagement records" loading /> : null}
      {apiError ? <ApiState message={apiError} /> : null}
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="tk-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement list</p>
                <p className="mt-1 text-sm leading-6 text-ink-secondary">Filter by status, owner, service line, renewal window, and risk posture.</p>
              </div>
              {canManage ? (
                <EngagementFormDialog
                  account={account}
                  trigger={<button className="tk-icon-button" aria-label="Create engagement"><Plus className="h-5 w-5" /></button>}
                  onSaved={engagement => setSelectedId(engagement.id)}
                />
              ) : null}
            </div>
            <div className="mt-4 grid gap-3">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
                <input className="tk-input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, SOW title, service line" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="tk-input" value={status} onChange={event => setStatus(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="renewal_watch">Renewal watch</option>
                  <option value="at_risk">At risk</option>
                  <option value="completed">Completed</option>
                </select>
                <select className="tk-input" value={owner} onChange={event => setOwner(event.target.value)}>
                  <option value="all">All owners</option>
                  {owners.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="tk-input" value={serviceLine} onChange={event => setServiceLine(event.target.value)}>
                  <option value="all">All service lines</option>
                  {serviceLines.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <select className="tk-input" value={renewalWindow} onChange={event => setRenewalWindow(event.target.value as RenewalWindow)}>
                  <option value="all">All renewals</option>
                  <option value="next_30">Next 30 days</option>
                  <option value="next_60">Next 60 days</option>
                  <option value="next_90">Next 90 days</option>
                  <option value="expired">Expired</option>
                </select>
                <select className="tk-input" value={risk} onChange={event => setRisk(event.target.value as RiskFilter)}>
                  <option value="all">All risks</option>
                  <option value="healthy">Healthy</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
                <select className="tk-input" value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)}>
                  <option value="updated_date">Updated date</option>
                  <option value="renewal_date">Renewal date</option>
                  <option value="end_date">End date</option>
                  <option value="value">Value</option>
                  <option value="delivery_status">Delivery status</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            {paged.length ? paged.map(engagement => (
              <button
                key={engagement.id}
                className={cn(
                  'w-full rounded-lg border bg-white p-4 text-left transition-colors',
                  selected?.id === engagement.id ? 'border-brand-blue bg-blue-tint-20' : 'border-surface-border hover:border-brand-blue/40 hover:bg-surface-tertiary',
                )}
                onClick={() => setSelectedId(engagement.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-ink">{engagement.name}</h3>
                    <p className="mt-1 truncate text-xs text-ink-secondary">{engagement.serviceLines.join(', ')}</p>
                  </div>
                  <StatusPill status={engagement.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <MiniStat label="Value" value={formatCompactCurrency(engagement.value)} />
                  <MiniStat label="Renewal" value={formatDate(engagement.renewalTerms.renewalDate)} />
                  <MiniStat label="Owner" value={engagement.ownerName} />
                  <MiniStat label="Updated" value={engagement.updatedAt ? formatRelative(engagement.updatedAt) : 'Just now'} />
                </div>
              </button>
            )) : (
              <p className="rounded-lg border border-dashed border-surface-border bg-white p-4 text-sm leading-6 text-ink-secondary">No engagements match the current filters.</p>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white p-3">
            <button className="tk-icon-button" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))} aria-label="Previous engagement page">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="text-xs font-semibold text-ink-secondary">Page {page} of {pageCount} | {filtered.length} records</p>
            <button className="tk-icon-button" disabled={page === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} aria-label="Next engagement page">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </aside>

        {selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Link className="tk-button-secondary" to={`/engagements/${selected.id}`}>
                Open detail
                <ArrowRight className="h-4 w-4" />
              </Link>
              {canManage ? (
                <EngagementFormDialog
                  account={account}
                  engagement={selected}
                  trigger={<button className="tk-button-secondary"><Pencil className="h-4 w-4" />Edit</button>}
                  onSaved={engagement => setSelectedId(engagement.id)}
                />
              ) : null}
              {canArchive ? (
                <button className="tk-button-secondary" disabled={archivingId === selected.id} onClick={() => archive(selected)}>
                  {archivingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                  {archivingId === selected.id ? 'Archiving' : 'Archive'}
                </button>
              ) : null}
            </div>
            <Engagement360View account={account} engagement={selected} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ApiState({ message, loading = false }: { message: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-white px-4 py-3 text-sm text-ink-secondary">
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : <FileText className="h-4 w-4 text-brand-orange" />}
      <span>{message}</span>
    </div>
  )
}

function matchesSearch(engagement: EngagementRecord, search: string) {
  if (!search.trim()) return true
  const term = search.toLowerCase()
  const docs = (engagement.sourceDocumentLinks ?? []).map(link => link.title).join(' ')
  return `${engagement.name} ${docs} ${engagement.serviceLines.join(' ')}`.toLowerCase().includes(term)
}

function matchesRenewalWindow(engagement: EngagementRecord, window: RenewalWindow) {
  if (window === 'all') return true
  const days = Math.ceil((new Date(engagement.renewalTerms.renewalDate).getTime() - Date.now()) / 86400000)
  if (window === 'expired') return days < 0
  return days >= 0 && days <= Number(window.replace('next_', ''))
}

function compareEngagements(a: EngagementRecord, b: EngagementRecord, sortKey: SortKey) {
  if (sortKey === 'value') return b.value - a.value
  if (sortKey === 'delivery_status') return String(a.deliveryStatus).localeCompare(String(b.deliveryStatus))
  const aDate = sortKey === 'renewal_date' ? a.renewalTerms.renewalDate : sortKey === 'end_date' ? a.renewalTerms.endDate : a.updatedAt ?? a.renewalTerms.startDate
  const bDate = sortKey === 'renewal_date' ? b.renewalTerms.renewalDate : sortKey === 'end_date' ? b.renewalTerms.endDate : b.updatedAt ?? b.renewalTerms.startDate
  return new Date(bDate).getTime() - new Date(aDate).getTime()
}

function riskStatus(engagement: EngagementRecord): RiskFilter {
  if (engagement.deliveryStatus === 'blocked' || engagement.deliveryStatus === 'at_risk' || engagement.renewalTerms.riskStatus === 'critical') return 'critical'
  if (engagement.deliveryStatus === 'watch' || engagement.renewalTerms.riskStatus === 'warning' || engagement.risks.length >= 2) return 'warning'
  return 'healthy'
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 rounded-md bg-white px-2 py-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      <span className="block truncate font-semibold text-ink">{value}</span>
    </span>
  )
}

function StatusPill({ status }: { status: EngagementRecord['status'] }) {
  const tone = status === 'at_risk'
    ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
    : status === 'renewal_watch'
      ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
      : status === 'completed'
        ? 'border-surface-border bg-surface-tertiary text-ink-secondary'
        : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  return <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{status.replace('_', ' ')}</span>
}
