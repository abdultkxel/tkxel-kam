import * as Dialog from '@radix-ui/react-dialog'
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, LayoutGrid, List, Loader2, Plus, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard'
import { RuntimeCustomFieldValues, RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { FieldError } from '@/components/form/FieldError'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useAccountOptions } from '@/hooks/useAccountOptions'
import { Account } from '@/types/account'
import { listEngagements } from '@/services/accountWorkspace'
import { ApiError } from '@/services/api'
import { RuntimeCustomField, listRuntimeCustomFields } from '@/services/contentGovernance'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { Opportunity, OpportunityActionItem, OpportunityCreateInput, OpportunityTypeRecord, Stage } from '@/types/opportunity'
import { EngagementRecord } from '@/types/v3'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, FieldErrors } from '@/utils/formErrors'
import { formatCompactCurrency, formatCurrency, formatDate } from '@/utils/formatters'

const STAGES: Stage[] = ['Identified', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']
const SOURCE_CONTEXTS = ['manual', 'engagement', 'governance', 'signal', 'account_plan', 'timeline'] as const
const LIST_PAGE_SIZE = 25
const BOARD_PAGE_SIZE = 500

const opportunityFieldAliases = {
  account_id: 'accountId',
  engagement_id: 'engagementId',
  type_id: 'typeId',
  owner_id: 'ownerId',
  service_line: 'serviceLine',
  next_step: 'nextStep',
  target_date: 'targetDate',
  source_context: 'sourceContext',
  outcome_reason: 'outcomeReason',
  due_date: 'actionDueDate',
  'action_items.0.due_date': 'actionDueDate',
  'action_items.0.title': 'actionTitle',
} as const

export interface OwnerOption {
  id: string
  name: string
  email?: string | null
}

function PipelineStat({ label, value, tone = 'default', format }: { label: string; value: number; tone?: 'default' | 'warning' | 'success'; format?: (value: number) => string }) {
  const valueClass = tone === 'warning' ? 'text-brand-orange' : tone === 'success' ? 'text-rag-green' : 'text-ink'

  return (
    <div className="rounded-lg bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <AnimatedNumber value={value} format={format} className={`mt-1 block text-2xl font-bold ${valueClass}`} />
    </div>
  )
}

export function Opportunities() {
  const [params, setParams] = useSearchParams()
  const { token, user } = useAuth()
  const { accounts } = useAccountOptions()
  const opportunities = useOpportunityStore(state => state.opportunities)
  const types = useOpportunityStore(state => state.types)
  const stages = useOpportunityStore(state => state.stages)
  const totals = useOpportunityStore(state => state.totals)
  const total = useOpportunityStore(state => state.total)
  const page = useOpportunityStore(state => state.page)
  const pages = useOpportunityStore(state => state.pages)
  const loading = useOpportunityStore(state => state.loading)
  const error = useOpportunityStore(state => state.error)
  const loadOpportunities = useOpportunityStore(state => state.loadOpportunities)
  const loadReferenceData = useOpportunityStore(state => state.loadReferenceData)

  const search = params.get('search') ?? ''
  const accountId = params.get('accountId') ?? ''
  const ownerId = params.get('ownerId') ?? ''
  const typeId = params.get('typeId') ?? ''
  const stage = params.get('stage') ?? ''
  const serviceLine = params.get('serviceLine') ?? ''
  const sourceContext = params.get('sourceContext') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const minValue = params.get('minValue') ?? ''
  const maxValue = params.get('maxValue') ?? ''
  const [advancedOpen, setAdvancedOpen] = useState(() => Boolean(accountId || ownerId || typeId || serviceLine || sourceContext || from || to || minValue || maxValue))
  const openOnly = params.get('openOnly') === 'true' || params.get('open_only') === 'true'
  const stalled = params.get('stalled') === 'true'
  const stalledAfterDays = Math.max(1, Number(params.get('stalledAfterDays') ?? params.get('stalled_after_days') ?? '90') || 90)
  const view = (params.get('view') === 'list' ? 'list' : 'board') as 'board' | 'list'
  const requestedPage = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const includeArchived = params.get('archived') === 'true'
  const selectedOpportunityId = params.get('opportunity') ?? ''
  const selectedOpportunity = opportunities.find(item => item.id === selectedOpportunityId) ?? null

  const ownerOptions = useMemo(() => buildOwnerOptions(accounts, user ? { id: user.id, name: user.name, email: user.email } : undefined), [accounts, user])
  const stageOptions = useMemo(() => stages.length ? stages.map(item => item.name) : STAGES, [stages])

  useEffect(() => {
    if (!token) return
    void loadReferenceData(token)
  }, [loadReferenceData, token])

  useEffect(() => {
    if (!token) return
    void loadOpportunities(token, {
      accountId,
      ownerId,
      typeId,
      stage,
      serviceLine,
      sourceContext,
      search,
      targetFrom: dateStart(from),
      targetTo: dateEnd(to),
      minValue,
      maxValue,
      includeArchived,
      openOnly,
      stalled,
      stalledAfterDays,
      page: view === 'list' ? requestedPage : 1,
      pageSize: view === 'list' ? LIST_PAGE_SIZE : BOARD_PAGE_SIZE,
      sort: 'target_date',
      direction: 'asc',
    })
  }, [accountId, from, includeArchived, loadOpportunities, maxValue, minValue, openOnly, ownerId, requestedPage, search, serviceLine, sourceContext, stage, stalled, stalledAfterDays, to, token, typeId, view])

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'opportunity') next.delete('opportunity')
    if (key !== 'page' && key !== 'opportunity') next.delete('page')
    setParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams()
    if (view === 'list') next.set('view', 'list')
    setParams(next, { replace: true })
  }

  function openDetail(opportunity: Opportunity) {
    const next = new URLSearchParams(params)
    next.set('opportunity', opportunity.id)
    setParams(next, { replace: true })
  }

  function closeDetail() {
    const next = new URLSearchParams(params)
    next.delete('opportunity')
    setParams(next, { replace: true })
  }

  function switchView(nextView: 'board' | 'list') {
    setFilter('view', nextView === 'list' ? 'list' : '')
  }

  const selectedAccount = accounts.find(account => account.id === accountId)
  const selectedOwner = ownerOptions.find(owner => owner.id === ownerId)
  const selectedType = types.find(type => type.id === typeId)
  const activeFilterChips = [
    search ? { key: 'search', label: `Search: ${search}`, onRemove: () => setFilter('search', '') } : null,
    stage ? { key: 'stage', label: `Stage: ${stage}`, onRemove: () => setFilter('stage', '') } : null,
    accountId ? { key: 'account', label: `Account: ${selectedAccount?.name ?? accountId}`, onRemove: () => setFilter('accountId', '') } : null,
    ownerId ? { key: 'owner', label: `Owner: ${selectedOwner?.name ?? ownerId}`, onRemove: () => setFilter('ownerId', '') } : null,
    typeId ? { key: 'type', label: `Type: ${selectedType?.name ?? typeId}`, onRemove: () => setFilter('typeId', '') } : null,
    serviceLine ? { key: 'serviceLine', label: `Service: ${serviceLine}`, onRemove: () => setFilter('serviceLine', '') } : null,
    sourceContext ? { key: 'sourceContext', label: `Source: ${sourceLabel(sourceContext)}`, onRemove: () => setFilter('sourceContext', '') } : null,
    from ? { key: 'from', label: `From: ${from}`, onRemove: () => setFilter('from', '') } : null,
    to ? { key: 'to', label: `To: ${to}`, onRemove: () => setFilter('to', '') } : null,
    minValue ? { key: 'minValue', label: `Min: ${formatFilterCurrency(minValue)}`, onRemove: () => setFilter('minValue', '') } : null,
    maxValue ? { key: 'maxValue', label: `Max: ${formatFilterCurrency(maxValue)}`, onRemove: () => setFilter('maxValue', '') } : null,
    openOnly ? { key: 'openOnly', label: 'Open only', onRemove: () => setFilter('openOnly', '') } : null,
    stalled ? { key: 'stalled', label: 'Stalled', onRemove: () => setFilter('stalled', '') } : null,
    includeArchived ? { key: 'archived', label: 'Archived', onRemove: () => setFilter('archived', '') } : null,
  ].filter((chip): chip is { key: string; label: string; onRemove: () => void } => Boolean(chip))

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline execution"
        title="Opportunities"
        description="Prioritize open pipeline, review close risk, and move deals through the KAM stage flow."
        actions={<AddOpportunityDialog accounts={accounts} types={types} ownerOptions={ownerOptions} onCreated={openDetail} />}
      />

      <section className="tk-card mb-4 overflow-hidden">
        <div className="border-b border-surface-border p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search opportunities</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input className="tk-input pl-10" value={search} onChange={event => setFilter('search', event.target.value)} placeholder="Search account, opportunity, or next step" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-surface-border bg-surface-secondary p-1">
                <button type="button" className={cn('inline-flex min-h-[38px] items-center gap-2 rounded px-3 text-sm font-semibold transition-colors', view === 'board' ? 'bg-white text-brand-blue shadow-sm' : 'text-ink-secondary hover:text-ink')} onClick={() => switchView('board')} aria-pressed={view === 'board'}>
                  <LayoutGrid className="h-4 w-4" />
                  Board
                </button>
                <button type="button" className={cn('inline-flex min-h-[38px] items-center gap-2 rounded px-3 text-sm font-semibold transition-colors', view === 'list' ? 'bg-white text-brand-blue shadow-sm' : 'text-ink-secondary hover:text-ink')} onClick={() => switchView('list')} aria-pressed={view === 'list'}>
                  <List className="h-4 w-4" />
                  List
                </button>
              </div>
              <button type="button" className={cn('tk-button-secondary', advancedOpen && 'border-brand-blue text-brand-blue')} onClick={() => setAdvancedOpen(value => !value)} aria-expanded={advancedOpen}>
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterChips.length ? <span className="rounded-full bg-brand-blue px-2 py-0.5 text-[11px] font-bold text-white">{activeFilterChips.length}</span> : null}
                <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
              </button>
              <button type="button" className="tk-button-secondary" onClick={clearFilters} disabled={!activeFilterChips.length}>
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Stage</span>
            <StageFilterButton label="All" active={!stage} onClick={() => setFilter('stage', '')} />
            {stageOptions.map(item => <StageFilterButton key={item} label={item} active={stage === item} onClick={() => setFilter('stage', item)} />)}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <FilterToggleButton active={openOnly} label="Open only" onClick={() => setFilter('openOnly', openOnly ? '' : 'true')} />
            <FilterToggleButton active={stalled} label="Stalled" onClick={() => setFilter('stalled', stalled ? '' : 'true')} />
            <FilterToggleButton active={includeArchived} label="Archived" onClick={() => setFilter('archived', includeArchived ? '' : 'true')} />
          </div>
        </div>

        {advancedOpen ? (
          <div className="grid gap-3 border-b border-surface-border bg-surface-secondary/70 p-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="Account">
              <select className="tk-input" value={accountId} onChange={event => setFilter('accountId', event.target.value)}>
                <option value="">All accounts</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Owner">
              <select className="tk-input" value={ownerId} onChange={event => setFilter('ownerId', event.target.value)}>
                <option value="">All owners</option>
                {ownerOptions.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Type">
              <select className="tk-input" value={typeId} onChange={event => setFilter('typeId', event.target.value)}>
                <option value="">All types</option>
                {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="Source">
              <select className="tk-input" value={sourceContext} onChange={event => setFilter('sourceContext', event.target.value)}>
                <option value="">All sources</option>
                {SOURCE_CONTEXTS.map(item => <option key={item} value={item}>{sourceLabel(item)}</option>)}
              </select>
            </FilterField>
            <FilterField label="Service line">
              <input className="tk-input" value={serviceLine} onChange={event => setFilter('serviceLine', event.target.value)} placeholder="Data Analytics" />
            </FilterField>
            <FilterField label="Target from">
              <input type="date" className="tk-input" value={from} onChange={event => setFilter('from', event.target.value)} />
            </FilterField>
            <FilterField label="Target to">
              <input type="date" className="tk-input" value={to} onChange={event => setFilter('to', event.target.value)} />
            </FilterField>
            <div className="grid grid-cols-2 gap-3">
              <FilterField label="Min value">
                <input type="number" min={0} className="tk-input" value={minValue} onChange={event => setFilter('minValue', event.target.value)} placeholder="$0" />
              </FilterField>
              <FilterField label="Max value">
                <input type="number" min={0} className="tk-input" value={maxValue} onChange={event => setFilter('maxValue', event.target.value)} placeholder="$1M" />
              </FilterField>
            </div>
          </div>
        ) : null}

        {activeFilterChips.length ? (
          <div className="flex flex-wrap items-center gap-2 bg-surface-tertiary px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Active</span>
            {activeFilterChips.map(chip => <ActiveFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />)}
          </div>
        ) : null}
      </section>

      <section className="tk-card mb-4 p-4">
        {loading || error ? (
          <div className="mb-4 flex justify-end">
            {loading ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-tint-20 px-3 py-1 text-xs font-semibold text-brand-blue">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading pipeline
              </span>
            ) : error ? (
              <span className="rounded-full bg-rag-red/10 px-3 py-1 text-xs font-semibold text-rag-red">{error}</span>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PipelineStat label="Open pipeline" value={totals.openValue} format={formatCompactCurrency} />
          <PipelineStat label="Open opportunities" value={totals.openCount} tone={totals.openCount ? 'warning' : 'success'} />
          <PipelineStat label="Won value" value={totals.wonValue} tone="success" format={formatCompactCurrency} />
          <PipelineStat label="Avg deal" value={totals.averageValue} format={formatCompactCurrency} />
        </div>
      </section>

      {view === 'board' ? (
        <OpportunityBoard items={opportunities} onOpen={openDetail} />
      ) : (
        <OpportunityList opportunities={opportunities} onOpen={openDetail} page={page} pages={pages} total={total} onPageChange={nextPage => setFilter('page', String(nextPage))} />
      )}

      <OpportunityDetailDialog
        opportunity={selectedOpportunity}
        open={Boolean(selectedOpportunity)}
        onOpenChange={open => {
          if (!open) closeDetail()
        }}
        types={types}
        ownerOptions={ownerOptions}
        onArchived={closeDetail}
      />
    </div>
  )
}

function OpportunityList({ opportunities, onOpen, page, pages, total, onPageChange }: { opportunities: Opportunity[]; onOpen: (opportunity: Opportunity) => void; page: number; pages: number; total: number; onPageChange: (page: number) => void }) {
  if (!opportunities.length) {
    return (
      <section className="tk-card p-5">
        <EmptyState icon={List} heading="No matching opportunities" body="Clear filters or adjust the account, owner, stage, type, date, or value range." className="py-12" />
      </section>
    )
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-border text-left text-sm">
          <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-4 py-3">Opportunity</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Next step</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-white">
            {opportunities.map(opportunity => (
              <tr key={opportunity.id} className="hover:bg-surface-secondary/60">
                <td className="px-4 py-3 font-semibold text-ink">{opportunity.name}</td>
                <td className="px-4 py-3 text-ink-secondary">{opportunity.accountName}</td>
                <td className="px-4 py-3 text-ink-secondary">{opportunity.typeName ?? 'Opportunity'}{opportunity.serviceLine ? ` · ${opportunity.serviceLine}` : ''}</td>
                <td className="px-4 py-3"><StageBadge stage={opportunity.stage} /></td>
                <td className="px-4 py-3 text-ink-secondary">{opportunity.ownerName}</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">{formatCurrency(opportunity.estimatedValue)}</td>
                <td className="px-4 py-3 text-ink-secondary">{formatDate(opportunity.closeDate)}</td>
                <td className="max-w-[280px] px-4 py-3 text-ink-secondary"><span className="line-clamp-2">{opportunity.nextStep ?? 'No next step'}</span></td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="tk-icon-button ml-auto" onClick={() => onOpen(opportunity)} aria-label={`Open ${opportunity.name}`} title="Open details">
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-4 py-3 text-sm text-ink-secondary">
        <span>{total} matching opportunities</span>
        <div className="flex items-center gap-2">
          <button type="button" className="tk-button-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="min-w-[92px] text-center font-semibold text-ink">Page {page} of {Math.max(1, pages)}</span>
          <button type="button" className="tk-button-secondary" disabled={pages === 0 || page >= pages} onClick={() => onPageChange(page + 1)}>
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}

function StageFilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-semibold transition-colors',
        active ? 'border-brand-blue bg-brand-blue text-white shadow-sm' : 'border-surface-border bg-white text-ink-secondary hover:border-brand-blue/40 hover:text-brand-blue',
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function FilterToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[38px] items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors',
        active ? 'border-brand-blue bg-blue-tint-20 text-brand-blue' : 'border-surface-border bg-white text-ink-secondary hover:border-brand-blue/40 hover:text-brand-blue',
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {active ? <Check className="h-4 w-4" /> : null}
      {label}
    </button>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      {children}
    </label>
  )
}

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-brand-blue/20 bg-white px-2.5 text-xs font-semibold text-brand-blue">
      {label}
      <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue-tint-20" onClick={onRemove} aria-label={`Remove ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function AddOpportunityDialog({ accounts, types, ownerOptions, initialAccountId, onCreated }: { accounts: Account[]; types: OpportunityTypeRecord[]; ownerOptions: OwnerOption[]; initialAccountId?: string; onCreated: (opportunity: Opportunity) => void }) {
  const { token, user } = useAuth()
  const createOpportunity = useOpportunityStore(state => state.createOpportunity)
  const saving = useOpportunityStore(state => state.saving)
  const stages = useOpportunityStore(state => state.stages)
  const stageOptions = useMemo(() => stages.length ? stages.map(item => item.name) : STAGES, [stages])
  const [open, setOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [engagements, setEngagements] = useState<EngagementRecord[]>([])
  const [engagementLoading, setEngagementLoading] = useState(false)
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState(() => emptyCreateForm(accounts, types, user?.id ?? '', initialAccountId, stageOptions))
  const formCustomFields = customFields

  useEffect(() => {
    if (!open) {
      setForm(emptyCreateForm(accounts, types, user?.id ?? '', initialAccountId, stageOptions))
      setCustomValues({})
      setCustomErrors({})
    }
  }, [accounts, initialAccountId, open, stageOptions, types, user?.id])

  useEffect(() => {
    if (!open || !token) return
    let cancelled = false
    listRuntimeCustomFields(token, 'opportunities')
      .then(fields => {
        if (!cancelled) setCustomFields(Array.isArray(fields) ? fields : [])
      })
      .catch(() => {
        if (!cancelled) setCustomFields([])
      })
    return () => {
      cancelled = true
    }
  }, [open, token])

  useEffect(() => {
    if (!open || !token || !form.accountId) {
      setEngagements([])
      return
    }
    const params = new URLSearchParams({ page: '1', page_size: '100' })
    setEngagementLoading(true)
    listEngagements(token, form.accountId, params)
      .then(page => setEngagements(page.items))
      .catch(() => setEngagements([]))
      .finally(() => setEngagementLoading(false))
  }, [form.accountId, open, token])

  function update(field: keyof CreateFormState, value: string) {
    setForm(current => {
      if (field !== 'accountId') return { ...current, [field]: value }
      const selectedAccount = accounts.find(account => account.id === value)
      return {
        ...current,
        accountId: value,
        engagementId: '',
        ownerId: selectedAccount?.ownerId || current.ownerId || user?.id || '',
      }
    })
    setFieldErrors(current => clearFieldError(current, field))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setFieldErrors({})
    setCustomErrors({})
    setFormError('')
    if (form.actionTitle.trim() && !form.actionDueDate) {
      setFieldErrors({ actionDueDate: 'Due date is required when adding an initial action item.' })
      return
    }
    const nextCustomErrors = requiredCustomFieldErrors(formCustomFields, customValues)
    setCustomErrors(nextCustomErrors)
    if (Object.keys(nextCustomErrors).length) return
    try {
      const payload = createPayload(form, customValuesForSubmit(formCustomFields, customValues))
      const opportunity = await createOpportunity(token, payload)
      toast.success('Opportunity created')
      setOpen(false)
      onCreated(opportunity)
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(Object.fromEntries(err.fieldErrors.filter(item => !item.field.startsWith('custom_field_values.')).map(item => [opportunityFieldAliases[item.field as keyof typeof opportunityFieldAliases] ?? item.field, item.message])))
        setCustomErrors(Object.fromEntries(err.fieldErrors.filter(item => item.field.startsWith('custom_field_values.')).map(item => [item.field.replace('custom_field_values.', ''), item.message])))
        setFormError(err.message)
      } else {
        setFormError('Unable to create opportunity')
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary">
          <Plus className="h-4 w-4" />
          Add opportunity
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
          <form onSubmit={submit} className="flex max-h-[92vh] flex-col">
            <DialogHeader title="Add opportunity" subtitle="Create a pipeline item and attach near-term action context." onClose={() => setOpen(false)} />
            <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-2">
              <FormSelect label="Account" value={form.accountId} onChange={value => update('accountId', value)} error={fieldErrors.accountId}>
                <option value="">Choose account</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </FormSelect>
              <FormSelect label="Engagement" value={form.engagementId} onChange={value => update('engagementId', value)} error={fieldErrors.engagementId}>
                <option value="">{engagementLoading ? 'Loading engagements...' : 'No engagement'}</option>
                {engagements.map(engagement => <option key={engagement.id} value={engagement.id}>{engagement.name}</option>)}
              </FormSelect>
              <FormSelect label="Owner" value={form.ownerId} onChange={value => update('ownerId', value)} error={fieldErrors.ownerId}>
                <option value="">Choose owner</option>
                {ownerOptions.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </FormSelect>
              <FormInput label="Opportunity name" value={form.name} onChange={value => update('name', value)} error={fieldErrors.name} placeholder="Expansion workshop and delivery squad" autoFocus />
              <FormSelect label="Type" value={form.typeId} onChange={value => update('typeId', value)} error={fieldErrors.typeId}>
                <option value="">Choose type</option>
                {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </FormSelect>
              <FormInput label="Service line" value={form.serviceLine} onChange={value => update('serviceLine', value)} error={fieldErrors.serviceLine} placeholder="Data Analytics" />
              <FormInput type="number" label="Estimated value" value={form.value} onChange={value => update('value', value)} error={fieldErrors.value} placeholder="125000" />
              <FormInput type="date" label="Target date" value={form.targetDate} onChange={value => update('targetDate', value)} error={fieldErrors.targetDate} />
              <FormSelect label="Stage" value={form.stage} onChange={value => update('stage', value)} error={fieldErrors.stage}>
                {stageOptions.map(item => <option key={item} value={item}>{item}</option>)}
              </FormSelect>
              <FormInput label="Currency" value={form.currency} onChange={value => update('currency', value)} error={fieldErrors.currency} placeholder="USD" />
              <FormSelect label="Source" value={form.sourceContext} onChange={value => update('sourceContext', value)} error={fieldErrors.sourceContext}>
                {SOURCE_CONTEXTS.map(item => <option key={item} value={item}>{sourceLabel(item)}</option>)}
              </FormSelect>
              <FormTextarea className="md:col-span-2" label="Next step" value={form.nextStep} onChange={value => update('nextStep', value)} error={fieldErrors.nextStep} placeholder="Confirm sponsor priority and success criteria." />
              <div className="md:col-span-2">
                <RuntimeCustomFields
                  fields={formCustomFields}
                  values={customValues}
                  errors={customErrors}
                  onChange={(fieldKey, value) => {
                    setCustomValues(current => ({ ...current, [fieldKey]: value }))
                    setCustomErrors(current => ({ ...current, [fieldKey]: '' }))
                  }}
                />
              </div>
              <div className="md:col-span-2 rounded-lg border border-surface-border bg-surface-secondary p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Initial action item</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <FormInput label="Action title" value={form.actionTitle} onChange={value => update('actionTitle', value)} error={fieldErrors.actionTitle} placeholder="Send discovery summary" />
                  <FormInput type="date" label="Due date" value={form.actionDueDate} onChange={value => update('actionDueDate', value)} error={fieldErrors.actionDueDate} />
                </div>
                <label className="mt-3 flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink-secondary">
                  <input type="checkbox" checked={form.actionCreateTask} onChange={event => setForm(current => ({ ...current, actionCreateTask: event.target.checked }))} />
                  Create task for this action item
                </label>
              </div>
              {formError ? <p className="md:col-span-2 rounded-lg bg-rag-red/10 px-3 py-2 text-sm font-semibold text-rag-red">{formError}</p> : null}
            </div>
            <DialogFooter saving={saving} submitLabel="Create opportunity" onCancel={() => setOpen(false)} />
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function OpportunityDetailDialog({
  opportunity,
  open,
  onOpenChange,
  types,
  ownerOptions,
  onArchived,
}: {
  opportunity: Opportunity | null
  open: boolean
  onOpenChange: (open: boolean) => void
  types: OpportunityTypeRecord[]
  ownerOptions: OwnerOption[]
  onArchived: () => void
}) {
  const { token } = useAuth()
  const updateOpportunity = useOpportunityStore(state => state.updateOpportunity)
  const archiveOpportunity = useOpportunityStore(state => state.archiveOpportunity)
  const restoreOpportunity = useOpportunityStore(state => state.restoreOpportunity)
  const addDecision = useOpportunityStore(state => state.addDecision)
  const addActionItem = useOpportunityStore(state => state.addActionItem)
  const updateActionItem = useOpportunityStore(state => state.updateActionItem)
  const saving = useOpportunityStore(state => state.saving)
  const stages = useOpportunityStore(state => state.stages)
  const stageOptions = useMemo(() => stages.length ? stages.map(item => item.name) : STAGES, [stages])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [sideError, setSideError] = useState('')
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [engagements, setEngagements] = useState<EngagementRecord[]>([])
  const [edit, setEdit] = useState<DetailFormState>(() => detailForm(opportunity))
  const [decisionText, setDecisionText] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionCreateTask, setActionCreateTask] = useState(true)
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])

  useEffect(() => {
    setEdit(detailForm(opportunity))
    setFieldErrors({})
    setFormError('')
    setSideError('')
    setShowAllHistory(false)
    setDecisionText('')
    setActionTitle('')
    setActionDueDate('')
    setActionCreateTask(true)
  }, [opportunity?.id])

  useEffect(() => {
    if (!open || !token || !opportunity?.accountId) {
      setEngagements([])
      return
    }
    const params = new URLSearchParams({ page: '1', page_size: '100' })
    listEngagements(token, opportunity.accountId, params)
      .then(page => setEngagements(page.items))
      .catch(() => setEngagements([]))
  }, [open, opportunity?.accountId, token])

  useEffect(() => {
    if (!open || !token) return
    let cancelled = false
    listRuntimeCustomFields(token, 'opportunities')
      .then(fields => {
        if (!cancelled) setCustomFields(Array.isArray(fields) ? fields : [])
      })
      .catch(() => {
        if (!cancelled) setCustomFields([])
      })
    return () => {
      cancelled = true
    }
  }, [open, token])

  if (!opportunity) return null

  function update(field: keyof DetailFormState, value: string) {
    setEdit(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, field))
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault()
    if (!token || !opportunity) return
    setFieldErrors({})
    setFormError('')
    try {
      await updateOpportunity(token, opportunity.id, {
        engagementId: edit.engagementId || null,
        name: edit.name,
        typeId: edit.typeId,
        ownerId: edit.ownerId,
        serviceLine: edit.serviceLine,
        value: Number(edit.value || 0),
        currency: edit.currency,
        stage: edit.stage as Stage,
        nextStep: edit.nextStep,
        targetDate: dateToNoonIso(edit.targetDate),
        sourceContext: edit.sourceContext || 'manual',
        outcomeReason: edit.outcomeReason || null,
      })
      toast.success('Opportunity updated')
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(apiFieldErrors(err, opportunityFieldAliases))
        setFormError(err.message)
      } else {
        setFormError('Unable to update opportunity')
      }
    }
  }

  async function submitDecision(event: FormEvent) {
    event.preventDefault()
    if (!token || !decisionText.trim()) return
    setSideError('')
    try {
      await addDecision(token, opportunity!.id, { decisionText: decisionText.trim() })
      setDecisionText('')
      toast.success('Decision added')
    } catch (err) {
      setSideError(err instanceof Error ? err.message : 'Unable to add decision')
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault()
    if (!token || !actionTitle.trim() || !actionDueDate) return
    setSideError('')
    try {
      await addActionItem(token, opportunity!.id, { title: actionTitle.trim(), dueDate: dateToNoonIso(actionDueDate), priority: 'medium', createTask: actionCreateTask })
      setActionTitle('')
      setActionDueDate('')
      setActionCreateTask(true)
      toast.success('Action item added')
    } catch (err) {
      setSideError(err instanceof Error ? err.message : 'Unable to add action item')
    }
  }

  async function completeAction(item: OpportunityActionItem) {
    if (!token) return
    setSideError('')
    try {
      await updateActionItem(token, opportunity!.id, item.id, { title: item.title, dueDate: item.dueDate, status: item.status === 'completed' ? 'open' : 'completed' })
      toast.success(item.status === 'completed' ? 'Action item reopened' : 'Action item completed')
    } catch (err) {
      setSideError(err instanceof Error ? err.message : 'Unable to update action item')
    }
  }

  async function archive() {
    if (!token) return
    if (!window.confirm(`Archive ${opportunity!.name}? It will leave active pipeline views but remain in history.`)) return
    setSideError('')
    try {
      await archiveOpportunity(token, opportunity!.id, 'Archived from opportunity detail')
      toast.success('Opportunity archived')
      onArchived()
    } catch (err) {
      setSideError(err instanceof Error ? err.message : 'Unable to archive opportunity')
    }
  }

  async function restore() {
    if (!token) return
    setSideError('')
    try {
      await restoreOpportunity(token, opportunity!.id, 'Restored from opportunity detail')
      toast.success('Opportunity restored')
    } catch (err) {
      setSideError(err instanceof Error ? err.message : 'Unable to restore opportunity')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[94vh] w-[min(1040px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
          <div className="flex max-h-[94vh] flex-col">
            <DialogHeader title={opportunity.name} subtitle={`${opportunity.accountName} · ${formatCurrency(opportunity.estimatedValue)} · ${opportunity.stage}`} onClose={() => onOpenChange(false)} />
            <div className="grid gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <form onSubmit={saveDetails} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormInput className="md:col-span-2" label="Opportunity name" value={edit.name} onChange={value => update('name', value)} error={fieldErrors.name} />
                  <FormSelect label="Engagement" value={edit.engagementId} onChange={value => update('engagementId', value)} error={fieldErrors.engagementId}>
                    <option value="">No engagement</option>
                    {engagements.map(engagement => <option key={engagement.id} value={engagement.id}>{engagement.name}</option>)}
                  </FormSelect>
                  <FormSelect label="Type" value={edit.typeId} onChange={value => update('typeId', value)} error={fieldErrors.typeId}>
                    {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </FormSelect>
                  <FormSelect label="Owner" value={edit.ownerId} onChange={value => update('ownerId', value)} error={fieldErrors.ownerId}>
                    {ownerOptions.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                  </FormSelect>
                  <FormInput label="Service line" value={edit.serviceLine} onChange={value => update('serviceLine', value)} error={fieldErrors.serviceLine} />
                  <FormInput label="Currency" value={edit.currency} onChange={value => update('currency', value)} error={fieldErrors.currency} />
                  <FormInput type="number" label="Estimated value" value={edit.value} onChange={value => update('value', value)} error={fieldErrors.value} />
                  <FormInput type="date" label="Target date" value={edit.targetDate} onChange={value => update('targetDate', value)} error={fieldErrors.targetDate} />
                  <FormSelect label="Stage" value={edit.stage} onChange={value => update('stage', value)} error={fieldErrors.stage}>
                    {stageOptions.map(item => <option key={item} value={item}>{item}</option>)}
                  </FormSelect>
                  <FormSelect label="Source" value={edit.sourceContext} onChange={value => update('sourceContext', value)} error={fieldErrors.sourceContext}>
                    {SOURCE_CONTEXTS.map(item => <option key={item} value={item}>{sourceLabel(item)}</option>)}
                  </FormSelect>
                  <FormInput label="Outcome reason" value={edit.outcomeReason} onChange={value => update('outcomeReason', value)} error={fieldErrors.outcomeReason} placeholder="Optional for won/lost" />
                  <FormTextarea className="md:col-span-2" label="Next step" value={edit.nextStep} onChange={value => update('nextStep', value)} error={fieldErrors.nextStep} />
                </div>
                <RuntimeCustomFieldValues fields={customFields} values={opportunity.customFieldValues} />
                {formError ? <p className="rounded-lg bg-rag-red/10 px-3 py-2 text-sm font-semibold text-rag-red">{formError}</p> : null}
                <div className="flex flex-wrap justify-between gap-2">
                  {opportunity.archivedAt ? (
                    <button type="button" className="tk-button-secondary text-rag-green" onClick={restore} disabled={saving}>
                      <ArchiveRestore className="h-4 w-4" />
                      Restore
                    </button>
                  ) : (
                    <button type="button" className="tk-button-secondary text-rag-red" onClick={archive} disabled={saving}>
                      <Archive className="h-4 w-4" />
                      Archive
                    </button>
                  )}
                  <button type="submit" className="tk-button-primary" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Save changes
                  </button>
                </div>
              </form>

              <aside className="space-y-4">
                {sideError ? <p className="rounded-lg bg-rag-red/10 px-3 py-2 text-sm font-semibold text-rag-red">{sideError}</p> : null}
                <section className="rounded-lg border border-surface-border p-4">
                  <h3 className="text-sm font-bold text-ink">Action items</h3>
                  <div className="mt-3 space-y-2">
                    {(opportunity.actionItems ?? []).length ? opportunity.actionItems!.map(item => (
                      <button key={item.id} type="button" onClick={() => completeAction(item)} aria-pressed={item.status === 'completed'} className="flex w-full items-start gap-3 rounded-lg border border-surface-border bg-surface-secondary p-3 text-left hover:border-brand-blue/40">
                        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', item.status === 'completed' ? 'border-rag-green bg-rag-green text-white' : 'border-surface-border bg-white')}>
                          {item.status === 'completed' ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{item.title}</span>
                          <span className="block text-xs text-ink-secondary">{item.ownerName ?? item.ownerEmail ?? 'Unassigned'} · due {formatDate(item.dueDate)}</span>
                          {item.futureTaskId ? <span className="mt-1 inline-flex rounded-full bg-blue-tint-20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-blue">Task linked</span> : null}
                          <span className="mt-1 block text-[11px] font-semibold text-brand-blue">{item.status === 'completed' ? 'Click to reopen' : 'Click to complete'}</span>
                        </span>
                      </button>
                    )) : <p className="rounded-lg bg-surface-secondary p-3 text-sm text-ink-secondary">No action items yet.</p>}
                  </div>
                  <form onSubmit={submitAction} className="mt-3 grid gap-2">
                    <input className="tk-input" value={actionTitle} onChange={event => setActionTitle(event.target.value)} placeholder="Add action item" />
                    <input type="date" className="tk-input" value={actionDueDate} onChange={event => setActionDueDate(event.target.value)} />
                    <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink-secondary">
                      <input type="checkbox" checked={actionCreateTask} onChange={event => setActionCreateTask(event.target.checked)} />
                      Create task for this action item
                    </label>
                    <button type="submit" className="tk-button-secondary justify-center" disabled={!actionTitle.trim() || !actionDueDate}>Add action</button>
                  </form>
                </section>

                <section className="rounded-lg border border-surface-border p-4">
                  <h3 className="text-sm font-bold text-ink">Decision history</h3>
                  <div className="mt-3 space-y-2">
                    {(opportunity.decisions ?? []).length ? opportunity.decisions!.map(decision => (
                      <div key={decision.id} className="rounded-lg bg-surface-secondary p-3">
                        <p className="text-sm font-semibold text-ink">{decision.decisionText}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{decision.createdByName} · {formatDate(decision.createdAt)}</p>
                      </div>
                    )) : <p className="rounded-lg bg-surface-secondary p-3 text-sm text-ink-secondary">No decisions recorded yet.</p>}
                  </div>
                  <form onSubmit={submitDecision} className="mt-3 grid gap-2">
                    <textarea className="tk-input min-h-[82px]" value={decisionText} onChange={event => setDecisionText(event.target.value)} placeholder="Capture a decision" />
                    <button type="submit" className="tk-button-secondary justify-center" disabled={!decisionText.trim()}>Add decision</button>
                  </form>
                </section>

                <section className="rounded-lg border border-surface-border p-4">
                  <h3 className="text-sm font-bold text-ink">Stage history</h3>
                  <div className="mt-3 space-y-2">
                    {(showAllHistory ? (opportunity.stageHistory ?? []) : (opportunity.stageHistory ?? []).slice(0, 6)).map(item => (
                      <div key={item.id} className="rounded-lg bg-surface-secondary p-3">
                        <p className="text-sm font-semibold text-ink">{item.beforeStage ?? 'Created'} → {item.afterStage}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{item.actorName} · {formatDate(item.createdAt)}{item.reason ? ` · ${item.reason}` : ''}</p>
                      </div>
                    ))}
                  </div>
                  {(opportunity.stageHistory ?? []).length > 6 ? (
                    <button type="button" className="mt-3 text-xs font-semibold text-brand-blue hover:text-brand-blue-dark" onClick={() => setShowAllHistory(current => !current)}>
                      {showAllHistory ? 'Show recent history' : `Show all ${opportunity.stageHistory!.length} events`}
                    </button>
                  ) : null}
                </section>
              </aside>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface CreateFormState {
  accountId: string
  engagementId: string
  ownerId: string
  typeId: string
  name: string
  serviceLine: string
  value: string
  currency: string
  stage: Stage
  targetDate: string
  nextStep: string
  sourceContext: string
  actionTitle: string
  actionDueDate: string
  actionCreateTask: boolean
}

interface DetailFormState {
  engagementId: string
  ownerId: string
  typeId: string
  name: string
  serviceLine: string
  value: string
  currency: string
  stage: Stage
  targetDate: string
  nextStep: string
  sourceContext: string
  outcomeReason: string
}

function emptyCreateForm(accounts: Account[], types: OpportunityTypeRecord[], currentUserId: string, initialAccountId?: string, stageOptions: Stage[] = STAGES): CreateFormState {
  const account = accounts.find(item => item.id === initialAccountId) ?? accounts[0]
  return {
    accountId: account?.id ?? '',
    engagementId: '',
    ownerId: account?.ownerId || currentUserId,
    typeId: types[0]?.id ?? '',
    name: '',
    serviceLine: '',
    value: '125000',
    currency: 'USD',
    stage: stageOptions[0] ?? '',
    targetDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    nextStep: '',
    sourceContext: 'manual',
    actionTitle: '',
    actionDueDate: '',
    actionCreateTask: true,
  }
}

function detailForm(opportunity: Opportunity | null): DetailFormState {
  return {
    engagementId: opportunity?.engagementId ?? '',
    ownerId: opportunity?.ownerId ?? '',
    typeId: opportunity?.typeId ?? '',
    name: opportunity?.name ?? '',
    serviceLine: opportunity?.serviceLine ?? '',
    value: String(opportunity?.estimatedValue ?? 0),
    currency: opportunity?.currency ?? 'USD',
    stage: opportunity?.stage ?? 'Identified',
    targetDate: opportunity?.closeDate ? opportunity.closeDate.slice(0, 10) : '',
    nextStep: opportunity?.nextStep ?? '',
    sourceContext: opportunity?.sourceContext ?? 'manual',
    outcomeReason: opportunity?.outcomeReason ?? '',
  }
}

function createPayload(form: CreateFormState, customFieldValues: Record<string, unknown> = {}): OpportunityCreateInput {
  return {
    accountId: form.accountId,
    engagementId: form.engagementId || null,
    typeId: form.typeId,
    ownerId: form.ownerId,
    name: form.name,
    serviceLine: form.serviceLine,
    value: Number(form.value || 0),
    currency: form.currency || 'USD',
    stage: form.stage,
    nextStep: form.nextStep,
    targetDate: dateToNoonIso(form.targetDate),
    sourceContext: form.sourceContext || 'manual',
    customFieldValues,
    actionItems: form.actionTitle.trim() ? [{ title: form.actionTitle.trim(), dueDate: dateToNoonIso(form.actionDueDate), priority: 'medium', createTask: form.actionCreateTask }] : [],
  }
}

function buildOwnerOptions(accounts: Account[], currentUser?: OwnerOption): OwnerOption[] {
  const options = new Map<string, OwnerOption>()
  if (currentUser?.id) options.set(currentUser.id, currentUser)
  for (const account of accounts) {
    if (account.ownerId) options.set(account.ownerId, { id: account.ownerId, name: account.ownerName, email: account.ownerEmail })
  }
  return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function dateToNoonIso(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : ''
}

function dateStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined
}

function dateEnd(value: string) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : undefined
}

function sourceLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function formatFilterCurrency(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) ? formatCompactCurrency(amount) : value
}

function StageBadge({ stage }: { stage: Stage }) {
  const tone: Record<string, string> = {
    Identified: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
    Qualified: 'border-brand-blue-dark/20 bg-blue-tint-20 text-brand-blue-dark',
    'Proposal Sent': 'border-surface-border bg-surface-tertiary text-ink-secondary',
    Negotiation: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    Won: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    Lost: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
  }
  return <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', tone[stage] ?? 'border-surface-border bg-surface-tertiary text-ink-secondary')}>{stage}</span>
}

function DialogHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Opportunity detail</p>
        <Dialog.Title className="truncate font-display text-2xl font-bold text-ink">{title}</Dialog.Title>
        <Dialog.Description className="mt-1 text-sm text-ink-secondary">{subtitle}</Dialog.Description>
      </div>
      <button type="button" className="tk-icon-button" aria-label="Close opportunity dialog" onClick={onClose}>
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

function DialogFooter({ saving, submitLabel, onCancel }: { saving: boolean; submitLabel: string; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-5">
      <button type="button" className="tk-button-secondary" onClick={onCancel}>Cancel</button>
      <button type="submit" className="tk-button-primary" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {submitLabel}
      </button>
    </div>
  )
}

function FormInput({ label, value, onChange, error, className, type = 'text', placeholder, autoFocus }: { label: string; value: string; onChange: (value: string) => void; error?: string; className?: string; type?: string; placeholder?: string; autoFocus?: boolean }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <label className={cn('space-y-1', className)}>
      <span className="tk-label text-xs">{label}</span>
      <input id={id} type={type} className="tk-input" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`} />
      <FieldError id={`${id}-error`} message={error} />
    </label>
  )
}

function FormTextarea({ label, value, onChange, error, className, placeholder }: { label: string; value: string; onChange: (value: string) => void; error?: string; className?: string; placeholder?: string }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <label className={cn('space-y-1', className)}>
      <span className="tk-label text-xs">{label}</span>
      <textarea id={id} className="tk-input min-h-[96px]" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`} />
      <FieldError id={`${id}-error`} message={error} />
    </label>
  )
}

function FormSelect({ label, value, onChange, error, children }: { label: string; value: string; onChange: (value: string) => void; error?: string; children: ReactNode }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <label className="space-y-1">
      <span className="tk-label text-xs">{label}</span>
      <select id={id} className="tk-input" value={value} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`}>
        {children}
      </select>
      <FieldError id={`${id}-error`} message={error} />
    </label>
  )
}
