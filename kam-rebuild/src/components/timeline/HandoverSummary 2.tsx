import * as Dialog from '@radix-ui/react-dialog'
import { Printer, X } from 'lucide-react'
import { Account } from '@/types/account'
import { TimelineEntry } from '@/types/timeline'
import { Opportunity } from '@/types/opportunity'
import { formatCurrency, formatDate } from '@/utils/formatters'

export function HandoverSummary({
  account,
  entries,
  opportunities,
  open,
  onOpenChange,
}: {
  account: Account
  entries: TimelineEntry[]
  opportunities: Opportunity[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 w-[min(920px,100vw)] overflow-y-auto border-l border-surface-border bg-white p-8 shadow-panel">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">FR-95 Account Handover</p>
              <Dialog.Title className="font-display text-3xl font-bold text-ink">{account.name}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-ink-secondary">
                Stage: {account.stage} | Owner: {account.ownerName} | ARR: {formatCurrency(account.arr)}
              </Dialog.Description>
            </div>
            <div className="flex gap-2 print:hidden">
              <button className="tk-button-secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </button>
              <Dialog.Close className="tk-icon-button" aria-label="Close">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="tk-card p-4">
              <h3 className="mb-3 text-base font-semibold text-ink">Health Scores</h3>
              {Object.entries(account.health).map(([key, value]) => (
                <div key={key} className="flex justify-between border-b border-surface-border py-2 text-sm last:border-b-0">
                  <span className="capitalize text-ink-secondary">{key}</span>
                  <span className="font-semibold text-ink">{value}</span>
                </div>
              ))}
            </section>
            <section className="tk-card p-4">
              <h3 className="mb-3 text-base font-semibold text-ink">Open Risks</h3>
              {account.risks.length ? account.risks.map(risk => <p key={risk} className="border-b border-surface-border py-2 text-sm text-ink-secondary last:border-b-0">{risk}</p>) : <p className="text-sm text-ink-secondary">No open risks.</p>}
            </section>
            <section className="tk-card p-4">
              <h3 className="mb-3 text-base font-semibold text-ink">Open Opportunities</h3>
              {opportunities.map(opp => (
                <div key={opp.id} className="border-b border-surface-border py-2 text-sm last:border-b-0">
                  <p className="font-semibold text-ink">{opp.name}</p>
                  <p className="text-ink-secondary">{formatCurrency(opp.estimatedValue)} | {opp.stage}</p>
                </div>
              ))}
            </section>
            <section className="tk-card p-4">
              <h3 className="mb-3 text-base font-semibold text-ink">Last 5 Timeline Events</h3>
              {entries.slice(0, 5).map(entry => (
                <div key={entry.id} className="border-b border-surface-border py-2 text-sm last:border-b-0">
                  <p className="font-semibold text-ink">{entry.title}</p>
                  <p className="text-ink-secondary">{formatDate(entry.timestamp)}</p>
                </div>
              ))}
            </section>
            <section className="tk-card p-4">
              <h3 className="mb-3 text-base font-semibold text-ink">Upcoming Governance</h3>
              <p className="text-sm text-ink-secondary">Next QBR: {formatDate(account.nextQbr)}</p>
            </section>
            <section className="tk-card p-4">
              <h3 className="mb-3 text-base font-semibold text-ink">Key Stakeholders</h3>
              {account.stakeholders.map(stakeholder => <p key={stakeholder} className="border-b border-surface-border py-2 text-sm text-ink-secondary last:border-b-0">{stakeholder}</p>)}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
