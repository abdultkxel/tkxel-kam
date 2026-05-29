import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { users } from '@/data/mock'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { Stage } from '@/types/opportunity'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatCompactCurrency } from '@/utils/formatters'

function PipelineStat({ label, value, tone = 'default', format }: { label: string; value: number; tone?: 'default' | 'warning' | 'success'; format?: (value: number) => string }) {
  const valueClass = tone === 'warning' ? 'text-brand-orange' : tone === 'success' ? 'text-rag-green' : 'text-ink'

  return (
    <div className="rounded-lg bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <AnimatedNumber value={value} format={format} className={`mt-1 block text-2xl font-bold ${valueClass}`} />
    </div>
  )
}

export function Opportunities() {
  const [params, setParams] = useSearchParams()
  const opportunities = useOpportunityStore(state => state.opportunities)
  const upsertOpportunity = useOpportunityStore(state => state.upsertOpportunity)
  const accounts = useAccountStore(state => state.accounts)
  const user = useRole()
  const account = params.get('account') ?? ''
  const owner = params.get('owner') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const minValue = params.get('minValue') ?? ''
  const maxValue = params.get('maxValue') ?? ''

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function clearFilters() {
    setParams({}, { replace: true })
  }

  const filtered = opportunities.filter(opportunity => {
    const accountNeedle = account.toLowerCase()
    const matchesAccount = !accountNeedle || opportunity.accountName.toLowerCase().includes(accountNeedle) || opportunity.name.toLowerCase().includes(accountNeedle)
    const matchesOwner = !owner || opportunity.ownerId === owner
    const closeTime = new Date(opportunity.closeDate).getTime()
    const matchesFrom = !from || closeTime >= new Date(`${from}T00:00:00`).getTime()
    const matchesTo = !to || closeTime <= new Date(`${to}T23:59:59`).getTime()
    const matchesMin = !minValue || opportunity.estimatedValue >= Number(minValue)
    const matchesMax = !maxValue || opportunity.estimatedValue <= Number(maxValue)
    return matchesAccount && matchesOwner && matchesFrom && matchesTo && matchesMin && matchesMax
  })

  const openOpportunities = filtered.filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost')
  const openPipeline = openOpportunities.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const closingSoon = openOpportunities.filter(opportunity => new Date(opportunity.closeDate).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000).length
  const wonValue = filtered.filter(opportunity => opportunity.stage === 'Won').reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const averageDeal = filtered.length ? filtered.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0) / filtered.length : 0

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline execution"
        title="Opportunities"
        description="Prioritize open pipeline, review close risk, and move deals through the KAM stage flow."
        actions={<AddOpportunityDialog accounts={accounts} onCreate={upsertOpportunity} currentUserId={user.id} currentUserName={user.name} />}
      />
      <FilterBar onClear={clearFilters} contentClassName="md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(220px,1.1fr)_180px_150px_150px_140px_140px_auto]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Account</span>
          <input className="tk-input" value={account} onChange={event => setFilter('account', event.target.value)} placeholder="Account or opportunity" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Owner</span>
          <select className="tk-input" value={owner} onChange={event => setFilter('owner', event.target.value)}>
            <option value="">All owners</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Close from</span>
          <input type="date" className="tk-input" value={from} onChange={event => setFilter('from', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Close to</span>
          <input type="date" className="tk-input" value={to} onChange={event => setFilter('to', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Min value</span>
          <input type="number" min={0} className="tk-input" value={minValue} onChange={event => setFilter('minValue', event.target.value)} placeholder="$0" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Max value</span>
          <input type="number" min={0} className="tk-input" value={maxValue} onChange={event => setFilter('maxValue', event.target.value)} placeholder="$1M" />
        </label>
      </FilterBar>

      <section className="tk-card mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PipelineStat label="Open pipeline" value={openPipeline} format={formatCompactCurrency} />
          <PipelineStat label="Closing in 30 days" value={closingSoon} tone={closingSoon ? 'warning' : 'success'} />
          <PipelineStat label="Won value" value={wonValue} tone="success" format={formatCompactCurrency} />
          <PipelineStat label="Avg deal" value={averageDeal} format={formatCompactCurrency} />
        </div>
      </section>

      <OpportunityBoard items={filtered} />
    </div>
  )
}

function AddOpportunityDialog({
  accounts,
  onCreate,
  currentUserId,
  currentUserName,
}: {
  accounts: ReturnType<typeof useAccountStore.getState>['accounts']
  onCreate: ReturnType<typeof useOpportunityStore.getState>['upsertOpportunity']
  currentUserId: string
  currentUserName: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [stage, setStage] = useState<Stage>('Identified')
  const [estimatedValue, setEstimatedValue] = useState('125000')
  const [closeDate, setCloseDate] = useState(() => new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const selectedAccount = useMemo(() => accounts.find(account => account.id === accountId), [accountId, accounts])
  const selectedOwner = users.find(user => user.id === ownerId) ?? users.find(user => user.id === currentUserId)
  const canSubmit = name.trim() && selectedAccount && selectedOwner && Number(estimatedValue) > 0 && closeDate

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || !selectedAccount || !selectedOwner) return
    setSaving(true)
    await new Promise(resolve => window.setTimeout(resolve, 350))
    const id = `opp-${nanoid(6)}`
    const value = Number(estimatedValue)
    onCreate({
      id,
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
      name: name.trim(),
      ownerId: selectedOwner.id,
      ownerName: selectedOwner.name,
      estimatedValue: value,
      closeDate: new Date(`${closeDate}T12:00:00`).toISOString(),
      stage,
    })
    emitTimelineEvent({
      accountId: selectedAccount.id,
      eventType: 'opportunity_event',
      module: 'opportunity',
      title: `Opportunity created: ${name.trim()}`,
      description: `Estimated value: ${formatCompactCurrency(value)}. Initial stage: ${stage}.`,
      performedBy: currentUserId,
      performedByName: currentUserName,
      sourceRecordId: id,
      sourceRecordType: 'opportunity',
      sourceRecordRoute: `/opportunities?account=${encodeURIComponent(selectedAccount.name)}`,
      metadata: { opportunityId: id, stage, estimatedValue: value },
      isSensitive: false,
      isSystemGenerated: true,
      isImmutable: false,
    })
    setSaving(false)
    setOpen(false)
    setName('')
    setEstimatedValue('125000')
    setStage('Identified')
    toast.success('Opportunity created')
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary">
          <Plus className="h-4 w-4" />
          Add opportunity
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white shadow-panel">
          <form onSubmit={submit}>
            <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Pipeline create flow</p>
                <Dialog.Title className="font-display text-2xl font-bold text-ink">Add opportunity</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-secondary">Create a pipeline item and log it against the account timeline.</Dialog.Description>
              </div>
              <Dialog.Close className="tk-icon-button" aria-label="Close opportunity form">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="tk-label text-xs">Opportunity name <span className="text-brand-orange">*</span></span>
                <input className="tk-input" value={name} onChange={event => setName(event.target.value)} placeholder="Expansion workshop and delivery squad" autoFocus />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Account <span className="text-brand-orange">*</span></span>
                <select className="tk-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Owner</span>
                <select className="tk-input" value={ownerId} onChange={event => setOwnerId(event.target.value)}>
                  {users.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Estimated value <span className="text-brand-orange">*</span></span>
                <input type="number" min={0} className="tk-input" value={estimatedValue} onChange={event => setEstimatedValue(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Close date <span className="text-brand-orange">*</span></span>
                <input type="date" className="tk-input" value={closeDate} onChange={event => setCloseDate(event.target.value)} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="tk-label text-xs">Stage</span>
                <select className="tk-input" value={stage} onChange={event => setStage(event.target.value as Stage)}>
                  {(['Identified', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'] as Stage[]).map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-5">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={!canSubmit || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create opportunity
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
