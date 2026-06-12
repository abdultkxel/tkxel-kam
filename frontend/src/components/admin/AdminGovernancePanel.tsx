import { CalendarClock, Loader2, Plus } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { Account } from '@/types/account'
import { listAccounts } from '@/services/accountWorkspace'
import { createRecurrenceRule, listRecurrenceRules, GovernanceRecurrenceRule } from '@/services/contentGovernance'
import { formatDate } from '@/utils/formatters'

export function AdminGovernancePanel() {
  const { token, user } = useAuth()
  const [rules, setRules] = useState<GovernanceRecurrenceRule[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    governance_type: 'QBR',
    cadence: 'quarterly',
    start_at: new Date().toISOString().slice(0, 10),
    occurrences: 4,
    account_id: '',
  })
  const accountNameById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts])

  function ruleScopeLabel(rule: GovernanceRecurrenceRule) {
    if (rule.account_id) return `account ${accountNameById.get(rule.account_id) ?? 'Unknown account'}`
    if (rule.segment) return `segment ${rule.segment}`
    return 'account not set'
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      listRecurrenceRules(token, new URLSearchParams({ active_state: 'all', page: '1', page_size: '8' })),
      listAccounts(token, new URLSearchParams({ page: '1', page_size: '100' })),
    ])
      .then(([rulePage, accountPage]) => {
        if (cancelled) return
        setRules(rulePage.items)
        setAccounts(accountPage.items)
        setForm(current => ({ ...current, account_id: current.account_id || accountPage.items[0]?.id || '' }))
      })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Governance settings could not load'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || !user) return
    if (!form.name.trim()) {
      toast.error('Recurrence rule name is required')
      return
    }
    setSaving(true)
    try {
      const rule = await createRecurrenceRule(token, {
        ...form,
        interval: 1,
        start_at: new Date(`${form.start_at}T10:00:00`).toISOString(),
        end_policy: 'after_occurrences',
        owner_id: user.id,
      })
      setRules(current => [rule, ...current])
      toast.success('Governance recurrence rule created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Recurrence rule could not be created')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance</p>
        <h2 className="text-base font-semibold text-ink">Recurrence rules</h2>
        <p className="mt-2 text-sm text-ink-secondary">Configure recurring QBR, SteerCo, monthly review, or executive review schedules.</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-2 xl:grid-cols-[1fr_160px_150px_1fr_auto]">
        <input className="tk-input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Quarterly enterprise QBR" />
        <select className="tk-input" value={form.governance_type} onChange={event => setForm({ ...form, governance_type: event.target.value })}>
          <option>QBR</option>
          <option>SteerCo</option>
          <option>Monthly Review</option>
          <option>Executive Review</option>
        </select>
        <select className="tk-input" value={form.cadence} onChange={event => setForm({ ...form, cadence: event.target.value })}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
        <select className="tk-input" value={form.account_id} onChange={event => setForm({ ...form, account_id: event.target.value })}>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <button type="submit" className="tk-button-primary" disabled={saving || !form.account_id}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </form>
      {loading ? (
        <div className="flex min-h-[180px] items-center justify-center text-sm font-semibold text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading rules</div>
      ) : rules.length ? (
        <div className="divide-y divide-surface-border">
          {rules.map(rule => (
            <article key={rule.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="text-sm font-semibold text-ink">{rule.name}</h3>
                <p className="mt-1 text-xs text-ink-secondary">{rule.governance_type} | {rule.cadence} | {ruleScopeLabel(rule)} | starts {formatDate(rule.start_at)} | owner {rule.owner_name}</p>
              </div>
              <span className="rounded-full bg-blue-tint-20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{rule.is_active ? 'Active' : 'Inactive'}</span>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarClock} heading="No recurrence rules" body="Create a recurrence rule to auto-generate upcoming governance events." />
      )}
    </section>
  )
}
