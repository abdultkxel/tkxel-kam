import { CheckCircle2, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useIntegrationStore } from '@/stores/integrationStore'
import { formatRelative } from '@/utils/formatters'

export function SensitivePolicyTable() {
  const policies = useIntegrationStore(state => state.sensitivePolicies)
  const audits = useIntegrationStore(state => state.accessAudits)
  const addAccessAudit = useIntegrationStore(state => state.addAccessAudit)
  const [grantedWindow, setGrantedWindow] = useState('')

  function grantAccess(windowLabel: string) {
    setGrantedWindow(windowLabel)
    addAccessAudit({
      id: `audit-grant-${Date.now()}`,
      user: 'Sarah Mitchell',
      entryId: 'tl-004',
      timestamp: new Date().toISOString(),
      ip: '127.0.0.1',
      action: 'granted',
    })
  }

  return (
    <section className="tk-card p-5">
      <div className="mb-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Sensitive Entry Policies</p>
        <h2 className="text-base font-semibold text-ink">Policy and access audit</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="py-2 pr-3">Sensitivity level</th>
              <th className="py-2 pr-3">Who can create</th>
              <th className="py-2">Who can view</th>
            </tr>
          </thead>
          <tbody>
            {policies.map(policy => (
              <tr key={policy.level} className="border-t border-surface-border">
                <td className="py-3 pr-3 font-semibold capitalize text-ink">{policy.level}</td>
                <td className="py-3 pr-3 text-ink-secondary">{policy.canCreate}</td>
                <td className="py-3 text-ink-secondary">{policy.canView}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 rounded-lg border border-surface-border bg-surface-tertiary p-3">
        <h3 className="text-sm font-semibold text-ink">Pending access request</h3>
        <p className="mt-1 text-xs text-ink-secondary">Ali Khan requested access to commercial entry tl-004.</p>
        {grantedWindow ? (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-rag-green">
            <CheckCircle2 className="h-4 w-4" />
            Granted for {grantedWindow}
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {['24h', '7 days', 'permanent'].map(option => (
              <button key={option} className="tk-button-secondary" onClick={() => grantAccess(option)}>
                Grant {option}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-brand-blue" />
          Sensitive entry access
        </h3>
        <div className="space-y-2">
          {audits.map(audit => (
            <div key={audit.id} className="rounded-lg border border-surface-border p-3 text-sm">
              <p className="font-medium text-ink">{audit.user} {audit.action} {audit.entryId}</p>
              <p className="mt-1 text-xs text-ink-secondary">{formatRelative(audit.timestamp)} | IP {audit.ip}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
