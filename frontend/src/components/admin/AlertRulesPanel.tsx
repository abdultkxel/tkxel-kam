import * as Switch from '@radix-ui/react-switch'
import { AlertTriangle, Eye, Loader2, Save, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { AlertRule, AlertRulePreview, getAlertRules, previewAlertRule, updateAlertRule } from '@/services/alerts'
import { cn } from '@/utils/cn'

const severityClass: Record<string, string> = {
  critical: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
  high: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
  medium: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
  low: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
}

type RuleDraft = Pick<AlertRule, 'is_active' | 'threshold_value' | 'severity' | 'snooze_days' | 'recipient_policy' | 'escalation_enabled'>

function draftFromRule(rule: AlertRule): RuleDraft {
  return {
    is_active: rule.is_active,
    threshold_value: rule.threshold_value,
    severity: rule.severity,
    snooze_days: rule.snooze_days,
    recipient_policy: rule.recipient_policy,
    escalation_enabled: rule.escalation_enabled,
  }
}

export function AlertRulesPanel() {
  const { token } = useAuth()
  const [rules, setRules] = useState<AlertRule[]>([])
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({})
  const [preview, setPreview] = useState<AlertRulePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState('')
  const [previewingId, setPreviewingId] = useState('')
  const [error, setError] = useState('')
  const activeCount = useMemo(() => rules.filter(rule => rule.is_active).length, [rules])
  const previewRuleName = useMemo(() => {
    if (!preview) return ''
    return rules.find(rule => rule.id === preview.rule_id)?.name ?? preview.rule_key.replace(/_/g, ' ')
  }, [preview, rules])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getAlertRules(token)
      .then(items => {
        if (!active) return
        setRules(items)
        setDrafts(Object.fromEntries(items.map(rule => [rule.id, draftFromRule(rule)])))
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Alert rules could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  function updateDraft(ruleId: string, patch: Partial<RuleDraft>) {
    setDrafts(items => ({ ...items, [ruleId]: { ...items[ruleId], ...patch } }))
    setFieldErrors(items => ({ ...items, [ruleId]: {} }))
  }

  async function saveRule(rule: AlertRule) {
    if (!token) return
    const draft = drafts[rule.id]
    setSavingId(rule.id)
    setFieldErrors(items => ({ ...items, [rule.id]: {} }))
    try {
      const saved = await updateAlertRule(token, rule.id, draft)
      setRules(items => items.map(item => (item.id === saved.id ? saved : item)))
      setDrafts(items => ({ ...items, [saved.id]: draftFromRule(saved) }))
      toast.success('Alert rule saved')
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(items => ({ ...items, [rule.id]: Object.fromEntries(err.fieldErrors.map(error => [error.field, error.message])) }))
      }
      toast.error(err instanceof Error ? err.message : 'Alert rule could not be saved')
    } finally {
      setSavingId('')
    }
  }

  async function previewRule(rule: AlertRule) {
    if (!token) return
    setPreviewingId(rule.id)
    try {
      setPreview(await previewAlertRule(token, rule.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Alert rule preview failed')
    } finally {
      setPreviewingId('')
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Backend-owned alerts</p>
            <h2 className="text-base font-semibold text-ink">Alert Rules</h2>
          </div>
          <span className="rounded-full border border-surface-border bg-surface-tertiary px-3 py-1 text-xs font-semibold text-ink-secondary">{activeCount}/{rules.length} active</span>
        </div>
      </div>

      {loading ? <div className="flex items-center gap-2 p-5 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading alert rules</div> : null}
      {!loading && error ? <div className="p-5"><EmptyState icon={AlertTriangle} heading="Alert rules unavailable" body={error} /></div> : null}

      {!loading && !error ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <tr>
                <th className="px-4 py-3">Alert type</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Escalate</th>
                <th className="px-4 py-3">Snooze</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const draft = drafts[rule.id] ?? draftFromRule(rule)
                const errors = fieldErrors[rule.id] ?? {}
                return (
                  <tr key={rule.id} className="border-b border-surface-border last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{rule.name}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{rule.source_type.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid gap-1">
                        <div className="flex items-center gap-2">
                          <input className="tk-input max-w-[120px]" type="number" min={0} value={draft.threshold_value} onChange={event => updateDraft(rule.id, { threshold_value: Number(event.target.value) })} />
                          <span className="text-xs font-semibold text-ink-secondary">{rule.threshold_unit}</span>
                        </div>
                        {errors.threshold_value ? <p className="text-xs font-semibold text-rag-red">{errors.threshold_value}</p> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select className={cn('tk-input border', severityClass[draft.severity])} value={draft.severity} onChange={event => updateDraft(rule.id, { severity: event.target.value as AlertRule['severity'] })}>
                        <option value="critical">critical</option>
                        <option value="high">high</option>
                        <option value="medium">medium</option>
                        <option value="low">low</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <select className="tk-input" value={draft.recipient_policy} onChange={event => updateDraft(rule.id, { recipient_policy: event.target.value })}>
                        <option value="source_owner_first">Source owner first</option>
                        <option value="account_owner_first">Account owner first</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Switch.Root checked={draft.escalation_enabled} onCheckedChange={escalation_enabled => updateDraft(rule.id, { escalation_enabled })} className="relative min-h-[44px] w-11 rounded-full bg-transparent after:absolute after:left-0 after:top-1/2 after:h-6 after:w-11 after:-translate-y-1/2 after:rounded-full after:bg-surface-border data-[state=checked]:after:bg-brand-blue">
                        <Switch.Thumb className="absolute left-0 top-1/2 z-10 block h-5 w-5 translate-x-0.5 -translate-y-1/2 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
                      </Switch.Root>
                    </td>
                    <td className="px-4 py-3">
                      <input className="tk-input max-w-[110px]" type="number" min={0} value={draft.snooze_days} onChange={event => updateDraft(rule.id, { snooze_days: Number(event.target.value) })} />
                    </td>
                    <td className="px-4 py-3">
                      <Switch.Root checked={draft.is_active} onCheckedChange={is_active => updateDraft(rule.id, { is_active })} className="relative min-h-[44px] w-11 rounded-full bg-transparent after:absolute after:left-0 after:top-1/2 after:h-6 after:w-11 after:-translate-y-1/2 after:rounded-full after:bg-surface-border data-[state=checked]:after:bg-brand-blue">
                        <Switch.Thumb className="absolute left-0 top-1/2 z-10 block h-5 w-5 translate-x-0.5 -translate-y-1/2 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
                      </Switch.Root>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="tk-button-secondary" onClick={() => previewRule(rule)} disabled={previewingId === rule.id}>
                          {previewingId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          Preview
                        </button>
                        <button className="tk-button-primary" onClick={() => saveRule(rule)} disabled={savingId === rule.id}>
                          {savingId === rule.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview ? <RulePreviewDrawer preview={preview} ruleName={previewRuleName} onClose={() => setPreview(null)} /> : null}
    </section>
  )
}

function RulePreviewDrawer({ preview, ruleName, onClose }: { preview: AlertRulePreview; ruleName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/30" role="dialog" aria-modal="true" aria-label="Alert rule preview">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-surface-border bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Rule preview</p>
            <h3 className="mt-1 text-lg font-bold text-ink">{ruleName}</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              {preview.total_matches} preview match{preview.total_matches === 1 ? '' : 'es'}
            </p>
          </div>
          <button className="tk-icon-button" onClick={onClose} aria-label="Close rule preview">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {preview.sample.length ? (
            <div className="grid gap-3">
              {preview.sample.map(item => (
                <div key={`${item.source_record_type}-${item.source_record_id}`} className="rounded-md border border-surface-border bg-surface-secondary p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{item.severity}</span>
                    <span className="text-xs font-semibold text-brand-blue">{item.source_record_type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">{item.detail}</p>
                  <p className="mt-2 text-xs font-medium text-ink-secondary">{item.account_name ?? 'Unmapped account'}</p>
                  {item.evidence.length ? (
                    <div className="mt-3 grid gap-2">
                      {item.evidence.slice(0, 4).map((evidence, index) => (
                        <div key={`${item.source_record_id}-evidence-${index}`} className="rounded border border-surface-border bg-white p-2 text-xs text-ink-secondary">
                          {Object.entries(evidence).map(([key, value]) => (
                            <p key={key}><span className="font-semibold text-ink">{key.replace(/_/g, ' ')}:</span> {formatEvidenceValue(value)}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Eye} heading="No preview matches" body="This rule does not currently match any persisted records." className="py-12" />
          )}
        </div>
      </aside>
    </div>
  )
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}
