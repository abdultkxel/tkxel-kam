import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Building2, ChevronLeft, ChevronRight, Download, FileText, LayoutGrid, Loader2, Search, Table2, Upload, X } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AccountCard } from '@/components/account/AccountCard'
import { AccountStageBadge } from '@/components/account/AccountStageBadge'
import { CreateAccountDialog } from '@/components/account/CreateAccountDialog'
import { AccountCsvImport } from '@/components/admin/AccountCsvImport'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Column, SortableTable } from '@/components/ui/SortableTable'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { listAccounts, listOnboardingAccountManagers, listOnboardingDrafts, type OnboardingAccountManager } from '@/services/accountWorkspace'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
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
  const [accountManagers, setAccountManagers] = useState<OnboardingAccountManager[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: 12, pages: 1 })
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { capabilities } = useCapabilities()
  const { token } = useAuth()
  const search = params.get('q') ?? ''
  const stage = params.get('stage') ?? ''
  const risk = params.get('risk') ?? ''
  const primaryAm = params.get('primary_am') ?? ''
  const workloadAm = params.get('am_id') ?? params.get('owner') ?? ''
  const activeAm = primaryAm || workloadAm
  const requestedSort = params.get('sort') ?? 'name'
  const sort: AccountSortOption = accountSortOptions.includes(requestedSort as AccountSortOption) ? requestedSort as AccountSortOption : 'name'
  const direction: SortDirection = params.get('direction') === 'desc' ? 'desc' : 'asc'
  const page = Number(params.get('page') ?? '1')
  const privileged = capabilities.can_view_portfolio || capabilities.can_update_portfolio_accounts || capabilities.can_assign_account_owners
  const canSeeDraftAccounts =
    capabilities.can_approve_onboarding ||
    capabilities.permission_keys.some(permission => ['onboarding:view_all', 'onboarding:view_assigned', 'onboarding:create_draft'].includes(permission))
  const tableSort = { column: apiSortToTableColumn[sort] ?? 'name', direction }
  const activeManagerName = accountManagers.find(manager => manager.id === activeAm)?.name ?? accounts.find(account => account.ownerId === activeAm)?.ownerName ?? activeAm
  const accountManagerOptions = activeAm && !accountManagers.some(manager => manager.id === activeAm)
    ? [{ id: activeAm, name: activeManagerName || activeAm }, ...accountManagers]
    : accountManagers

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.set('page', '1')
    setParams(next, { replace: true })
  }

  function setAccountManagerFilter(value: string) {
    const next = new URLSearchParams(params)
    next.delete('am_id')
    next.delete('owner')
    if (value) next.set('primary_am', value)
    else next.delete('primary_am')
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

  function clearFilters() {
    setParams({}, { replace: true })
    setSelectedIds([])
  }

  const activeFilterCount = [search, stage, risk, activeAm].filter(Boolean).length
  const activeFilterChips = [
    search ? { key: 'search', label: `Search: ${search}`, onRemove: () => setFilter('q', '') } : null,
    stage ? { key: 'stage', label: `Stage: ${stage}`, onRemove: () => setFilter('stage', '') } : null,
    risk ? { key: 'risk', label: `Risk: ${riskLabel(risk)}`, onRemove: () => setFilter('risk', '') } : null,
    activeAm ? { key: 'am', label: `${workloadAm ? 'AM workload' : 'Account manager'}: ${activeManagerName || activeAm}`, onRemove: () => setAccountManagerFilter('') } : null,
  ].filter((chip): chip is { key: string; label: string; onRemove: () => void } => Boolean(chip))

  const columns: Column<Account>[] = [
    { key: 'name', header: 'Account', sortable: true, render: account => <span className="font-semibold text-ink">{account.name}</span> },
    { key: 'stage', header: 'Stage', sortable: true, render: account => <AccountStageBadge stage={account.stage} /> },
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

  function exportCsv() {
    const rows = selectedIds.map(id => accounts.find(account => account.id === id)).filter(Boolean) as Account[]
    const csvRows = rows.map(account => {
      return [account.name, account.stage, account.hasHealthScore ? account.health.overall : '', account.arr, account.ownerName, ''].join(',')
    })
    const blob = new Blob([['name,stage,health_score,arr,am,last_activity', ...csvRows].join('\n')], { type: 'text/csv' })
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
    if (risk) query.set('risk_status', risk)
    if (primaryAm) query.set('primary_am', primaryAm)
    else if (workloadAm) query.set('am_id', workloadAm)
    query.set('sort', sort)
    query.set('direction', direction)
    query.set('page', String(Number.isFinite(page) && page > 0 ? page : 1))
    query.set('page_size', '12')

    let active = true
    setLoading(true)
    setError('')
    const draftQuery = buildDraftAccountQuery({ search, stage, risk })
    const draftsPromise = canSeeDraftAccounts && draftQuery ? listOnboardingDrafts(token, draftQuery) : Promise.resolve({ items: [], total: 0, page: 1, page_size: 25, pages: 0 })

    Promise.all([listAccounts(token, query), draftsPromise])
      .then(([result, draftResult]) => {
        if (!active) return
        const draftAccounts = page <= 1 ? draftResult.items.map(draft => draft.accountDraft) : []
        setAccounts([...draftAccounts, ...result.items])
        const total = result.total + (canSeeDraftAccounts ? draftResult.total : 0)
        setPagination({ total, page: result.page, pageSize: result.page_size, pages: Math.max(result.pages, pageCount(total, result.page_size)) })
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
  }, [canSeeDraftAccounts, direction, page, primaryAm, risk, search, setAccounts, sort, stage, token, workloadAm])

  useEffect(() => {
    if (!token || !privileged) {
      setAccountManagers([])
      return
    }
    let active = true
    listOnboardingAccountManagers(token)
      .then(managers => {
        if (active) setAccountManagers(managers)
      })
      .catch(() => {
        if (active) setAccountManagers([])
      })
    return () => {
      active = false
    }
  }, [privileged, token])

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

      <section className="tk-card mb-4 overflow-hidden">
        <div className="border-b border-surface-border p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_minmax(150px,180px)_minmax(120px,150px)_minmax(180px,220px)] xl:items-end 2xl:grid-cols-[minmax(320px,1fr)_minmax(160px,190px)_minmax(130px,160px)_minmax(190px,230px)_minmax(190px,auto)]">
            <label className="min-w-0 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Search</span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
                <input className="tk-input pl-10" value={search} onChange={event => setFilter('q', event.target.value)} placeholder="Search account name, AM, or email" />
              </span>
            </label>
            <SelectField label="Sort">
              <select className="tk-input" value={sort} onChange={event => setFilter('sort', event.target.value)}>
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
            </SelectField>
            <SelectField label="Order">
              <select className="tk-input" value={direction} onChange={event => setFilter('direction', event.target.value)}>
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </SelectField>
            <SelectField label="Stage">
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
            </SelectField>
            <div className="flex min-w-0 flex-col gap-1 md:col-span-2 xl:col-span-1 xl:col-start-4 xl:items-end 2xl:col-start-auto">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary xl:text-right">View</span>
              <div className="grid min-h-[44px] w-full min-w-0 grid-cols-1 gap-1 rounded-md border border-surface-border bg-surface-secondary p-1 min-[380px]:grid-cols-2 sm:w-fit sm:min-w-[190px]">
                <button className={cn('inline-flex min-h-[36px] items-center justify-center gap-2 rounded px-3 text-sm font-semibold whitespace-nowrap transition-colors', view === 'cards' ? 'bg-white text-brand-blue shadow-sm' : 'text-ink-secondary hover:text-ink')} onClick={() => setView('cards')} aria-label="Card view" aria-pressed={view === 'cards'}>
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  Cards
                </button>
                <button className={cn('inline-flex min-h-[36px] items-center justify-center gap-2 rounded px-3 text-sm font-semibold whitespace-nowrap transition-colors', view === 'table' ? 'bg-white text-brand-blue shadow-sm' : 'text-ink-secondary hover:text-ink')} onClick={() => setView('table')} aria-label="Table view" aria-pressed={view === 'table'}>
                  <Table2 className="h-4 w-4 shrink-0" />
                  Table
                </button>
              </div>
            </div>
          </div>

          {privileged ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,0.5fr)]">
              <SelectField label="Account manager">
                <select className="tk-input" value={activeAm} onChange={event => setAccountManagerFilter(event.target.value)}>
                  <option value="">All account managers</option>
                  {accountManagerOptions.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                </select>
              </SelectField>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Risk</span>
            {[
              { value: '', label: 'All' },
              { value: 'healthy', label: 'Healthy' },
              { value: 'warning', label: 'Warning' },
              { value: 'at_risk', label: 'At risk' },
              { value: 'critical', label: 'Critical' },
            ].map(item => (
              <RiskFilterButton key={item.value || 'all'} active={risk === item.value} label={item.label} onClick={() => setFilter('risk', item.value)} />
            ))}
          </div>

          {activeFilterChips.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Active</span>
              {activeFilterChips.map(chip => <ActiveFilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />)}
              <button type="button" className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-surface-border bg-white px-2.5 text-xs font-semibold text-ink-secondary hover:border-brand-blue/40 hover:text-brand-blue" onClick={clearFilters}>
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 bg-surface-tertiary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-ink">
            {pagination.total ? `${pagination.total} account${pagination.total === 1 ? '' : 's'}` : 'Portfolio view'}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink-secondary">
            <span>{activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? '' : 's'}` : 'All accounts visible'}</span>
            {loading ? (
              <span className="inline-flex items-center gap-1 text-brand-blue">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading accounts
              </span>
            ) : null}
          </div>
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
          onRowClick={account => navigate(account.detailPath ?? `/accounts/${account.id}`)}
          selection={privileged ? { selectedIds, onToggle: toggleSelected, onToggleAll: toggleAll, getLabel: account => account.name } : undefined}
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

function SelectField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      {children}
    </label>
  )
}

function RiskFilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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

function riskLabel(value: string) {
  if (value === 'at_risk') return 'At risk'
  return value.replace(/\b\w/g, character => character.toUpperCase())
}

function buildDraftAccountQuery({ search, stage, risk }: { search: string; stage: string; risk: string }) {
  if (stage && stage !== 'Draft') return null
  if (risk && risk !== 'warning') return null
  const query = new URLSearchParams({ status: 'ready_for_review', page: '1', page_size: '25' })
  if (search) query.set('search', search)
  return query
}

function pageCount(total: number, pageSize: number) {
  return total ? Math.ceil(total / pageSize) : 0
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
