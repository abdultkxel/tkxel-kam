import { BarChart3, Bot, FileSearch, Mic2, Sparkles, TrendingUp } from 'lucide-react'
import { Account } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { ScoreActivityTask } from '@/types/scoreActivity'
import { SignalRecord } from '@/types/v3'
import { useUIStore } from '@/stores/uiStore'
import { formatCompactCurrency } from '@/utils/formatters'

type Props = {
  accounts: Account[]
  opportunities: Opportunity[]
  tasks: ScoreActivityTask[]
  signals: SignalRecord[]
}

const prompts = [
  { label: 'Voice brief', icon: Mic2, query: 'Prepare a spoken QBR brief for my highest-risk account' },
  { label: 'Document search', icon: FileSearch, query: 'Find renewal clauses and notice deadlines in attached SOW documents' },
  { label: 'Forecast chart', icon: BarChart3, query: 'Forecast portfolio ARR and health for the next 6 months' },
]

export function V4IntelligenceLayer({ accounts, opportunities, tasks, signals }: Props) {
  const openAI = useUIStore(state => state.openAI)
  const openTasks = tasks.filter(task => !['done', 'skipped'].includes(task.status))
  const openSignals = signals.filter(signal => !['resolved', 'dismissed'].includes(signal.status))
  const attentionLoad = new Map<string, number>()
  openTasks.forEach(task => attentionLoad.set(task.accountName, (attentionLoad.get(task.accountName) ?? 0) + 1))
  openSignals.forEach(signal => attentionLoad.set(signal.accountName, (attentionLoad.get(signal.accountName) ?? 0) + 1))
  const primaryAccount = [...attentionLoad.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? accounts[0]?.name ?? 'Portfolio'
  const pipelineTotal = opportunities.filter(opp => !['Won', 'Lost'].includes(opp.stage)).reduce((sum, opp) => sum + opp.estimatedValue, 0)
  const criticalCount = openSignals.filter(signal => signal.severity === 'critical').length + openTasks.filter(task => task.priority === 'high').length
  const forecastBars = [62, 68, 73, 77, 82, 88]

  return (
    <section className="v4-glass v4-intelligence-panel">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue text-white shadow-card">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">V4 Intelligence Layer</p>
              <h2 className="font-display text-3xl font-bold leading-tight text-ink">Generative command center</h2>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-secondary">
            Ask, search, narrate, and chart account movement from one source-backed cockpit. The experience stays grounded in KYC, SOWs, timeline events, tasks, and governance records.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {prompts.map(prompt => (
              <button
                key={prompt.label}
                type="button"
                className="v4-command-tile group"
                onClick={() => openAI(prompt.query)}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue transition-transform duration-200 group-hover:-translate-y-0.5">
                  <prompt.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold text-ink">{prompt.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-secondary">{prompt.query}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="v4-holo-stage">
          <div className="v4-holo-card v4-holo-card-one">
            <span>Pipeline</span>
            <strong>{formatCompactCurrency(pipelineTotal)}</strong>
          </div>
          <div className="v4-holo-card v4-holo-card-two">
            <span>Attention</span>
            <strong>{criticalCount}</strong>
          </div>
          <div className="v4-holo-card v4-holo-card-three">
            <span>Focus</span>
            <strong>{primaryAccount}</strong>
          </div>
          <div className="v4-forecast-ridge">
            {forecastBars.map((value, index) => (
              <span key={index} style={{ height: `${value}%` }} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-tint-20 bg-blue-tint-20 px-3 py-2 text-xs font-semibold text-brand-blue">
          <Sparkles className="h-4 w-4" />
          Source-backed synthesis
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-white/70 px-3 py-2 text-xs font-semibold text-ink-secondary">
          <TrendingUp className="h-4 w-4 text-brand-orange" />
          Predictive portfolio motion
        </span>
      </div>
    </section>
  )
}
