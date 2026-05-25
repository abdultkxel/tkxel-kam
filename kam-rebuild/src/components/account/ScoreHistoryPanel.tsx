import { GitCompare, LineChart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScoreStore } from '@/stores/scoreStore'
import { ScoreSnapshot } from '@/types/account'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'

function rowDelta(a: number, b: number) {
  const delta = b - a
  return `${delta >= 0 ? '+' : ''}${delta}`
}

export function ScoreHistoryPanel({ accountId }: { accountId: string }) {
  const snapshots = useScoreStore(state => state.snapshots)
  const accountSnapshots = useMemo(
    () => snapshots.filter(snapshot => snapshot.accountId === accountId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [accountId, snapshots],
  )
  const [selected, setSelected] = useState<string[]>([])
  const compare = selected.map(id => accountSnapshots.find(snapshot => snapshot.id === id)).filter(Boolean) as ScoreSnapshot[]
  const oldestFirst = [...accountSnapshots].reverse()

  function toggle(id: string) {
    setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [...current.slice(-1), id]))
  }

  return (
    <section className="tk-card p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Health Score Version History</p>
          <h3 className="text-base font-semibold text-ink">Snapshots and calculator changes</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          <LineChart className="h-4 w-4 text-brand-blue" />
          Dotted lines mark calculator version changes
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-surface-border p-4">
        <div className="flex h-28 items-end gap-3">
          {oldestFirst.map((snapshot, index) => {
            const previous = oldestFirst[index - 1]
            const changedVersion = previous && previous.calculatorVersion !== snapshot.calculatorVersion
            return (
              <div key={snapshot.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                {changedVersion ? (
                  <div className="flex h-full flex-col items-center justify-end">
                    <span className="mb-1 whitespace-nowrap text-[10px] font-semibold text-brand-orange">{previous.calculatorVersion} {'->'} {snapshot.calculatorVersion}</span>
                    <span className="h-20 border-l border-dashed border-brand-orange" />
                  </div>
                ) : (
                  <div className="w-full rounded-t-md bg-blue-tint-40" style={{ height: `${Math.max(20, snapshot.overall)}%` }} />
                )}
                <span className="text-[10px] text-ink-secondary">{formatDate(snapshot.timestamp)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        {accountSnapshots.map(snapshot => (
          <article key={snapshot.id} className="grid gap-3 rounded-lg border border-surface-border p-3 md:grid-cols-[120px_1fr_auto] md:items-center">
            <div className="flex h-12 items-end gap-1">
              {[snapshot.dimensions.relationship, snapshot.dimensions.usage, snapshot.dimensions.delivery, snapshot.dimensions.commercial].map((value, index) => (
                <span key={index} className="w-5 rounded-t-sm bg-brand-blue" style={{ height: `${Math.max(12, value / 2)}px` }} />
              ))}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-2xl font-bold text-ink">{snapshot.overall}</span>
                <span className="rounded-full bg-blue-tint-20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{snapshot.calculatorVersion}</span>
                <span className="text-xs text-ink-secondary">{formatRelative(snapshot.timestamp)}</span>
              </div>
              <p className="text-xs text-ink-secondary">Changed by {snapshot.changedByName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={cn('tk-button-secondary', selected.includes(snapshot.id) ? 'border-brand-blue text-brand-blue' : '')} onClick={() => toggle(snapshot.id)}>
                <GitCompare className="h-4 w-4" />
                Compare
              </button>
              <Link to={`/accounts/${accountId}?tab=timeline`} className="tk-button-secondary">Timeline</Link>
            </div>
          </article>
        ))}
      </div>

      {compare.length === 2 ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <tr>
                <th className="px-4 py-3">Dimension</th>
                <th className="px-4 py-3">{formatDate(compare[0].timestamp)}</th>
                <th className="px-4 py-3">{formatDate(compare[1].timestamp)}</th>
                <th className="px-4 py-3">Delta</th>
              </tr>
            </thead>
            <tbody>
              {['overall', 'relationship', 'usage', 'delivery', 'commercial'].map(key => {
                const first = key === 'overall' ? compare[0].overall : compare[0].dimensions[key]
                const second = key === 'overall' ? compare[1].overall : compare[1].dimensions[key]
                const changed = first !== second
                return (
                  <tr key={key} className="border-t border-surface-border">
                    <td className="px-4 py-3 font-medium capitalize text-ink">{key}</td>
                    <td className={cn('px-4 py-3', changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{first}</td>
                    <td className={cn('px-4 py-3', changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{second}</td>
                    <td className={cn('px-4 py-3', changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{rowDelta(first, second)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
