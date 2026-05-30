import { Filter, Loader2, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { getAccountHealthRollupApi } from '@/services/engagements'
import { buildAccountHealthRollup, useV3Store } from '@/stores/v3Store'
import { Account } from '@/types/account'
import { AccountHealthRollup, EngagementContribution } from '@/types/v3'
import { formatCompactCurrency, formatDate } from '@/utils/formatters'

type SortKey = 'score' | 'risk' | 'freshness' | 'value'
type DirtyFilter = 'all' | 'dirty' | 'clean'
type RagFilter = 'all' | 'green' | 'amber' | 'red' | 'dirty'

export function AccountHealthRollupPanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const engagements = useV3Store(state => state.engagements)
  const snapshots = useV3Store(state => state.accountHealthSnapshots)
  const saveLocalRollupSnapshot = useV3Store(state => state.getAccountHealthRollup)
  const saveApiRollupSnapshot = useV3Store(state => state.saveAccountHealthRollupSnapshot)
  const [apiRollup, setApiRollup] = useState<AccountHealthRollup | null>(null)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [dirtyFilter, setDirtyFilter] = useState<DirtyFilter>('all')
  const [ragFilter, setRagFilter] = useState<RagFilter>('all')
  const localRollup = useMemo(() => buildAccountHealthRollup(engagements, account.id), [account.id, engagements])
  const rollup = apiRollup ?? localRollup
  const visible = useMemo(
    () =>
      rollup.contributions
        .filter(item => (dirtyFilter === 'all' ? true : dirtyFilter === 'dirty' ? item.dirty : !item.dirty))
        .filter(item => (ragFilter === 'all' ? true : item.ragStatus === ragFilter))
        .sort((a, b) => contributionSortValue(b, sortKey) - contributionSortValue(a, sortKey)),
    [dirtyFilter, ragFilter, rollup.contributions, sortKey],
  )
  const accountSnapshots = (apiRollup?.snapshots ?? snapshots.filter(snapshot => snapshot.accountId === account.id)).slice(0, 5)

  useEffect(() => {
    if (!token) return

    let active = true
    setLoading(true)
    setApiError(null)
    getAccountHealthRollupApi(token, account.id, { page_size: 10 })
      .then(nextRollup => {
        if (!active) return
        setApiRollup(nextRollup)
        saveApiRollupSnapshot(nextRollup)
      })
      .catch(error => {
        if (!active) return
        setApiError(error instanceof ApiError ? error.message : 'Unable to load Account Health rollup')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [account.id, saveApiRollupSnapshot, token])

  async function refreshRollup() {
    setLoading(true)
    setApiError(null)
    try {
      if (token) {
        const nextRollup = await getAccountHealthRollupApi(token, account.id, { page_size: 10 })
        setApiRollup(nextRollup)
        saveApiRollupSnapshot(nextRollup)
      } else {
        saveLocalRollupSnapshot(account.id)
      }
      toast.success('Account health rollup snapshot saved')
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to save Account Health rollup snapshot'
      setApiError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  if (!rollup.contributions.length && loading) {
    return (
      <section className="tk-card p-5">
        <div className="flex items-center gap-3 text-sm font-semibold text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
          Loading Account Health rollup
        </div>
      </section>
    )
  }

  if (!rollup.contributions.length) {
    return (
      <section className="tk-card p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement contribution</p>
        <h3 className="mt-1 text-base font-semibold text-ink">No engagement metrics configured</h3>
        <p className="mt-2 text-sm text-ink-secondary">Create an active engagement and recalculate its health to include it in Account Health.</p>
      </section>
    )
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-surface-border bg-surface-secondary p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement contribution</p>
          <h3 className="mt-1 text-base font-semibold text-ink">Account Health rollup: {rollup.rollupScore}/100</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">{rollup.dirtyCount} engagement score{rollup.dirtyCount === 1 ? '' : 's'} marked dirty and excluded from contribution.</p>
          {apiError ? <p className="mt-2 text-xs font-semibold text-brand-orange">{apiError}</p> : null}
        </div>
        <button className="tk-button-secondary bg-white" disabled={loading} onClick={refreshRollup}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {loading ? 'Saving' : 'Snapshot'}
        </button>
      </div>
      <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg border border-surface-border bg-white p-3 md:grid-cols-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Filter className="h-4 w-4 text-brand-blue" />
              Filters
            </div>
            <select className="tk-input" value={sortKey} onChange={event => setSortKey(event.target.value as SortKey)}>
              <option value="score">Score</option>
              <option value="risk">Risk</option>
              <option value="freshness">Freshness</option>
              <option value="value">Value</option>
            </select>
            <select className="tk-input" value={dirtyFilter} onChange={event => setDirtyFilter(event.target.value as DirtyFilter)}>
              <option value="all">All freshness</option>
              <option value="dirty">Dirty only</option>
              <option value="clean">Clean only</option>
            </select>
            <select className="tk-input" value={ragFilter} onChange={event => setRagFilter(event.target.value as RagFilter)}>
              <option value="all">All RAG</option>
              <option value="green">Green</option>
              <option value="amber">Amber</option>
              <option value="red">Red</option>
              <option value="dirty">Dirty</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-surface-border bg-white">
            <div className="grid min-w-[560px] grid-cols-[minmax(220px,1fr)_100px_100px_120px] gap-3 border-b border-surface-border bg-surface-secondary px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
              <span>Engagement</span>
              <span>Score</span>
              <span>RAG</span>
              <span>Contribution</span>
            </div>
            {visible.map(item => (
              <div key={item.engagementId} className="grid min-w-[560px] grid-cols-[minmax(220px,1fr)_100px_100px_120px] gap-3 border-b border-surface-border px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.engagementName}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{formatCompactCurrency(item.value)} value</p>
                </div>
                <span className="text-sm font-semibold text-ink">{item.score ?? '-'}</span>
                <span className="text-sm font-semibold text-ink">{item.ragStatus}</span>
                <span className="text-sm font-semibold text-ink">{item.contributionToAccountHealth}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-lg border border-surface-border bg-white p-4">
          <p className="text-sm font-semibold text-ink">Historical snapshots</p>
          <div className="mt-3 space-y-2">
            {accountSnapshots.length ? accountSnapshots.map(snapshot => (
              <div key={snapshot.id} className="rounded-lg bg-surface-secondary p-3">
                <p className="text-sm font-semibold text-ink">{snapshot.rollupScore}/100</p>
                <p className="mt-1 text-xs text-ink-secondary">{formatDate(snapshot.createdAt)} | {snapshot.formulaVersion}</p>
              </div>
            )) : (
              <p className="rounded-lg bg-surface-secondary p-3 text-xs leading-5 text-ink-secondary">No snapshots saved in this session.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}

function contributionSortValue(item: EngagementContribution, sortKey: SortKey) {
  if (sortKey === 'score') return item.score ?? -1
  if (sortKey === 'risk') return { red: 4, dirty: 3, amber: 2, green: 1 }[item.ragStatus]
  if (sortKey === 'freshness') return item.freshness === 'current' ? 2 : item.freshness === 'dirty' ? 1 : 0
  return item.value
}
