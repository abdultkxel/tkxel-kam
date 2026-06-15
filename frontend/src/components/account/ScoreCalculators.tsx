import { CalendarClock, Check, CheckCircle2, ChevronDown, ClipboardCheck, Info, Loader2, Play, Save, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { addTaskEvidence, listTasks, PlaybookTask, TaskPriority, TaskStatus, updateTask } from '@/services/playbooksTasks'
import { Account } from '@/types/account'
import { ScoreActivityEvidence, ScoreActivityTask, ScoreCalculatorId } from '@/types/scoreActivity'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatters'

type ScoreScale = 3 | 5

type ScoreOption = {
  value: number
  label: string
}

type ScoreCriterion = {
  id: string
  name: string
  weight: number
  tooltip: string
  options?: ScoreOption[]
}

type CalculatorDefinition = {
  id: ScoreCalculatorId
  title: string
  scale: ScoreScale
  criteria: ScoreCriterion[]
}

type CalculatorSelections = Record<ScoreCalculatorId, Record<string, number | undefined>>
type ScoreActivityApiTask = ScoreActivityTask & { apiTask: PlaybookTask }

export type ScoreCalculatorSummary = {
  relationship: number
  contract: number
  resource: number
  csat: number
  risk: number
  overallLegacyScore: number
  legacyOverall: number
  projectedOverall: number
  platformHealth: {
    overall: number
    relationship: number
    usage: number
    delivery: number
    commercial: number
  }
  serviceCoverage: number
  selectedServiceLines: string[]
  selections: CalculatorSelections
  activityEvidence: ScoreActivityEvidence[]
}

const scaleThreeOptions: ScoreOption[] = [
  { value: 1, label: '1 - Low' },
  { value: 2, label: '2 - Medium' },
  { value: 3, label: '3 - High' },
]

const scaleFiveOptions: ScoreOption[] = [
  { value: 1, label: '1 - Very Poor' },
  { value: 2, label: '2 - Poor' },
  { value: 3, label: '3 - Average' },
  { value: 4, label: '4 - Good' },
  { value: 5, label: '5 - Excellent' },
]

const calculators: CalculatorDefinition[] = [
  {
    id: 'relationship',
    title: 'Relationship Health',
    scale: 3,
    criteria: [
      {
        id: 'ceo',
        name: 'CEO Engagement',
        weight: 20,
        tooltip: 'Measures direct access to client CEO/MD. Regular means monthly+, occasional means quarterly.',
        options: [
          { value: 3, label: 'Regular 1:1 access' },
          { value: 2, label: 'Occasional contact' },
          { value: 0, label: 'No engagement' },
        ],
      },
      {
        id: 'kam',
        name: 'KAM Engagement',
        weight: 30,
        tooltip: "Quality of Key Account Manager's relationship with client stakeholders.",
        options: [
          { value: 3, label: 'Strong strategic partner' },
          { value: 2, label: 'Good operational relationship' },
          { value: 0, label: 'Transactional only' },
        ],
      },
      {
        id: 'delivery',
        name: 'Delivery Leadership',
        weight: 25,
        tooltip: "Client's perception of tkxel delivery leads: trusted advisor vs. vendor.",
        options: [
          { value: 3, label: 'Trusted advisor' },
          { value: 2, label: 'Respected partner' },
          { value: 0, label: 'Vendor only' },
        ],
      },
      {
        id: 'finance',
        name: 'Finance Connection',
        weight: 5,
        tooltip: 'Whether tkxel has a direct relationship with client finance or procurement.',
        options: [
          { value: 3, label: 'Direct finance contact' },
          { value: 0, label: 'No finance contact' },
        ],
      },
      {
        id: 'inperson',
        name: 'In-Person Meeting',
        weight: 20,
        tooltip: 'Whether an in-person meeting has occurred in the last quarter.',
        options: [
          { value: 3, label: 'Recent in-person meeting' },
          { value: 0, label: 'No recent in-person' },
        ],
      },
    ],
  },
  {
    id: 'contract',
    title: 'Contract Health',
    scale: 3,
    criteria: [
      {
        id: 'length',
        name: 'Contract Length',
        weight: 33,
        tooltip: 'Time remaining on the current contract term.',
        options: [
          { value: 3, label: '>24 months remaining' },
          { value: 2, label: '12-24 months' },
          { value: 1, label: '<12 months' },
        ],
      },
      {
        id: 'notice',
        name: 'Notice Period',
        weight: 33,
        tooltip: 'Required notice period for contract termination.',
        options: [
          { value: 3, label: '>90 days notice' },
          { value: 2, label: '30-90 days' },
          { value: 1, label: '<30 days' },
        ],
      },
      {
        id: 'renewal',
        name: 'Renewal Terms',
        weight: 33,
        tooltip: 'Whether the contract auto-renews and under what terms.',
        options: [
          { value: 3, label: 'Auto-renew with uplift' },
          { value: 2, label: 'Auto-renew flat' },
          { value: 0, label: 'No auto-renew' },
        ],
      },
    ],
  },
  {
    id: 'resource',
    title: 'Resource Health',
    scale: 3,
    criteria: [
      {
        id: 'keyres',
        name: 'Number of Key Resources',
        weight: 50,
        tooltip: 'Count of critical resources assigned to the account.',
        options: [
          { value: 3, label: '5+ key resources' },
          { value: 2, label: '3-4 key resources' },
          { value: 0, label: '<3 key resources' },
        ],
      },
      {
        id: 'alignment',
        name: 'Key Resource Alignment',
        weight: 25,
        tooltip: 'How well key resources are culturally and operationally aligned with tkxel.',
        options: [
          { value: 3, label: 'Fully aligned and embedded' },
          { value: 2, label: 'Partially aligned' },
          { value: 1, label: 'Loosely aligned' },
        ],
      },
      {
        id: 'backup',
        name: 'Backup',
        weight: 25,
        tooltip: 'Whether documented backup plans exist for key resources.',
        options: [
          { value: 1, label: 'Backup plan exists' },
          { value: 0, label: 'No backup plan' },
        ],
      },
    ],
  },
  {
    id: 'csat',
    title: 'CSAT Score',
    scale: 5,
    criteria: [
      { id: 'delivery_ex', name: 'Delivery Excellence', weight: 30, tooltip: 'Quality and timeliness of deliverables.' },
      { id: 'communication', name: 'Communication', weight: 20, tooltip: 'Responsiveness, clarity, and proactiveness in communication.' },
      { id: 'proactiveness', name: 'Proactiveness', weight: 15, tooltip: 'Anticipating client needs and suggesting improvements.' },
      { id: 'trust', name: 'Trust', weight: 20, tooltip: 'Level of trust and confidence the client has in tkxel.' },
      { id: 'value', name: 'Value for Money', weight: 15, tooltip: 'Perceived value relative to cost.' },
    ],
  },
  {
    id: 'risk',
    title: 'Risk Score',
    scale: 3,
    criteria: [
      {
        id: 'competitors',
        name: 'Competitors',
        weight: 30,
        tooltip: 'Whether tkxel faces competition on this account.',
        options: [
          { value: 3, label: 'No competitors on this account' },
          { value: 0, label: '1 or more competitors on this account' },
        ],
      },
      {
        id: 'leadership_tenure',
        name: 'Current Leadership Tenure',
        weight: 15,
        tooltip: 'How long client leadership is expected to remain stable.',
        options: [
          { value: 3, label: 'Aligned for 1+ year' },
          { value: 0, label: 'Aligned for less than 6 months' },
        ],
      },
      {
        id: 'funding_revenue',
        name: 'Funding & Revenue Changes',
        weight: 15,
        tooltip: "Stability of client's revenue stream and funding.",
        options: [
          { value: 3, label: 'Stable revenue for 1+ years' },
          { value: 0, label: 'Unaware of revenue information' },
        ],
      },
      {
        id: 'payment_behavior',
        name: 'Payment Behavior',
        weight: 15,
        tooltip: 'Timeliness and regularity of client payments.',
        options: [
          { value: 3, label: 'Invoices paid regularly' },
          { value: 2, label: 'Irregular payment schedule' },
          { value: 0, label: 'Invoices pending 2+ months' },
        ],
      },
      {
        id: 'roadmap_alignment',
        name: 'Roadmap Alignment',
        weight: 20,
        tooltip: "How well tkxel's plans align with the client's technology roadmap.",
        options: [
          { value: 3, label: 'Aligned for 1+ years' },
          { value: 2, label: 'Aligned for 6+ months' },
          { value: 0, label: 'Vaguely or not aligned' },
        ],
      },
      {
        id: 'geopolitical',
        name: 'Geopolitical Situation',
        weight: 5,
        tooltip: "Stability of the client's geopolitical environment.",
        options: [
          { value: 3, label: 'Stable geo-political situation' },
          { value: 0, label: 'Unstable geo-political situation' },
        ],
      },
    ],
  },
]

const serviceLines = [
  'Assessment & Strategy',
  'Business Analysis',
  'UX Design',
  'Solution Architecture & Design',
  'Development',
  'DevOps Service',
  'Functional Testing Service',
  'Performance Testing Service',
  'Security Testing Service',
  'Test Automation',
  'SRE Services',
  'L1 Support',
  'L2 Support',
  'L3 Support',
  'Salesforce Tech Support',
  'MS Dynamics Tech Support',
  'PeopleSoft Tech Support',
  'Hubspot Tech Support',
  'Monday.com Tech Support',
  'Jira Tech Support',
  'Data Engineering Services',
  'Data Analysis Services',
  'Data Science Services',
  'GenAI Services',
  'Architecture & Design Audit',
  'Security Audit',
  'Infrastructure Audit',
  'Code Audit',
  'Wordpress Tech Support',
  'Moodle Tech Support',
  'Discovery Workshop Service',
  'Mobile Development',
  'Web Development',
  'Digital Transformation',
  'AI Transformation',
  'Application Modernization',
  'Call Center Service',
  'NOC',
  'SOC',
  'Cyber Security Services',
  'GRC Services',
  'Cloud Optimization',
  'Cloud Migration Service',
  'Technology Upgradation',
  'Business Intelligence Service',
  'Staff Augmentation',
  'Handover Process (HOP)',
  'Automation Testing',
  'Mulesoft',
]

function nearestOption(value: number, options: ScoreOption[]) {
  return options.reduce((closest, option) => {
    const currentDistance = Math.abs(option.value - value)
    const closestDistance = Math.abs(closest.value - value)
    return currentDistance < closestDistance ? option : closest
  }, options[0]).value
}

function seedSelections(account: Account): CalculatorSelections {
  if (!account.hasHealthScore) {
    return calculators.reduce((state, calculator) => {
      state[calculator.id] = calculator.criteria.reduce<Record<string, number | undefined>>((criteriaState, criterion) => {
        criteriaState[criterion.id] = undefined
        return criteriaState
      }, {})
      return state
    }, {} as CalculatorSelections)
  }

  const seedByCalculator: Record<ScoreCalculatorId, number> = {
    relationship: account.health.relationship / 100 * 3,
    contract: account.health.commercial / 100 * 3,
    resource: account.health.delivery / 100 * 3,
    csat: account.health.usage / 100 * 5,
    risk: account.riskStatus === 'healthy' ? 3 : account.riskStatus === 'warning' ? 2 : 1,
  }

  return calculators.reduce((state, calculator) => {
    state[calculator.id] = calculator.criteria.reduce<Record<string, number | undefined>>((criteriaState, criterion) => {
      const options = criterion.options ?? (calculator.scale === 5 ? scaleFiveOptions : scaleThreeOptions)
      criteriaState[criterion.id] = nearestOption(seedByCalculator[calculator.id], options)
      return criteriaState
    }, {})
    return state
  }, {} as CalculatorSelections)
}

function weightedScore(calculator: CalculatorDefinition, selections: Record<string, number | undefined>) {
  let weighted = 0
  let totalWeight = 0

  for (const criterion of calculator.criteria) {
    const value = selections[criterion.id]
    if (value !== undefined) {
      weighted += value * (criterion.weight / 100)
      totalWeight += criterion.weight / 100
    }
  }

  return totalWeight > 0 ? Number((weighted / totalWeight).toFixed(2)) : 0
}

function toPercent(value: number, scale: ScoreScale) {
  return Math.round(Math.max(0, Math.min(100, (value / scale) * 100)))
}

function normalizeCsatToThreePoint(score: number) {
  return score > 0 ? ((score - 1) / 4) * 3 : 0
}

function labelFor(score: number, scale: ScoreScale) {
  if (scale === 5) {
    if (score >= 4.5) return { label: 'Excellent', className: 'bg-rag-green/10 text-rag-green border-rag-green/20' }
    if (score >= 4) return { label: 'Good', className: 'bg-rag-green/10 text-rag-green border-rag-green/20' }
    if (score >= 3) return { label: 'Stable', className: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20' }
    return { label: 'Needs attention', className: 'bg-rag-red/10 text-rag-red border-rag-red/20' }
  }

  if (score >= 2) return { label: 'Green', className: 'bg-rag-green/10 text-rag-green border-rag-green/20' }
  if (score > 1.5) return { label: 'Amber', className: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20' }
  return { label: 'Red', className: 'bg-rag-red/10 text-rag-red border-rag-red/20' }
}

function buildSummary(
  selections: CalculatorSelections,
  selectedServiceLines: string[],
  activityEvidence: ScoreActivityEvidence[],
): ScoreCalculatorSummary {
  const scores = calculators.reduce<Record<ScoreCalculatorId, number>>((state, calculator) => {
    state[calculator.id] = weightedScore(calculator, selections[calculator.id])
    return state
  }, {} as Record<ScoreCalculatorId, number>)
  const relationship = toPercent(scores.relationship, 3)
  const contract = toPercent(scores.contract, 3)
  const resource = toPercent(scores.resource, 3)
  const csat = toPercent(scores.csat, 5)
  const csatNormalized = normalizeCsatToThreePoint(scores.csat)
  const overallLegacyScore = Number(((scores.relationship + scores.contract + scores.resource + csatNormalized) / 4).toFixed(2))
  const projectedOverall = Math.round((overallLegacyScore / 3) * 100)

  return {
    relationship: scores.relationship,
    contract: scores.contract,
    resource: scores.resource,
    csat: scores.csat,
    risk: scores.risk,
    overallLegacyScore,
    legacyOverall: overallLegacyScore,
    projectedOverall,
    platformHealth: {
      overall: projectedOverall,
      relationship,
      usage: csat,
      delivery: resource,
      commercial: contract,
    },
    serviceCoverage: Math.round((selectedServiceLines.length / serviceLines.length) * 100),
    selectedServiceLines,
    selections,
    activityEvidence,
  }
}

export function ScoreCalculators({
  account,
  saving,
  onApply,
}: {
  account: Account
  saving: boolean
  onApply: (summary: ScoreCalculatorSummary) => void
}) {
  const { token } = useAuth()
  const [taskRecords, setTaskRecords] = useState<PlaybookTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksError, setTasksError] = useState('')
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, string>>({})
  const [selections, setSelections] = useState<CalculatorSelections>(() => seedSelections(account))
  const [selectedServiceLines, setSelectedServiceLines] = useState<string[]>(() => serviceLines.slice(0, account.tags.length + 4))
  const [expandedCalculators, setExpandedCalculators] = useState<Record<ScoreCalculatorId, boolean>>({
    relationship: false,
    contract: false,
    resource: false,
    csat: false,
    risk: false,
  })
  const [serviceLinesExpanded, setServiceLinesExpanded] = useState(false)
  const [expandedActivityKeys, setExpandedActivityKeys] = useState<Record<string, boolean>>({})
  const loadTasks = useCallback(async () => {
    if (!token) {
      setTaskRecords([])
      setTasksLoading(false)
      return
    }
    setTasksLoading(true)
    setTasksError('')
    try {
      const params = new URLSearchParams({
        account_id: account.id,
        page: '1',
        page_size: '100',
        sort: 'due_at',
        direction: 'asc',
      })
      const result = await listTasks(token, params)
      setTaskRecords(result.items)
    } catch (err) {
      setTaskRecords([])
      setTasksError(err instanceof Error ? err.message : 'Score activity tasks could not load')
    } finally {
      setTasksLoading(false)
    }
  }, [account.id, token])
  const accountTasks = useMemo(
    () =>
      taskRecords
        .map(task => mapApiTaskToScoreActivity(task, account, evidenceDrafts[task.id]))
        .filter((task): task is ScoreActivityApiTask => Boolean(task)),
    [account, evidenceDrafts, taskRecords],
  )
  const activityEvidence = useMemo<ScoreActivityEvidence[]>(
    () =>
      accountTasks
        .filter(task => task.status === 'done' && task.completedAt && task.evidenceNote?.trim())
        .map(task => ({
          taskId: task.id,
          templateId: task.templateId,
          calculatorId: task.calculatorId,
          criterionId: task.criterionId,
          title: task.title,
          evidenceNote: task.evidenceNote?.trim() ?? '',
          completedAt: task.completedAt ?? new Date().toISOString(),
          sourceTimelineEntryId: task.sourceTimelineEntryId,
        })),
    [accountTasks],
  )
  const summary = useMemo(() => buildSummary(selections, selectedServiceLines, activityEvidence), [activityEvidence, selectedServiceLines, selections])

  useEffect(() => {
    setSelections(seedSelections(account))
  }, [account.hasHealthScore, account.health.commercial, account.health.delivery, account.health.relationship, account.health.usage, account.id, account.riskStatus])

  useEffect(() => {
    setEvidenceDrafts({})
    void loadTasks()
  }, [loadTasks])

  function setScore(calculatorId: ScoreCalculatorId, criterionId: string, value: string) {
    setSelections(current => ({
      ...current,
      [calculatorId]: {
        ...current[calculatorId],
        [criterionId]: value === '' ? undefined : Number(value),
      },
    }))
  }

  function toggleServiceLine(serviceLine: string) {
    setSelectedServiceLines(current =>
      current.includes(serviceLine) ? current.filter(item => item !== serviceLine) : [...current, serviceLine],
    )
  }

  function toggleCalculator(calculatorId: ScoreCalculatorId) {
    setExpandedCalculators(current => ({
      ...current,
      [calculatorId]: !current[calculatorId],
    }))
  }

  function toggleActivities(key: string) {
    setExpandedActivityKeys(current => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function updateEvidence(taskId: string, evidenceNote: string) {
    setEvidenceDrafts(current => ({ ...current, [taskId]: evidenceNote }))
  }

  async function persistTask(taskId: string, payload: Partial<Pick<PlaybookTask, 'status' | 'notes' | 'outcome' | 'skipped_reason'>>) {
    if (!token) throw new Error('You must be logged in to update score activity tasks')
    const updated = await updateTask(token, taskId, payload)
    setTaskRecords(current => current.map(item => (item.id === updated.id ? updated : item)))
    return updated
  }

  async function startTask(task: ScoreActivityApiTask) {
    try {
      await persistTask(task.id, { status: 'in_progress' })
      toast.success('Score activity moved to in progress')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Score activity could not be started')
    }
  }

  async function completeTask(task: ScoreActivityApiTask) {
    const evidenceNote = task.evidenceNote?.trim() || `Evidence captured for ${task.title}.`
    try {
      if (!token) throw new Error('You must be logged in to complete score activity tasks')
      await addTaskEvidence(token, task.id, { evidence_type: 'note', title: 'Score activity evidence', body: evidenceNote })
      const updated = await updateTask(token, task.id, { status: 'done', notes: evidenceNote, outcome: evidenceNote })
      setTaskRecords(current => current.map(item => (item.id === updated.id ? updated : item)))
      setEvidenceDrafts(current => {
        const next = { ...current }
        delete next[task.id]
        return next
      })
      toast.success('Score activity completed and saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Score activity could not be completed')
    }
  }

  async function skipTask(task: ScoreActivityApiTask) {
    try {
      await persistTask(task.id, {
        status: 'cancelled',
        skipped_reason: task.evidenceNote?.trim() || task.skippedReason || 'Cancelled during score review.',
      })
      toast.success('Score activity cancelled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Score activity could not be cancelled')
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="score-calculators-heading">
      <div className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Calculator inputs</p>
          <h3 id="score-calculators-heading" className="mt-1 text-base font-semibold text-ink">Score calculators</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
            Previous model formula: Relationship, Contract, Resource, and normalized CSAT calculate the overall score. Risk and Service Coverage remain visible indicators.
          </p>
        </div>
        <div className="grid gap-0 divide-y divide-surface-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <ScoreSummary label="Overall score" value={`${summary.overallLegacyScore.toFixed(2)} / 3`} />
          <ScoreSummary label="Projected health" value={`${summary.projectedOverall} / 100`} />
          <ScoreSummary label="Risk indicator" value={`${summary.risk.toFixed(2)} / 3`} />
          <ScoreSummary label="Service coverage" value={`${summary.serviceCoverage}%`} />
        </div>
      </div>

      {tasksLoading ? (
        <div className="inline-flex items-center gap-2 rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-xs font-semibold text-ink-secondary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading score activity tasks
        </div>
      ) : null}

      {tasksError ? (
        <div className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-xs font-semibold text-rag-red">
          {tasksError}
        </div>
      ) : null}

      <div className="space-y-4">
        {calculators.map(calculator => {
          const score = weightedScore(calculator, selections[calculator.id])
          const status = labelFor(score, calculator.scale)
          const options = calculator.scale === 5 ? scaleFiveOptions : scaleThreeOptions
          const calculatorTasks = accountTasks.filter(task => task.calculatorId === calculator.id)
          const completedTasks = calculatorTasks.filter(task => task.status === 'done').length
          const expanded = expandedCalculators[calculator.id]

          return (
            <article key={calculator.id} className="tk-card overflow-hidden">
              <button
                type="button"
                className="flex min-h-[64px] w-full flex-col gap-3 border-b border-surface-border bg-surface-secondary/70 px-4 py-4 text-left transition-colors hover:bg-surface-tertiary sm:flex-row sm:items-center sm:justify-between"
                onClick={() => toggleCalculator(calculator.id)}
                aria-expanded={expanded}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                    <Info className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-ink">{calculator.title}</h4>
                    <p className="mt-1 text-xs text-ink-secondary">{calculator.criteria.length} criteria, 1-{calculator.scale} scale</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${status.className}`}>
                    {status.label}
                  </span>
                  <span className="rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-semibold text-ink">
                    {score.toFixed(2)} / {calculator.scale}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
                    <ClipboardCheck className="h-3 w-3" />
                    {completedTasks}/{calculatorTasks.length} evidence
                  </span>
                  <ChevronDown className={cn('h-4 w-4 text-ink-secondary transition-transform', expanded && 'rotate-180')} />
                </div>
              </button>

              {expanded ? (
                <div className="divide-y divide-surface-border">
                  {calculator.criteria.map(criterion => {
                    const criterionOptions = criterion.options ?? options
                    const selected = selections[calculator.id][criterion.id]
                    const criterionTasks = accountTasks.filter(task => task.calculatorId === calculator.id && task.criterionId === criterion.id)
                    const activityKey = `${calculator.id}-${criterion.id}`

                    return (
                      <div key={criterion.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(220px,1fr)_minmax(240px,320px)_minmax(220px,280px)] lg:items-start">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{criterion.name}</p>
                            <span title={criterion.tooltip} role="img" aria-label={criterion.tooltip}>
                              <Info className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" aria-hidden="true" />
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-ink-secondary">{criterion.weight}% weight</p>
                        </div>
                        <label className="space-y-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Score selection</span>
                          <select
                            className="tk-input"
                            value={selected ?? ''}
                            onChange={event => setScore(calculator.id, criterion.id, event.target.value)}
                            aria-label={`${calculator.title} ${criterion.name}`}
                          >
                            <option value="">Select score</option>
                            {criterionOptions.map(option => (
                              <option key={`${criterion.id}-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <CriterionActivities
                          tasks={criterionTasks}
                          expanded={Boolean(expandedActivityKeys[activityKey])}
                          onToggle={() => toggleActivities(activityKey)}
                          onEvidenceChange={updateEvidence}
                          onStart={startTask}
                          onComplete={completeTask}
                          onSkip={skipTask}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      <section className="tk-card overflow-hidden">
        <button
          type="button"
          className="flex min-h-[64px] w-full flex-col gap-3 bg-surface-secondary/70 px-5 py-4 text-left transition-colors hover:bg-surface-tertiary sm:flex-row sm:items-center sm:justify-between"
          onClick={() => setServiceLinesExpanded(current => !current)}
          aria-expanded={serviceLinesExpanded}
        >
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-ink">Service line mapping</h4>
            <p className="mt-1 text-sm text-ink-secondary">{selectedServiceLines.length} of {serviceLines.length} mapped to this account.</p>
          </div>
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-[32px] items-center rounded-md border border-blue-tint-20 bg-blue-tint-20 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
              {summary.serviceCoverage}% coverage
            </span>
            <ChevronDown className={cn('h-4 w-4 text-ink-secondary transition-transform', serviceLinesExpanded && 'rotate-180')} />
          </span>
        </button>
        {serviceLinesExpanded ? (
          <div className="border-t border-surface-border p-5">
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="tk-button-secondary" onClick={() => setSelectedServiceLines(serviceLines)}>
                Select all
              </button>
              <button type="button" className="tk-button-secondary" onClick={() => setSelectedServiceLines([])}>
                Clear
              </button>
            </div>
            <div className="mt-4 grid max-h-[320px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {serviceLines.map(serviceLine => {
                const selected = selectedServiceLines.includes(serviceLine)

                return (
                  <button
                    key={serviceLine}
                    type="button"
                    className={`flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      selected
                        ? 'border-brand-blue bg-blue-tint-20 text-brand-blue'
                        : 'border-surface-border bg-surface-secondary text-ink-secondary hover:bg-surface-tertiary hover:text-ink'
                    }`}
                    onClick={() => toggleServiceLine(serviceLine)}
                    aria-pressed={selected}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${selected ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border bg-white'}`}>
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span>{serviceLine}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </section>

      <section className="tk-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Save health scores</p>
            <p className="mt-1 text-sm text-ink-secondary">
              Updates the account score and records the calculator breakdown plus completed activity evidence in the timeline.
            </p>
          </div>
          <button className="tk-button-primary shrink-0" disabled={saving} onClick={() => onApply(summary)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save calculator scores
          </button>
        </div>
      </section>
    </section>
  )
}

function ScoreSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-secondary">{label}</p>
      <p className="font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

function CriterionActivities({
  tasks,
  expanded,
  onToggle,
  onEvidenceChange,
  onStart,
  onComplete,
  onSkip,
}: {
  tasks: ScoreActivityApiTask[]
  expanded: boolean
  onToggle: () => void
  onEvidenceChange: (taskId: string, evidenceNote: string) => void
  onStart: (task: ScoreActivityApiTask) => void
  onComplete: (task: ScoreActivityApiTask) => void
  onSkip: (task: ScoreActivityApiTask) => void
}) {
  if (!tasks.length) {
    return (
      <div className="rounded-md border border-dashed border-surface-border bg-surface-secondary px-3 py-2 text-xs leading-5 text-ink-secondary">
        No score-linked activities are configured for this criterion.
      </div>
    )
  }

  const completed = tasks.filter(task => task.status === 'done').length

  return (
    <div className="rounded-md border border-surface-border bg-surface-secondary">
      <button
        type="button"
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-tertiary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
          <ClipboardCheck className="h-4 w-4 text-brand-blue" />
          Evidence
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
            {completed}/{tasks.length}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-ink-secondary transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>
      {expanded ? (
        <div className="divide-y divide-surface-border border-t border-surface-border px-3">
          {tasks.map(task => {
            const locked = task.status === 'done' || task.status === 'cancelled'

            return (
              <div key={task.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', statusClass(task.status))}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className={cn('rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink">{task.title}</p>
                    <p className="mt-1 text-xs leading-5 text-ink-secondary">{task.description}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-secondary">
                      <CalendarClock className="h-3.5 w-3.5 text-brand-orange" />
                      Due {formatDate(task.dueDate)} by {task.ownerName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {task.status === 'open' ? (
                      <button type="button" className="tk-button-secondary px-3" onClick={() => onStart(task)}>
                        <Play className="h-4 w-4" />
                        Start
                      </button>
                    ) : null}
                    {task.status !== 'done' && task.status !== 'cancelled' ? (
                      <button type="button" className="tk-button-primary px-3" onClick={() => onComplete(task)}>
                        <CheckCircle2 className="h-4 w-4" />
                        Complete
                      </button>
                    ) : null}
                    {task.status !== 'done' && task.status !== 'cancelled' ? (
                      <button type="button" className="tk-button-secondary px-3 text-brand-orange" onClick={() => onSkip(task)}>
                        <XCircle className="h-4 w-4" />
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="mt-3 block space-y-1">
                  <span className="text-xs font-semibold text-ink-secondary">Evidence note</span>
                  <textarea
                    className="tk-input min-h-[76px]"
                    value={task.status === 'cancelled' ? task.skippedReason ?? task.evidenceNote ?? '' : task.evidenceNote ?? ''}
                    onChange={event => onEvidenceChange(task.id, event.target.value)}
                    disabled={locked}
                    placeholder="Add the client signal, document reference, or decision that supports this score."
                  />
                </label>
                {task.status === 'done' ? (
                  <p className="mt-2 text-xs font-medium text-rag-green">Completed evidence will be included in the next saved score event.</p>
                ) : null}
                {task.status === 'cancelled' ? (
                  <p className="mt-2 text-xs font-medium text-brand-orange">{task.skippedReason ?? 'Cancelled activity retained for audit.'}</p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function statusClass(status: ScoreActivityTask['status']) {
  if (status === 'done') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'in_progress') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  if (status === 'cancelled') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function priorityClass(priority: ScoreActivityTask['priority']) {
  if (priority === 'high') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (priority === 'medium') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function mapApiTaskToScoreActivity(task: PlaybookTask, account: Account, draftEvidence?: string): ScoreActivityApiTask | null {
  const custom = task.custom_field_values ?? {}
  const calculatorId = toScoreCalculatorId(custom.calculator_id ?? custom.calculatorId ?? task.source_metric)
  const criterionId = toStringValue(custom.criterion_id ?? custom.criterionId ?? (task.source_type === 'score_activity' ? task.source_record_id : undefined))
  if (!calculatorId || !criterionId) return null

  const latestEvidence = task.evidence[0]
  const evidenceNote = draftEvidence ?? latestEvidence?.body ?? task.outcome ?? task.notes ?? undefined

  return {
    id: task.id,
    templateId: task.template_activity_id ?? task.source_record_id ?? task.id,
    accountId: task.account_id,
    accountName: account.name,
    ownerId: task.owner_id ?? '',
    ownerName: task.owner_name,
    calculatorId,
    criterionId,
    title: task.title,
    description: task.description ?? '',
    dueDate: task.due_at,
    status: mapTaskStatus(task.status),
    priority: mapTaskPriority(task.priority),
    evidenceNote,
    completedAt: task.completed_at ?? undefined,
    skippedReason: task.skipped_reason ?? undefined,
    sourceTimelineEntryId: latestEvidence?.id,
    createdAt: task.created_at,
    apiTask: task,
  }
}

function toScoreCalculatorId(value: unknown): ScoreCalculatorId | undefined {
  if (value === 'relationship' || value === 'contract' || value === 'resource' || value === 'csat' || value === 'risk') return value
  return undefined
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function mapTaskStatus(status: TaskStatus): ScoreActivityTask['status'] {
  if (status === 'done') return 'done'
  if (status === 'in_progress') return 'in_progress'
  if (status === 'blocked') return 'blocked'
  if (status === 'cancelled' || status === 'skipped') return 'cancelled'
  return 'open'
}

function mapTaskPriority(priority: TaskPriority): ScoreActivityTask['priority'] {
  if (priority === 'critical' || priority === 'urgent') return 'critical'
  if (priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  return 'low'
}
