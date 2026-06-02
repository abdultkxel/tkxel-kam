import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, Download, FileText, LayoutGrid, Loader2, Save, Table2, Tags, Upload, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AccountCard } from '@/components/account/AccountCard'
import { CreateAccountDialog } from '@/components/account/CreateAccountDialog'
import { AccountCsvImport } from '@/components/admin/AccountCsvImport'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Column, SortableTable } from '@/components/ui/SortableTable'
import { useAuth } from '@/contexts/AuthContext'
import { users } from '@/data/mock'
import { useRole } from '@/hooks/useRole'
import { listAccounts } from '@/services/accountWorkspace'
import { useAccountStore } from '@/stores/accountStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatCompactCurrency } from '@/utils/formatters'

type AccountLayout = 'cards' | 'table'
type AccountSortOption = 'name' | 'lifecycle_status' | 'risk_status' | 'owner_name' | 'segment' | 'commercial_value' | 'health' | 'next_governance_at' | 'updated_at'
type SortDirection = 'asc' | 'desc'

const accountSortOptions: AccountSortOption[] = ['name', 'lifecycle_status', 'risk_status', 'owner_name', 'segment', 'commercial_value', 'health', 'next_governance_at', 'updated_at']
const tableColumnToApiSort: Record<string, AccountSortOption> = {
  name: 'name',
  stage: 'lifecycle_status',
  riskStatus: 'risk_status',
  ownerName: 'owner_name',
  segment: 'segment',
  arr: 'commercial_value',
}
const apiSortToTableColumn: Record<AccountSortOption, string> = {
  name: 'name',
  lifecycle_status: 'stage',
  risk_status: 'riskStatus',
  owner_name: 'ownerName',
  segment: 'segment',
  commercial_value: 'arr',
  health: 'name',
  next_governance_at: 'name',
  updated_at: 'name',
}

