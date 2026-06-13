import { BellRing, Loader2, RotateCcw, Save, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  getNotificationDefaults,
  NotificationTriggerConfig,
  resetNotificationTrigger,
  sendTestNotification,
  updateNotificationDefaults,
  updateNotificationTrigger,
} from '@/services/notificationsReporting'

const triggerPageSize = 8
const hiddenTriggerWorkflows = new Set(['escalations', 'signals'])
const hiddenNotificationTriggers = new Set([
  'escalation_opened',
  'escalation_owner_changed',
  'escalation_update_added',
  'sla_escalation',
  'unresolved_escalation',
  'escalation_rca_required',
  'escalation_closed',
  'escalation_reopened',
  'new_signal',
  'signal_assigned',
  'signal_unreviewed',
  'signal_lifecycle_changed',
  'signal_converted',
])

export function AdminNotificationsReportingPanel() {
  const { token } = useAuth()
  const [triggers, setTriggers] = useState<NotificationTriggerConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [triggerPage, setTriggerPage] = useState(1)

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getNotificationDefaults(token)
      .then(defaults => {
        if (!active) return
        setTriggers(defaults.items.filter(isVisibleNotificationTrigger))
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

  useEffect(() => {
    setTriggerPage(1)
  }, [workflowFilter])

  const filteredTriggers = triggers.filter(trigger => !workflowFilter || trigger.workflow === workflowFilter)
  const triggerPageCount = Math.max(1, Math.ceil(filteredTriggers.length / triggerPageSize))
  const currentTriggerPage = Math.min(triggerPage, triggerPageCount)
  const paginatedTriggers = filteredTriggers.slice((currentTriggerPage - 1) * triggerPageSize, currentTriggerPage * triggerPageSize)

  function updateTrigger(trigger: string, field: keyof NotificationTriggerConfig, value: unknown) {
    setTriggers(items => items.map(item => (item.trigger === trigger ? { ...item, [field]: value } : item)))
  }

  async function saveDefaults() {
    if (!token) return
    setSaving(true)
    try {
      const result = await updateNotificationDefaults(token, triggers)
      setTriggers(result.items.filter(isVisibleNotificationTrigger))
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

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Notifications</p>
          <h2 className="text-base font-semibold text-ink">Delivery defaults</h2>
        </div>
        <div className="flex gap-2">
          <button className="tk-button-primary" type="button" onClick={() => void saveDefaults()} disabled={saving || loading}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save defaults</button>
        </div>
      </div>
      {loading ? <div className="flex items-center gap-2 p-4 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading notification settings</div> : null}
      {error ? <p className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{error}</p> : null}
      <div className="p-4">
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
            {paginatedTriggers.length === 0 ? <p className="p-4 text-sm text-ink-secondary">No trigger defaults match this view.</p> : null}
            {paginatedTriggers.map(trigger => (
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
          {filteredTriggers.length > triggerPageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Showing {(currentTriggerPage - 1) * triggerPageSize + 1}-{Math.min(currentTriggerPage * triggerPageSize, filteredTriggers.length)} of {filteredTriggers.length}
              </p>
              <div className="flex items-center gap-2">
                <button className="tk-button-secondary" type="button" onClick={() => setTriggerPage(page => Math.max(1, page - 1))} disabled={currentTriggerPage <= 1}>
                  Previous
                </button>
                <span className="text-sm font-semibold text-ink-secondary">Page {currentTriggerPage} of {triggerPageCount}</span>
                <button className="tk-button-secondary" type="button" onClick={() => setTriggerPage(page => Math.min(triggerPageCount, page + 1))} disabled={currentTriggerPage >= triggerPageCount}>
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function isVisibleNotificationTrigger(trigger: NotificationTriggerConfig) {
  return !hiddenTriggerWorkflows.has(trigger.workflow) && !hiddenNotificationTriggers.has(trigger.trigger)
}
