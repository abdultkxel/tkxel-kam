import { Loader2, RefreshCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { ApiError } from '@/services/api'
import { recalculateEngagementHealthApi } from '@/services/engagements'
import { buildAccountHealthRollup, useV3Store } from '@/stores/v3Store'
import { EngagementRecord, HealthRagStatus } from '@/types/v3'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatRelative } from '@/utils/formatters'

export function EngagementHealthPanel({ engagement }: { engagement: EngagementRecord }) {
  const user = useRole()
  const { token } = useAuth()
  const engagements = useV3Store(state => state.engagements)
  const recalculateEngagementHealth = useV3Store(state => state.recalculateEngagementHealth)
  const setEngagementHealth = useV3Store(state => state.setEngagementHealth)
  const [loading, setLoading] = useState(false)
  const rollup = useMemo(() => buildAccountHealthRollup(engagements, engagement.accountId), [engagement.accountId, engagements])
  const contribution = rollup.contributions.find(item => item.engagementId === engagement.id)
  const health = engagement.health

  async function recalculate() {
    setLoading(true)
    try {
      const next = token
        ? await recalculateEngagementHealthApi(token, engagement.id)
        : recalculateEngagementHealth(engagement.id)
      if (!next) return
      if (token) setEngagementHealth(engagement.id, next)
      emitTimelineEvent({
        accountId: engagement.accountId,
        eventType: 'score_change',
        module: 'scoring',
        title: 'Engagement health recalculated',
        description: `${engagement.name} health is ${next.dirty ? 'dirty' : `${next.score}/100`} using ${next.formulaVersion}.`,
        performedBy: user.id,
        performedByName: user.name,
        sourceRecordId: engagement.id,
        sourceRecordType: 'engagement_health',
        sourceRecordRoute: `/engagements/${engagement.id}`,
        afterValue: { ...next },
        tags: ['engagement-health', next.ragStatus],
        isSensitive: false,
        isSystemGenerated: true,
        isImmutable: true,
        scoringVersion: next.formulaVersion,
      })
      toast.success(next.dirty ? 'Health marked dirty' : 'Engagement health recalculated')
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Unable to recalculate engagement health')
    } finally {
      setLoading(false)
    }
  }

  if (!health) {
    return (
      <section className="tk-card p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-1 h-5 w-5 text-brand-orange" />
          <div>
            <h3 className="text-base font-semibold text-ink">No metrics configured</h3>
            <p className="mt-1 text-sm text-ink-secondary">Publish an engagement health formula before recalculation.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-surface-border bg-surface-secondary p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement health</p>
          <h3 className="mt-1 text-base font-semibold text-ink">Score, drivers, freshness, and Account Health contribution</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">Dirty or draft scores stay visible here without contributing to account rollup.</p>
        </div>
        <button className="tk-button-primary" disabled={loading} onClick={recalculate}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Recalculate
        </button>
      </div>
      {loading ? (
        <div className="grid gap-4 p-5 md:grid-cols-4">
          {[0, 1, 2, 3].map(item => <div key={item} className="h-24 animate-pulse rounded-lg bg-surface-secondary" />)}
        </div>
      ) : (
        <>
          <div className="grid divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
            <HealthMetric label="Score" value={health.dirty ? 'Dirty' : `${health.score}/100`} rag={health.ragStatus} />
            <HealthMetric label="RAG" value={labelize(health.ragStatus)} rag={health.ragStatus} />
            <HealthMetric label="Freshness" value={labelize(health.freshness)} />
            <HealthMetric label="Contribution" value={`${contribution?.contributionToAccountHealth ?? 0}`} />
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_280px]">
            <div className="space-y-2">
              {health.drivers.map(driver => (
                <div key={driver} className="rounded-lg border border-surface-border bg-white p-3 text-sm text-ink-secondary">{driver}</div>
              ))}
            </div>
            <div className="rounded-lg border border-surface-border bg-white p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-blue" />
                <p className="text-sm font-semibold text-ink">Formula</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-secondary">{health.formulaVersion}</p>
              <p className="mt-3 text-xs leading-5 text-ink-secondary">
                {health.calculatedAt ? `Calculated ${formatRelative(health.calculatedAt)}` : 'Awaiting first recalculation'}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function HealthMetric({ label, value, rag }: { label: string; value: string; rag?: HealthRagStatus }) {
  const tone = rag === 'red' || rag === 'dirty'
    ? 'text-rag-red'
    : rag === 'amber'
      ? 'text-brand-orange'
      : rag === 'green'
        ? 'text-rag-green'
        : 'text-ink'
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold leading-none ${tone}`}>{value}</p>
    </div>
  )
}

function labelize(value: string) {
  return value.replace(/_/g, ' ')
}
