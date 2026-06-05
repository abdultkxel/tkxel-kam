import { AlertTriangle, Archive, Crown, Network, Pencil, Plus, RefreshCcw, Search, Sparkles, UserRound, UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { StakeholderDetailPanel } from '@/components/account/StakeholderDetailPanel'
import { StakeholderFormDrawer } from '@/components/account/StakeholderFormDrawer'
import { StakeholderOrgChart } from '@/components/account/StakeholderOrgChart'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableTable } from '@/components/ui/SortableTable'
import type { Column } from '@/components/ui/SortableTable'
import { useRole } from '@/hooks/useRole'
import {
  useArchiveStakeholder,
  useRecalculateStakeholderCoverageGaps,
  useStakeholderCoverageGaps,
  useStakeholders,
} from '@/hooks/useStakeholders'
import type { Account } from '@/types/account'
import type {
  Stakeholder,
  StakeholderFilters,
  StakeholderRole,
  StakeholderSentiment,
  StakeholderStatus,
} from '@/types/stakeholder'
import { cn } from '@/utils/cn'

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple'

const stakeholderRoles: StakeholderRole[] = ['executive_sponsor', 'economic_buyer', 'technical_decision_maker', 'operational_poc', 'commercial_owner', 'influencer']
const statusOptions: StakeholderStatus[] = ['active', 'inactive', 'left_company', 'do_not_contact']
const sentimentOptions: StakeholderSentiment[] = ['negative', 'neutral', 'positive', 'champion']
const relationshipScore: Record<string, number> = { unknown: 0, weak: 1, developing: 2, strong: 3, champion: 4 }
const relationshipLabels = ['Unknown', 'Weak', 'Developing', 'Strong', 'Champion']

