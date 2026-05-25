import { Building2, Download, FileText, LayoutGrid, Save, Table2, Tags, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AccountCard } from '@/components/account/AccountCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Column, SortableTable } from '@/components/ui/SortableTable'
import { users } from '@/data/mock'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatCompactCurrency } from '@/utils/formatters'

function AccountStat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'warning' | 'success' }) {
  const valueClass = tone === 'warning' ? 'text-brand-orange' : tone === 'success' ? 'text-rag-green' : 'text-ink'

  return (
    <div className="rounded-lg bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}

export function Accounts() {
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saveViewOpen, setSaveViewOpen] = useState(false)
  const [draftViewName, setDraftViewName] = useState('')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
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
  const privileged = user.role === 'leadership' || user.role === 'admin'

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function setMultiFilter(key: string, values: string[]) {
    const next = new URLSearchParams(params)
    next.delete(key)
    values.forEach(value => next.append(key, value))
    setParams(next, { replace: true })
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
    setParams(next, { replace: true })
  }

  function openSaveView() {
    setSaveViewOpen(true)
    if (!draftViewName) setDraftViewName(search || stage || risk || segments[0] || 'Portfolio view')
  }

  function saveCurrentFilters() {
    const name = draftViewName.trim()
    if (!name) return
    saveFilter({ name, query: search, stage, risk, segments, creatorId: user.id, shared: user.role === 'admin' })
    setDraftViewName('')
    setSaveViewOpen(false)
  }

  const filtered = useMemo(
    () =>
      accounts.filter(account => {
        const matchesSearch = !search || account.name.toLowerCase().includes(search.toLowerCase()) || account.ownerName.toLowerCase().includes(search.toLowerCase())
        const matchesSegment = !segments.length || segments.some(segment => account.segment === segment || account.tags.includes(segment))
        return matchesSearch && (!stage || account.stage === stage) && (!risk || account.riskStatus === risk) && matchesSegment
      }),
    [accounts, risk, search, segments, stage],
  )

  const visibleSavedViews = savedFilters.filter(filter => filter.shared || filter.creatorId === user.id)
  const activeFilterCount = [search, stage, risk].filter(Boolean).length + segments.length
  const filteredArr = filtered.reduce((sum, account) => sum + account.arr, 0)
  const filteredAtRisk = filtered.filter(account => account.riskStatus !== 'healthy').length

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
    const timer = window.setTimeout(() => setLoading(false), 400)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div>
      <PageHeader
        eyebrow="Account portfolio"
        title="Accounts"
        description="Manage portfolio views, open Account 360, and prepare bulk ownership updates."
        actions={
          <button className="tk-button-secondary" disabled>
            Import accounts <span className="rounded-full bg-brand-orange/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-orange">Phase 2</span>
          </button>
        }
      />
      <FilterBar onClear={clearFilters} contentClassName="md:grid-cols-[minmax(220px,1.2fr)_160px_160px_minmax(280px,1fr)_auto]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Search</span>
          <input className="tk-input" value={search} onChange={event => setFilter('q', event.target.value)} placeholder="Account or AM" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Stage</span>
          <select className="tk-input" value={stage} onChange={event => setFilter('stage', event.target.value)}>
            <option value="">All stages</option>
            <option>Onboarding</option>
            <option>Adoption</option>
            <option>Expansion</option>
            <option>Renewal</option>
            <option>At Risk</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Risk</span>
          <select className="tk-input" value={risk} onChange={event => setFilter('risk', event.target.value)}>
            <option value="">All risk</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Segments</span>
          <div className="flex min-h-[44px] flex-wrap gap-2 rounded-md border border-surface-border bg-white p-1.5">
            {segmentTags.map(tag => {
              const selected = segments.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  className={cn(
                    'inline-flex min-h-[44px] items-center rounded-md px-3 text-xs font-semibold transition-colors',
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

      <section className="tk-card mb-4 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-3">
            <AccountStat label="Matched accounts" value={filtered.length} />
            <AccountStat label="Matched ARR" value={formatCompactCurrency(filteredArr)} />
            <AccountStat label="At risk" value={filteredAtRisk} tone={filteredAtRisk ? 'warning' : 'success'} />
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
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
              <button className="tk-button-secondary" onClick={openSaveView} disabled={!activeFilterCount}>
                <Save className="h-4 w-4" />
                Save view
              </button>
            )}
          </div>
        </div>
      </section>

      {visibleSavedViews.length ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Saved views</span>
          <div className="flex flex-wrap gap-2">
          {visibleSavedViews.map(filter => (
            <div key={filter.id} className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-white p-1">
              <button className="min-h-[44px] rounded-md px-3 text-sm font-semibold text-ink hover:bg-surface-tertiary" onClick={() => applySavedView(filter.id)}>{filter.name}</button>
              {user.role === 'admin' ? (
                <button className="min-h-[44px] rounded-md px-2 text-xs font-semibold text-brand-blue hover:bg-blue-tint-20" onClick={() => toggleFilterShared(filter.id)}>
                  {filter.shared ? 'Shared' : 'Personal'}
                </button>
              ) : null}
            </div>
          ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} heading="No accounts found" body="Clear filters or search for a different account." />
      ) : view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(account => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      ) : (
        <SortableTable
          items={filtered}
          columns={columns}
          defaultSort={{ column: 'name', direction: 'asc' }}
          onRowClick={account => navigate(`/accounts/${account.id}`)}
          selection={privileged ? { selectedIds, onToggle: toggleSelected, onToggleAll: toggleAll } : undefined}
        />
      )}
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
