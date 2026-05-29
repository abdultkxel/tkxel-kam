import * as Switch from '@radix-ui/react-switch'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAlertStore } from '@/stores/alertStore'
import { ProactiveAlert } from '@/types/alert'
import { cn } from '@/utils/cn'

const severityClass: Record<ProactiveAlert['severity'], string> = {
  critical: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
  warning: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
  info: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
}

export function AlertRulesPanel() {
  const rules = useAlertStore(state => state.rules)
  const updateRule = useAlertStore(state => state.updateRule)

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Proactive risk alerts</p>
        <h2 className="text-base font-semibold text-ink">Alert Rules</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-4 py-3">Alert type</th>
              <th className="px-4 py-3">Threshold</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Notify</th>
              <th className="px-4 py-3">Snooze</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id} className="border-b border-surface-border last:border-b-0">
                <td className="px-4 py-3 font-semibold text-ink">{rule.type.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3">
                  <input className="tk-input" value={rule.threshold} onChange={event => updateRule(rule.id, { threshold: event.target.value })} />
                </td>
                <td className="px-4 py-3">
                  <select className={cn('tk-input border', severityClass[rule.severity])} value={rule.severity} onChange={event => updateRule(rule.id, { severity: event.target.value as ProactiveAlert['severity'] })}>
                    <option value="critical">critical</option>
                    <option value="warning">warning</option>
                    <option value="info">info</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select className="tk-input" value={rule.notify} onChange={event => updateRule(rule.id, { notify: event.target.value })}>
                    <option>AM</option>
                    <option>AM + leadership</option>
                    <option>Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input className="tk-input" type="number" min={0} value={rule.snoozeDays} onChange={event => updateRule(rule.id, { snoozeDays: Number(event.target.value) })} />
                </td>
                <td className="px-4 py-3">
                  <Switch.Root checked={rule.active} onCheckedChange={active => updateRule(rule.id, { active })} className="relative min-h-[44px] w-11 rounded-full bg-transparent after:absolute after:left-0 after:top-1/2 after:h-6 after:w-11 after:-translate-y-1/2 after:rounded-full after:bg-surface-border data-[state=checked]:after:bg-brand-blue">
                    <Switch.Thumb className="absolute left-0 top-1/2 z-10 block h-5 w-5 translate-x-0.5 -translate-y-1/2 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
                  </Switch.Root>
                </td>
                <td className="px-4 py-3">
                  <button className="tk-button-secondary" onClick={() => toast.success('Alert rule saved')}>
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