export function StakeholderTab({ account }: { account: Account }) {
  const user = useRole()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingStakeholder, setEditingStakeholder] = useState<Stakeholder | null>(null)
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Stakeholder | null>(null)
  const canManage = canManageStakeholders(user.role)

  const filters = useMemo<StakeholderFilters>(
    () => ({
      page: 1,
      page_size: 100,
      search: search.trim() || undefined,
      role: role || undefined,
      status: status || undefined,
      sentiment: sentiment || undefined,
    }),
    [role, search, sentiment, status],
  )

  const hasFilters = Boolean(search.trim() || role || status || sentiment)
  const summaryQuery = useStakeholders(account.id, { page: 1, page_size: 100 })
  const listQuery = useStakeholders(account.id, filters)
  const coverageQuery = useStakeholderCoverageGaps(account.id)
  const { recalculateStakeholderCoverageGaps, isLoading: recalculating } = useRecalculateStakeholderCoverageGaps(account.id)
  const { archiveStakeholder, isLoading: archiving } = useArchiveStakeholder()

  const summaryStakeholders = summaryQuery.stakeholders
  const stakeholders = listQuery.stakeholders
  const coverageGaps = coverageQuery.coverageGaps
  const openCoverageGaps = coverageGaps.filter(gap => gap.status !== 'resolved')
  const summaryLoading = summaryQuery.isLoading && !summaryQuery.data
  const coverageLoading = coverageQuery.isLoading && !coverageQuery.data

  const activeStakeholders = summaryStakeholders.filter(stakeholder => stakeholder.status === 'active')
  const averageRelationship = averageRelationshipStrength(activeStakeholders)
  const executiveSponsors = activeStakeholders.filter(stakeholder => stakeholder.role === 'executive_sponsor').length
  const selectedStakeholder = selectedStakeholderId
    ? summaryStakeholders.find(stakeholder => stakeholder.id === selectedStakeholderId) ?? stakeholders.find(stakeholder => stakeholder.id === selectedStakeholderId) ?? null
    : null

  const openCreate = useCallback(() => {
    if (!canManage) return
    setEditingStakeholder(null)
    setDrawerOpen(true)
  }, [canManage])

  const openEdit = useCallback((stakeholder: Stakeholder) => {
    if (!canManage) return
    setSelectedStakeholderId(null)
    setEditingStakeholder(stakeholder)
    setDrawerOpen(true)
  }, [canManage])

  const columns = useMemo<Column<Stakeholder>[]>(
    () => [
      {
        key: 'name',
        header: 'Stakeholder',
        sortable: true,
        render: stakeholder => (
          <div className="min-w-[240px]">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{stakeholder.name}</p>
              {stakeholder.isSensitive ? <Badge tone="amber">Sensitive</Badge> : null}
              {stakeholder.sensitiveFieldsRedacted ? <Badge tone="gray">Redacted</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-ink-secondary">{stakeholder.title || stakeholder.company || 'No title recorded'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={roleTone(stakeholder.role)}>{titleize(stakeholder.role)}</Badge>
              <Badge tone={statusTone(stakeholder.status)}>{titleize(stakeholder.status)}</Badge>
            </div>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        sortable: true,
        render: stakeholder => <span className="block min-w-[150px] font-medium text-ink">{titleize(stakeholder.role)}</span>,
      },
      {
        key: 'influence',
        header: 'Influence',
        sortable: true,
        render: stakeholder => <Badge tone={influenceTone(stakeholder.influence)}>{titleize(stakeholder.influence)}</Badge>,
      },
      {
        key: 'relationshipStrength',
        header: 'Relationship',
        sortable: true,
        render: stakeholder => <Badge tone={relationshipTone(stakeholder.relationshipStrength)}>{titleize(stakeholder.relationshipStrength)}</Badge>,
      },
      {
        key: 'sentiment',
        header: 'Sentiment',
        sortable: true,
        render: stakeholder => <Badge tone={sentimentTone(stakeholder.sentiment)}>{titleize(stakeholder.sentiment)}</Badge>,
      },
      {
        key: 'lastInteractionAt',
        header: 'Last Touch',
        sortable: true,
        render: stakeholder => (
          <span className="block min-w-[120px] text-ink-secondary">{stakeholder.lastInteractionAt ? formatDate(stakeholder.lastInteractionAt) : 'No activity'}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: stakeholder => (
          <span className="inline-flex min-w-[96px] justify-end gap-1">
            {canManage ? (
              <>
                <button
                  type="button"
                  className="tk-icon-button"
                  aria-label={`Edit ${stakeholder.name}`}
                  onClick={event => {
                    event.stopPropagation()
                    openEdit(stakeholder)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="tk-icon-button text-rag-red hover:bg-rag-red/10"
                  aria-label={`Archive ${stakeholder.name}`}
                  onClick={event => {
                    event.stopPropagation()
                    setArchiveTarget(stakeholder)
                  }}
                >
                  <Archive className="h-4 w-4" />
                </button>
              </>
            ) : null}
          </span>
        ),
      },
    ],
    [canManage, openEdit],
  )

  function clearFilters() {
    setSearch('')
    setRole('')
    setStatus('')
    setSentiment('')
  }

  async function refreshData() {
    await Promise.allSettled([summaryQuery.refetch(), listQuery.refetch(), coverageQuery.refetch()])
  }

  async function recalculateGaps() {
    try {
      await recalculateStakeholderCoverageGaps()
      toast.success('Stakeholder coverage gaps recalculated')
      await coverageQuery.refetch().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Coverage gaps could not be recalculated')
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    try {
      await archiveStakeholder(archiveTarget.id, archiveTarget.accountId, archiveTarget.engagementId ?? undefined)
      toast.success('Stakeholder archived')
      if (selectedStakeholderId === archiveTarget.id) setSelectedStakeholderId(null)
      setArchiveTarget(null)
      await refreshData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Stakeholder could not be archived')
    }
  }

  return (
    <div className="space-y-5">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Stakeholder map</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Stakeholders and relationships</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">Track decision ownership, influence, relationship health, sentiment, and coverage gaps for this account.</p>
            </div>
            <button className="tk-button-primary shrink-0" onClick={openCreate} disabled={!canManage}>
              <Plus className="h-4 w-4" />
              Add Stakeholder
            </button>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
          <SummaryMetric icon={UsersRound} label="Active" value={summaryLoading ? '...' : activeStakeholders.length} />
          <SummaryMetric icon={Crown} label="Executive Sponsors" value={summaryLoading ? '...' : executiveSponsors} />
          <SummaryMetric icon={Sparkles} label="Avg Relationship" value={summaryLoading ? '...' : averageRelationship.label} detail={summaryLoading ? undefined : averageRelationship.detail} />
          <SummaryMetric icon={AlertTriangle} label="Coverage Gaps" value={coverageLoading ? '...' : openCoverageGaps.length} tone={openCoverageGaps.length ? 'orange' : 'blue'} />
        </div>
      </section>

      <FilterBar onClear={clearFilters} contentClassName="md:grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(150px,1fr))_auto]">
        <label className="space-y-1">
          <span className="tk-label">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input className="tk-input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, title, company" />
          </div>
        </label>
        <FilterSelect label="Role" value={role} onChange={setRole} options={stakeholderRoles.map(value => ({ value, label: titleize(value) }))} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={statusOptions.map(value => ({ value, label: titleize(value) }))} />
        <FilterSelect label="Sentiment" value={sentiment} onChange={setSentiment} options={sentimentOptions.map(value => ({ value, label: titleize(value) }))} />
      </FilterBar>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {listQuery.isLoading && !listQuery.data ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : listQuery.error ? (
            <EmptyState icon={AlertTriangle} heading="Stakeholders could not be loaded" body={listQuery.error.message} action={{ label: 'Retry', onClick: () => void listQuery.refetch() }} />
          ) : stakeholders.length === 0 && !hasFilters && summaryStakeholders.length === 0 ? (
            <EmptyState icon={UserRound} heading="No stakeholders yet" body="Add the first client stakeholder for this account." action={canManage ? { label: 'Add Stakeholder', onClick: openCreate } : undefined} />
          ) : stakeholders.length === 0 ? (
            <EmptyState icon={UserRound} heading="No stakeholders match these filters" body="Clear filters or search for a different stakeholder." action={{ label: 'Clear filters', onClick: clearFilters }} />
          ) : (
            <SortableTable
              items={stakeholders}
              columns={columns}
              defaultSort={{ column: 'name', direction: 'asc' }}
              onRowClick={stakeholder => setSelectedStakeholderId(stakeholder.id)}
            />
          )}
        </div>

        <CoverageGapPanel
          gaps={openCoverageGaps}
          isLoading={coverageLoading}
          error={coverageQuery.error}
          recalculating={recalculating}
          onRetry={() => void coverageQuery.refetch()}
          onRecalculate={() => void recalculateGaps()}
        />
        <div className="xl:col-span-2">
          <StakeholderOrgChart accountId={account.id} onSelectStakeholder={setSelectedStakeholderId} />
        </div>
      </div>

      <StakeholderFormDrawer
        account={account}
        stakeholder={editingStakeholder}
        stakeholders={summaryStakeholders}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSaved={refreshData}
      />
      <StakeholderDetailPanel
        account={account}
        stakeholder={selectedStakeholder}
        open={Boolean(selectedStakeholderId)}
        canManage={canManage}
        onOpenChange={value => {
          if (!value) setSelectedStakeholderId(null)
        }}
        onEdit={openEdit}
        onChanged={refreshData}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive stakeholder?"
        description={`Archive ${archiveTarget?.name ?? 'this stakeholder'}? The stakeholder will be removed from active relationship views while history remains available.`}
        confirmLabel="Archive"
        busyLabel="Archiving"
        isBusy={archiving}
        onOpenChange={value => {
          if (!archiving && !value) setArchiveTarget(null)
        }}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  )
}

function CoverageGapPanel({
  gaps,
  isLoading,
  error,
  recalculating,
  onRetry,
  onRecalculate,
}: {
  gaps: ReturnType<typeof useStakeholderCoverageGaps>['coverageGaps']
  isLoading: boolean
  error: Error | null
  recalculating: boolean
  onRetry: () => void
  onRecalculate: () => void
}) {
  return (
    <aside className="tk-card h-fit overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-surface-border bg-surface-secondary p-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Coverage</p>
          <h3 className="mt-1 text-base font-semibold text-ink">Coverage gaps</h3>
        </div>
        <button className="tk-icon-button shrink-0" onClick={onRecalculate} disabled={recalculating} aria-label="Recalculate stakeholder coverage gaps">
          <RefreshCcw className={cn('h-4 w-4', recalculating && 'animate-spin')} />
        </button>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} heading="Coverage gaps could not be loaded" body={error.message} action={{ label: 'Retry', onClick: onRetry }} className="rounded-lg border border-surface-border bg-surface-secondary" />
        ) : gaps.length === 0 ? (
          <EmptyState icon={Network} heading="No open coverage gaps" body="Stakeholder coverage rules are currently satisfied." className="rounded-lg border border-surface-border bg-surface-secondary" />
        ) : (
          <div className="space-y-3">
            {gaps.map(gap => (
              <article key={gap.id} className="rounded-lg border border-surface-border bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-sm font-semibold text-ink">{gap.title}</h4>
                  <Badge tone={gap.severity === 'critical' || gap.severity === 'high' ? 'red' : gap.severity === 'medium' ? 'amber' : 'blue'}>{titleize(gap.severity)}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-secondary">{gap.description}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <select className="tk-input" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'blue',
}: {
  icon: typeof UsersRound
  label: string
  value: string | number
  detail?: string
  tone?: 'blue' | 'orange'
}) {
  return (
    <div className="flex min-h-[104px] items-center gap-3 bg-white p-4">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tone === 'orange' ? 'bg-brand-orange/10 text-brand-orange' : 'bg-blue-tint-20 text-brand-blue')}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
        {detail ? <p className="mt-1 text-xs text-ink-secondary">{detail}</p> : null}
      </div>
    </div>
  )
}

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  const toneClass: Record<BadgeTone, string> = {
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    amber: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    blue: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
    gray: 'border-surface-border bg-surface-tertiary text-ink-secondary',
    purple: 'border-purple-500/20 bg-purple-50 text-purple-700',
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', toneClass[tone])}>{children}</span>
}

function averageRelationshipStrength(stakeholders: Stakeholder[]) {
  if (!stakeholders.length) return { label: 'Unknown', detail: 'No active data' }
  const average = stakeholders.reduce((sum, stakeholder) => sum + (relationshipScore[stakeholder.relationshipStrength] ?? 0), 0) / stakeholders.length
  const rounded = Math.round(average)
  return { label: relationshipLabels[rounded] ?? 'Unknown', detail: `${average.toFixed(1)} / 4` }
}

function canManageStakeholders(role: string) {
  return ['admin', 'super_admin', 'kam_head', 'account_manager', 'am', 'kam'].includes(role)
}

function roleTone(role: string): BadgeTone {
  if (role === 'executive_sponsor') return 'purple'
  if (role === 'economic_buyer' || role === 'commercial_owner') return 'blue'
  if (role === 'technical_decision_maker') return 'green'
  return 'gray'
}

function statusTone(status: string): BadgeTone {
  if (status === 'active') return 'green'
  if (status === 'do_not_contact') return 'red'
  if (status === 'left_company') return 'gray'
  return 'amber'
}

function influenceTone(influence: string): BadgeTone {
  if (influence === 'critical') return 'red'
  if (influence === 'high') return 'amber'
  if (influence === 'medium') return 'blue'
  return 'gray'
}

function relationshipTone(relationship: string): BadgeTone {
  if (relationship === 'champion' || relationship === 'strong') return 'green'
  if (relationship === 'developing') return 'blue'
  if (relationship === 'weak') return 'amber'
  return 'gray'
}

function sentimentTone(sentiment: string): BadgeTone {
  if (sentiment === 'champion' || sentiment === 'positive') return 'green'
  if (sentiment === 'negative') return 'red'
  return 'gray'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