export function Accounts() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<AccountLayout>('cards')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saveViewOpen, setSaveViewOpen] = useState(false)
  const [draftViewName, setDraftViewName] = useState('')
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 12, pages: 1 })
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useRole()
  const { token } = useAuth()
  const accounts = useAccountStore(state => state.accounts)
  const setAccounts = useAccountStore(state => state.setAccounts)
  const segmentTags = useAccountStore(state => state.segmentTags)
  const savedFilters = useAccountStore(state => state.savedFilters)
  const saveFilter = useAccountStore(state => state.saveFilter)
  const toggleFilterShared = useAccountStore(state => state.toggleFilterShared)
  const assignOwner = useAccountStore(state => state.assignOwner)
  const addTagToAccounts = useAccountStore(state => state.addTagToAccounts)
  const timelineEntries = useTimelineStore(state => state.entries)
  const search = params.get('q') ?? ''
  const stage = params.get('stage') ?? ''
  const risk = params.get('risk') ?? ''
  const segments = params.getAll('segment')
  const segmentsKey = segments.join('|')
  const requestedSort = params.get('sort') ?? 'name'
  const sort: AccountSortOption = accountSortOptions.includes(requestedSort as AccountSortOption) ? requestedSort as AccountSortOption : 'name'
  const direction: SortDirection = params.get('direction') === 'desc' ? 'desc' : 'asc'
  const page = Number(params.get('page') ?? '1')
  const privileged = user.role === 'leadership' || user.role === 'admin' || user.role === 'super_admin'
  const tableSort = { column: apiSortToTableColumn[sort] ?? 'name', direction }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.set('page', '1')
    setParams(next, { replace: true })
  }

  function setMultiFilter(key: string, values: string[]) {
    const next = new URLSearchParams(params)
    next.delete(key)
    values.forEach(value => next.append(key, value))
    next.set('page', '1')
    setParams(next, { replace: true })
  }

  function setSortState(nextSort: AccountSortOption, nextDirection: SortDirection) {
    const next = new URLSearchParams(params)
    next.set('sort', nextSort)
    next.set('direction', nextDirection)
    next.set('page', '1')
    setParams(next, { replace: true })
  }

  function handleTableSort(nextSort: { column: string; direction: SortDirection }) {
    setSortState(tableColumnToApiSort[nextSort.column] ?? 'name', nextSort.direction)
  }

  function toggleSegment(segment: string) {
    setMultiFilter('segment', segments.includes(segment) ? segments.filter(item => item !== segment) : [...segments, segment])
  }

  function clearFilters() {
    setParams({}, { replace: true })
    setSelectedIds([])
  }

  function applySavedView(id: string) {
    const viewConfig = savedFilters.find(filter => filter.id === id)
    if (!viewConfig) return
    const next = new URLSearchParams()
    if (viewConfig.query) next.set('q', viewConfig.query)
    if (viewConfig.stage) next.set('stage', viewConfig.stage)
    if (viewConfig.risk) next.set('risk', viewConfig.risk)
    viewConfig.segments.forEach(item => next.append('segment', item))
    if (viewConfig.sort) next.set('sort', viewConfig.sort)
    if (viewConfig.direction) next.set('direction', viewConfig.direction)
    next.set('page', '1')
    if (viewConfig.layout) setView(viewConfig.layout)
    setParams(next, { replace: true })
  }

  function openSaveView() {
    setSaveViewOpen(true)
    if (!draftViewName) setDraftViewName(search || stage || risk || segments[0] || (sort !== 'name' ? 'Sorted portfolio' : view === 'table' ? 'Table view' : 'Portfolio view'))
  }

  function saveCurrentFilters() {
    const name = draftViewName.trim()
    if (!name) return
    saveFilter({ name, query: search, stage, risk, segments, sort, direction, layout: view, creatorId: user.id, shared: user.role === 'admin' || user.role === 'super_admin' })
    setDraftViewName('')
    setSaveViewOpen(false)
  }

  const visibleSavedViews = savedFilters.filter(filter => filter.shared || filter.creatorId === user.id)
  const activeFilterCount = [search, stage, risk].filter(Boolean).length + segments.length
  const activeViewStateCount = activeFilterCount + (sort !== 'name' ? 1 : 0) + (direction !== 'asc' ? 1 : 0) + (view !== 'cards' ? 1 : 0)

  const columns: Column<Account>[] = [
    { key: 'name', header: 'Account', sortable: true, render: account => <span className="font-semibold text-ink">{account.name}</span> },
    { key: 'stage', header: 'Stage', sortable: true },
    { key: 'riskStatus', header: 'Risk', sortable: true },
    { key: 'ownerName', header: 'AM', sortable: true },
    { key: 'segment', header: 'Segment', sortable: true },
    { key: 'arr', header: 'ARR', sortable: true, render: account => formatCompactCurrency(account.arr) },
  ]

  function toggleSelected(id: string) {
    setSelectedIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]))
  }

  function toggleAll(ids: string[]) {
    setSelectedIds(current => (ids.every(id => current.includes(id)) ? current.filter(id => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))))
  }

  function changeOwner(ownerId: string) {
    const owner = users.find(item => item.id === ownerId)
    if (!owner) return
    assignOwner(selectedIds, owner.id, owner.name)
    selectedIds.forEach(accountId => {
      emitTimelineEvent({
        accountId,
        eventType: 'account_setup',
        module: 'manual',
        title: 'Owner changed',
        description: `Account owner changed to ${owner.name}.`,
        performedBy: user.id,
        performedByName: user.name,
        metadata: { action: 'owner_changed', ownerId },
        isSensitive: false,
        isSystemGenerated: true,
        isImmutable: false,
      })
    })
    setSelectedIds([])
  }

  function addTag(tag: string) {
    addTagToAccounts(selectedIds, tag)
    setSelectedIds([])
  }

  function exportCsv() {
    const rows = selectedIds.map(id => accounts.find(account => account.id === id)).filter(Boolean) as Account[]
    const csvRows = rows.map(account => {
      const lastActivity = timelineEntries.filter(entry => entry.accountId === account.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]?.timestamp ?? ''
      const openEscalations = timelineEntries.filter(entry => entry.accountId === account.id && entry.module === 'escalation' && !entry.title.toLowerCase().includes('closed')).length
      return [account.name, account.stage, account.health.overall, account.arr, account.ownerName, lastActivity, openEscalations].join(',')
    })
    const blob = new Blob([['name,stage,health_score,arr,am,last_activity,open_escalations', ...csvRows].join('\n')], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'kam-account-export.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  useEffect(() => {
    if (!token) return
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (stage) query.set('lifecycle_status', stage)
    if (risk) query.set('risk_status', risk === 'at_risk' ? 'critical' : risk)
    if (segments[0]) query.set('segment', segments[0])
    query.set('sort', sort)
    query.set('direction', direction)
    query.set('page', String(Number.isFinite(page) && page > 0 ? page : 1))
    query.set('page_size', '12')

    let active = true
    setLoading(true)
    setError('')
    listAccounts(token, query)
      .then(result => {
        if (!active) return
        setAccounts(result.items)
        setPagination({ total: result.total, page: result.page, pageSize: result.page_size, pages: result.pages })
        setSelectedIds([])
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load accounts')
        setAccounts([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [direction, page, risk, search, segmentsKey, setAccounts, sort, stage, token])

  return (
    <div>
      <PageHeader
        eyebrow="Account portfolio"
        title="Accounts"
        description="Manage portfolio views, open Account Overview, and prepare bulk ownership updates."
        actions={
          <>
            <AccountImportDialog />
            <CreateAccountDialog />
          </>
        }
      />

      {visibleSavedViews.length ? (
        <section className="mb-4 flex flex-col gap-3 rounded-lg border border-surface-border bg-white p-3 sm:flex-row sm:items-center">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-secondary">Saved views</span>
          <div className="flex min-w-0 flex-wrap gap-2">
            {visibleSavedViews.map(filter => (
              <div key={filter.id} className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-surface-border bg-surface-secondary p-1">
                <button className="min-h-[44px] rounded-md px-3 text-sm font-semibold text-ink transition-colors hover:bg-white" onClick={() => applySavedView(filter.id)}>{filter.name}</button>
                {user.role === 'admin' || user.role === 'super_admin' ? (
                  <button className="min-h-[44px] rounded-md px-2 text-xs font-semibold text-brand-blue transition-colors hover:bg-blue-tint-20" onClick={() => toggleFilterShared(filter.id)}>
                    {filter.shared ? 'Shared' : 'Personal'}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <FilterBar
        onClear={clearFilters}
        contentClassName="lg:grid-cols-[minmax(220px,1fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)] xl:grid-cols-[minmax(240px,1.1fr)_160px_160px_minmax(320px,1fr)_auto]"
      >
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Search</span>
          <input className="tk-input" value={search} onChange={event => setFilter('q', event.target.value)} placeholder="Account, AM, or email" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Stage</span>
          <select className="tk-input" value={stage} onChange={event => setFilter('stage', event.target.value)}>
            <option value="">All stages</option>
            <option>Draft</option>
            <option>Onboarding</option>
            <option>Active</option>
            <option>Adoption</option>
            <option>Expansion</option>
            <option>Expansion Focus</option>
            <option>Renewal</option>
            <option>Renewal Focus</option>
            <option>At Risk</option>
            <option>Dormant</option>
            <option>Archived</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Risk</span>
          <select className="tk-input" value={risk} onChange={event => setFilter('risk', event.target.value)}>
            <option value="">All risk</option>
            <option value="at_risk">At risk</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <div className="space-y-1 lg:col-span-2 xl:col-span-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Segments</span>
          <div className="flex min-h-[44px] gap-2 overflow-x-auto rounded-md border border-surface-border bg-white p-1.5 xl:flex-wrap xl:overflow-visible">
            {segmentTags.map(tag => {
              const selected = segments.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    'inline-flex min-h-[44px] shrink-0 items-center rounded-md px-3 text-xs font-semibold transition-colors',
                    selected ? 'bg-brand-blue text-white' : 'bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary hover:text-ink',
                  )}
                  onClick={() => toggleSegment(tag)}
                  aria-pressed={selected}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      </FilterBar>

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-surface-border bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">Portfolio view</p>
          <p className="mt-1 text-xs text-ink-secondary">
            {activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'All accounts visible'}
          </p>
          {loading ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-blue">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading accounts
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Sort</span>
              <select className="tk-input min-w-[170px]" value={sort} onChange={event => setFilter('sort', event.target.value)}>
                <option value="name">Name</option>
                <option value="lifecycle_status">Lifecycle</option>
                <option value="risk_status">Risk</option>
                <option value="owner_name">Account manager</option>
                <option value="segment">Segment</option>
                <option value="commercial_value">Commercial value</option>
                <option value="health">Health</option>
                <option value="next_governance_at">Next governance</option>
                <option value="updated_at">Updated</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Order</span>
              <select className="tk-input min-w-[120px]" value={direction} onChange={event => setFilter('direction', event.target.value)}>
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </label>
            <div className="inline-flex w-fit rounded-lg border border-surface-border bg-white p-1">
              <button className={cn('tk-icon-button', view === 'cards' ? 'bg-brand-blue text-white hover:bg-brand-blue-dark hover:text-white' : '')} onClick={() => setView('cards')} aria-label="Card view" aria-pressed={view === 'cards'}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button className={cn('tk-icon-button', view === 'table' ? 'bg-brand-blue text-white hover:bg-brand-blue-dark hover:text-white' : '')} onClick={() => setView('table')} aria-label="Table view" aria-pressed={view === 'table'}>
                <Table2 className="h-4 w-4" />
              </button>
            </div>
            {saveViewOpen ? (
              <div className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface-secondary p-2 sm:flex-row sm:items-center">
                <input className="tk-input sm:w-[220px]" value={draftViewName} onChange={event => setDraftViewName(event.target.value)} placeholder="View name" aria-label="Saved view name" />
                <button className="tk-button-primary" onClick={saveCurrentFilters} disabled={!draftViewName.trim()}>
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button className="tk-button-secondary" onClick={() => setSaveViewOpen(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="tk-button-secondary" onClick={openSaveView} disabled={!activeViewStateCount}>
                <Save className="h-4 w-4" />
                Save view
              </button>
            )}
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : error ? (
        <EmptyState icon={AlertTriangle} heading="Accounts could not be loaded" body={error} />
      ) : accounts.length === 0 ? (
        <EmptyState icon={Building2} heading="No accounts found" body="Clear filters or search for a different account." />
      ) : view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map(account => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      ) : (
        <SortableTable
          items={accounts}
          columns={columns}
          defaultSort={{ column: 'name', direction: 'asc' }}
          sort={tableSort}
          onSortChange={handleTableSort}
          onRowClick={account => navigate(`/accounts/${account.id}`)}
          selection={privileged ? { selectedIds, onToggle: toggleSelected, onToggleAll: toggleAll } : undefined}
        />
      )}
      {!loading && !error && pagination.pages > 1 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-surface-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-ink-secondary">
            Page {pagination.page} of {pagination.pages} | {pagination.total} accounts
          </p>
          <div className="flex gap-2">
            <button className="tk-button-secondary" onClick={() => setFilter('page', String(Math.max(1, pagination.page - 1)))} disabled={pagination.page <= 1}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button className="tk-button-secondary" onClick={() => setFilter('page', String(Math.min(pagination.pages, pagination.page + 1)))} disabled={pagination.page >= pagination.pages}>
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
      {privileged && view === 'table' && selectedIds.length ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-white p-3 shadow-panel">
          <span className="text-sm font-semibold text-ink">{selectedIds.length} selected</span>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2">
              <UserRound className="h-4 w-4 text-brand-blue" />
              <select className="tk-input min-w-[180px]" defaultValue="" onChange={event => event.target.value && changeOwner(event.target.value)}>
                <option value="">Change AM</option>
                {users.filter(item => item.role === 'am').map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              <Tags className="h-4 w-4 text-brand-blue" />
              <select className="tk-input min-w-[160px]" defaultValue="" onChange={event => event.target.value && addTag(event.target.value)}>
                <option value="">Add tag</option>
                {segmentTags.map(tag => <option key={tag}>{tag}</option>)}
              </select>
            </label>
            <button className="tk-button-secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button className="tk-button-primary" disabled>
              <FileText className="h-4 w-4" />
              Generate portfolio report
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">Phase 2</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AccountImportDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-secondary">
          <Upload className="h-4 w-4" />
          Import CSV
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,900px)] w-[min(1040px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white shadow-panel">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account import flow</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Import accounts</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Create account records from a mapped CSV, with validation and timeline audit entries.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close account import">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="p-5">
            <AccountCsvImport />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
