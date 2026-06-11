import { BellRing, Loader2, Play, Plus, RotateCcw, Save, Send, ShieldAlert } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  createSlaRule,
  dryRunNotificationScheduler,
  evaluateSla,
  getNotificationDefaults,
  getNotificationSchedulerRuns,
  getSlaRules,
  NotificationTriggerConfig,
  resetNotificationTrigger,
  sendTestNotification,
  SlaRule,
  updateNotificationDefaults,
  updateNotificationTrigger,
  updateSlaRule,
} from '@/services/notificationsReporting'

interface SchedulerRunRow {
  id: string
  job_type: string
  mode: string
  status: string
  matched_count: number
  affected_count: number
  actor_name: string
  created_at: string
}

export function AdminNotificationsReportingPanel() {
  const { token } = useAuth()
  const [triggers, setTriggers] = useState<NotificationTriggerConfig[]>([])
  const [rules, setRules] = useState<SlaRule[]>([])
  const [schedulerRuns, setSchedulerRuns] = useState<SchedulerRunRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ruleName, setRuleName] = useState('')
  const [itemType, setItemType] = useState('signal')
  const [minutes, setMinutes] = useState(1440)
  const [workflowFilter, setWorkflowFilter] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([getNotificationDefaults(token), getSlaRules(token), getNotificationSchedulerRuns(token, { page: 1, page_size: 5 })])
      .then(([defaults, slaRules, runs]) => {
        if (!active) return
        setTriggers(defaults.items)
        setRules(slaRules.items)
        setSchedulerRuns(runs.items)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Notification settings could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  function updateTrigger(trigger: string, field: keyof NotificationTriggerConfig, value: unknown) {
    setTriggers(items => items.map(item => (item.trigger === trigger ? { ...item, [field]: value } : item)))
  }

  async function saveDefaults() {
    if (!token) return
    setSaving(true)
    try {
      const result = await updateNotificationDefaults(token, triggers)
      setTriggers(result.items)
      toast.success('Notification defaults saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Notification defaults could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function saveTrigger(trigger: NotificationTriggerConfig) {
    if (!token) return
    setSaving(true)
    try {
      const updated = await updateNotificationTrigger(token, trigger.trigger, trigger)
      setTriggers(items => items.map(item => (item.trigger === updated.trigger ? updated : item)))
      toast.success('Notification trigger saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Notification trigger could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function resetTrigger(trigger: string) {
    if (!token) return
    setSaving(true)
    try {
      const updated = await resetNotificationTrigger(token, trigger)
      setTriggers(items => items.map(item => (item.trigger === updated.trigger ? updated : item)))
      toast.success('Trigger reset to defaults')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trigger could not be reset')
    } finally {
      setSaving(false)
    }
  }

  async function testTrigger(trigger: string) {
    if (!token) return
    setSaving(true)
    try {
      await sendTestNotification(token, trigger)
      toast.success('Test notification created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test notification failed')
    } finally {
      setSaving(false)
    }
  }

  async function dryRunScheduler() {
    if (!token) return
    setSaving(true)
    try {
      const result = await dryRunNotificationScheduler(token)
      const runs = await getNotificationSchedulerRuns(token, { page: 1, page_size: 5 })
      setSchedulerRuns(runs.items)
      toast.success(`${result.due_triggers} timed trigger(s) evaluated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scheduler dry run failed')
    } finally {
      setSaving(false)
    }
  }

  async function submitRule(event: FormEvent) {
    event.preventDefault()
    if (!token || !ruleName.trim()) return
    setSaving(true)
    try {
      const rule = await createSlaRule(token, {
        name: ruleName,
        item_type: itemType,
        inactivity_minutes: minutes,
        qualifying_activities: ['status_change', 'comment', 'update'],
        recipient_policy: 'kam_head',
        is_active: true,
      })
      setRules(items => [rule, ...items])
      setRuleName('')
      toast.success('SLA rule added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SLA rule could not be added')
    } finally {
      setSaving(false)
    }
  }

  async function toggleRule(rule: SlaRule) {
    if (!token) return
    const updated = await updateSlaRule(token, rule.id, { is_active: !rule.is_active })
    setRules(items => items.map(item => (item.id === rule.id ? updated : item)))
  }

  async function runSla() {
    if (!token) return
    setSaving(true)
    try {
      const result = await evaluateSla(token)
      toast.success(`${result.escalated_items} item(s) escalated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SLA evaluation failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Notifications and SLA</p>
          <h2 className="text-base font-semibold text-ink">Delivery defaults and escalation rules</h2>
        </div>
        <div className="flex gap-2">
          <button className="tk-button-secondary" type="button" onClick={() => void dryRunScheduler()} disabled={saving}><Play className="h-4 w-4" />Dry run</button>
          <button className="tk-button-secondary" type="button" onClick={() => void runSla()} disabled={saving}><Play className="h-4 w-4" />Run SLA</button>
          <button className="tk-button-primary" type="button" onClick={() => void saveDefaults()} disabled={saving || loading}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save defaults</button>
        </div>
      </div>
      {loading ? <div className="flex items-center gap-2 p-4 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading notification settings</div> : null}
      {error ? <p className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{error}</p> : null}
      <div className="grid gap-5 p-4 xl:grid-cols-2">
        <div className="rounded-lg border border-surface-border">
          <div className="flex items-center gap-2 border-b border-surface-border p-4">
            <BellRing className="h-4 w-4 text-brand-blue" />
            <h3 className="text-sm font-semibold text-ink">Trigger defaults</h3>
          </div>
          <div className="border-b border-surface-border p-3">
            <select className="tk-input" value={workflowFilter} onChange={event => setWorkflowFilter(event.target.value)}>
              <option value="">All workflows</option>
              {[...new Set(triggers.map(trigger => trigger.workflow))].sort().map(workflow => (
                <option key={workflow} value={workflow}>{workflow.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-surface-border">
            {triggers.filter(trigger => !workflowFilter || trigger.workflow === workflowFilter).map(trigger => (
              <div key={trigger.trigger} className="grid min-w-0 gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{trigger.label}</p>
                  <p className="break-all text-xs text-ink-secondary">{trigger.workflow.replace(/_/g, ' ')} | {trigger.trigger}</p>
                </div>
                <div className="grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-[120px_140px_120px_minmax(190px,1fr)]">
                  <label className="grid gap-1 text-xs font-semibold text-ink-secondary">
                    Priority
                    <select className="tk-input" value={trigger.priority} onChange={event => updateTrigger(trigger.trigger, 'priority', event.target.value)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-ink-secondary">
                    Channel
                    <select className="tk-input" value={trigger.default_mode} onChange={event => updateTrigger(trigger.trigger, 'default_mode', event.target.value)}>
                      <option value="in_app">In-app</option>
                      <option value="in_app_email">In-app + email</option>
                      <option value="off">Off</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-ink-secondary">
                    Timing
                    <select className="tk-input" value={trigger.timing_mode} onChange={event => updateTrigger(trigger.trigger, 'timing_mode', event.target.value)}>
                      <option value="immediate">Immediate</option>
                      <option value="before_due">Before due</option>
                      <option value="after_pending">After pending</option>
                      <option value="scheduled">Scheduled</option>
                    </select>
                  </label>
                  <div className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)] gap-2">
                    <label className="grid gap-1 text-xs font-semibold text-ink-secondary">
                      Value
                      <input className="tk-input" type="number" min={1} value={trigger.timing_mode === 'before_due' ? trigger.lead_time_value ?? '' : trigger.pending_threshold_value ?? ''} onChange={event => updateTrigger(trigger.trigger, trigger.timing_mode === 'before_due' ? 'lead_time_value' : 'pending_threshold_value', event.target.value ? Number(event.target.value) : null)} />
                    </label>
                    <label className="grid min-w-0 gap-1 text-xs font-semibold text-ink-secondary">
                      Unit
                      <select className="tk-input" value={trigger.timing_unit} onChange={event => updateTrigger(trigger.trigger, 'timing_unit', event.target.value)}>
                        <option value="business_days">Business days</option>
                        <option value="calendar_days">Calendar days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
                    <input type="checkbox" checked={trigger.mandatory} onChange={event => updateTrigger(trigger.trigger, 'mandatory', event.target.checked)} />
                    Mandatory
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
                    <input type="checkbox" checked={trigger.is_active} onChange={event => updateTrigger(trigger.trigger, 'is_active', event.target.checked)} />
                    Active
                  </label>
                  <button className="tk-button-secondary" type="button" aria-label={`Test ${trigger.label}`} onClick={() => void testTrigger(trigger.trigger)} disabled={saving}><Send className="h-4 w-4" />Test</button>
                  <button className="tk-button-secondary" type="button" aria-label={`Reset ${trigger.label}`} onClick={() => void resetTrigger(trigger.trigger)} disabled={saving}><RotateCcw className="h-4 w-4" />Reset</button>
                  <button className="tk-button-secondary" type="button" onClick={() => void saveTrigger(trigger)} disabled={saving}>Save</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-surface-border">
          <div className="flex items-center gap-2 border-b border-surface-border p-4">
            <ShieldAlert className="h-4 w-4 text-brand-orange" />
            <h3 className="text-sm font-semibold text-ink">SLA rules</h3>
          </div>
          <form className="grid gap-2 border-b border-surface-border p-3 md:grid-cols-[1fr_130px_120px_auto]" onSubmit={submitRule}>
            <input className="tk-input" value={ruleName} onChange={event => setRuleName(event.target.value)} placeholder="Rule name" />
            <select className="tk-input" value={itemType} onChange={event => setItemType(event.target.value)}>
              <option value="signal">Signal</option>
              <option value="task">Task</option>
              <option value="kyc">KYC</option>
              <option value="escalation">Escalation</option>
            </select>
            <input className="tk-input" type="number" min={1} value={minutes} onChange={event => setMinutes(Number(event.target.value))} />
            <button className="tk-button-primary" type="submit" disabled={saving}><Plus className="h-4 w-4" />Add</button>
          </form>
          <div className="divide-y divide-surface-border">
            {rules.length === 0 ? <p className="p-4 text-sm text-ink-secondary">No SLA rules configured.</p> : null}
            {rules.map(rule => (
              <div key={rule.id} className="grid gap-2 p-3 md:grid-cols-[1fr_110px_120px_auto] md:items-center">
                <div>
                  <p className="text-sm font-semibold text-ink">{rule.name}</p>
                  <p className="text-xs text-ink-secondary">{rule.item_type} | {rule.inactivity_minutes} minutes</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{rule.recipient_policy}</span>
                <span className={rule.is_active ? 'text-sm font-semibold text-rag-green' : 'text-sm font-semibold text-ink-tertiary'}>{rule.is_active ? 'Active' : 'Inactive'}</span>
                <button className="tk-button-secondary" type="button" onClick={() => void toggleRule(rule)}>{rule.is_active ? 'Disable' : 'Enable'}</button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-surface-border xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-surface-border p-4">
            <Play className="h-4 w-4 text-brand-blue" />
            <h3 className="text-sm font-semibold text-ink">Scheduler run history</h3>
          </div>
          {schedulerRuns.length === 0 ? <p className="p-4 text-sm text-ink-secondary">No scheduler runs yet.</p> : null}
          <div className="divide-y divide-surface-border">
            {schedulerRuns.map(run => (
              <div key={run.id} className="grid gap-2 p-3 md:grid-cols-[1fr_120px_120px_120px] md:items-center">
                <div>
                  <p className="text-sm font-semibold text-ink">{run.job_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-ink-secondary">{run.mode} | {new Date(run.created_at).toLocaleString()}</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{run.status}</span>
                <span className="text-sm text-ink-secondary">{run.matched_count} matched</span>
                <span className="text-sm text-ink-secondary">{run.affected_count} due</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
