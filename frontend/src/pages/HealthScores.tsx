import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { listAccounts } from '@/services/accountWorkspace'
import { createCsatScore, CsatScore, listCsatScores } from '@/services/csat'
import type { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'

const csatCategories = [
  { key: 'delivery_excellence', label: 'Delivery Excellence', weight: 30 },
  { key: 'communication', label: 'Communication', weight: 20 },
  { key: 'proactiveness', label: 'Proactiveness', weight: 15 },
  { key: 'trust', label: 'Trust', weight: 20 },
  { key: 'value_for_money', label: 'Value for Money', weight: 15 },
] as const

type CsatCategoryKey = typeof csatCategories[number]['key']

interface CsatForm {
  accountId: string
  customerName: string
  customerEmail: string
  categoryScores: Record<CsatCategoryKey, string>
  feedback: string
  sourceLabel: string
  sourceDate: string
  sourceLink: string
}

const emptyForm: CsatForm = {
  accountId: '',
  customerName: '',
  customerEmail: '',
  categoryScores: {
    delivery_excellence: '5',
    communication: '5',
    proactiveness: '5',
    trust: '5',
    value_for_money: '5',
  },
  feedback: '',
  sourceLabel: 'manual',
  sourceDate: '',
  sourceLink: '',
}

export function HealthScores() {
  const { token } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [scores, setScores] = useState<CsatScore[]>([])
  const [form, setForm] = useState<CsatForm>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const averageCsat = useMemo(() => {
    if (!scores.length) return 0
    return Math.round(scores.reduce((sum, item) => sum + item.normalized_score, 0) / scores.length)
  }, [scores])

  useEffect(() => {
    if (!token) return
    void load()
  }, [token])

  async function load() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [accountPage, scorePage] = await Promise.all([
        listAccounts(token, new URLSearchParams({ page: '1', page_size: '100' })),
        listCsatScores(token, { page_size: 25 }),
      ])
      setAccounts(accountPage.items)
      setScores(scorePage.items)
      setForm(current => ({ ...current, accountId: current.accountId || accountPage.items[0]?.id || '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health scores could not load')
    } finally {
      setLoading(false)
    }
  }

  function setField<K extends keyof CsatForm>(field: K, value: CsatForm[K]) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  function setCategoryScore(category: CsatCategoryKey, value: string) {
    setForm(current => ({ ...current, categoryScores: { ...current.categoryScores, [category]: value } }))
    setFieldErrors(errors => clearFieldError(errors, 'categoryScores'))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setFormError('')
    setFieldErrors({})
    try {
      await createCsatScore(token, {
        account_id: form.accountId,
        customer_name: form.customerName || null,
        customer_email: form.customerEmail || null,
        category_scores_json: Object.fromEntries(csatCategories.map(category => [category.key, Number(form.categoryScores[category.key])])),
        category_weights_json: Object.fromEntries(csatCategories.map(category => [category.key, category.weight])),
        feedback: form.feedback || null,
        source_label: form.sourceLabel || 'manual',
        source_link: form.sourceLink || null,
        source_recorded_at: form.sourceDate ? new Date(form.sourceDate).toISOString() : null,
      })
      toast.success('CSAT score saved')
      setForm(current => ({ ...emptyForm, accountId: current.accountId }))
      await load()
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, {
        account_id: 'accountId',
        customer_name: 'customerName',
        customer_email: 'customerEmail',
        category_scores_json: 'categoryScores',
        source_label: 'sourceLabel',
        source_link: 'sourceLink',
        source_recorded_at: 'sourceDate',
      })
      setFieldErrors(nextFieldErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextFieldErrors)) setFormError(err.message)
      if (!(err instanceof ApiError)) setFormError('CSAT score could not be saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Portfolio scoring" title="Health Scores" description="CSAT intake and account score evidence." />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="h-96 animate-pulse rounded-lg border border-surface-border bg-surface-secondary" />
          <div className="h-96 animate-pulse rounded-lg border border-surface-border bg-surface-secondary" />
        </div>
      ) : null}

      {!loading && error ? <EmptyState icon={AlertTriangle} heading="Health scores could not load" body={error} action={{ label: 'Retry', onClick: () => void load() }} /> : null}

      {!loading && !error ? (
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <section className="rounded-lg border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Manual CSAT</p>
              <h2 className="text-base font-semibold text-ink">Score intake</h2>
            </div>
            <form className="grid gap-4" onSubmit={submit} noValidate>
              <label className="block">
                <span className="tk-label">Account</span>
                <select className={fieldClass(fieldErrors.accountId)} value={form.accountId} onChange={event => setField('accountId', event.target.value)}>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <FieldError id="csat-account-error" message={fieldErrors.accountId} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="tk-label">Customer name</span>
                  <input className={fieldClass(fieldErrors.customerName)} value={form.customerName} onChange={event => setField('customerName', event.target.value)} />
                  <FieldError id="csat-customer-name-error" message={fieldErrors.customerName} />
                </label>
                <label className="block">
                  <span className="tk-label">Customer email</span>
                  <input className={fieldClass(fieldErrors.customerEmail)} value={form.customerEmail} onChange={event => setField('customerEmail', event.target.value)} type="email" />
                  <FieldError id="csat-customer-email-error" message={fieldErrors.customerEmail} />
                </label>
              </div>
              <div className="grid gap-3 rounded-lg border border-surface-border bg-surface-secondary p-3 sm:grid-cols-2">
                {csatCategories.map(category => (
                  <label key={category.key} className={category.key === 'value_for_money' ? 'block sm:col-span-2' : 'block'}>
                    <span className="tk-label">{category.label} ({category.weight}%)</span>
                    <input
                      className={fieldClass(fieldErrors.categoryScores)}
                      value={form.categoryScores[category.key]}
                      onChange={event => setCategoryScore(category.key, event.target.value)}
                      inputMode="decimal"
                      placeholder="1-5"
                    />
                  </label>
                ))}
                <FieldError id="csat-category-score-error" message={fieldErrors.categoryScores} />
              </div>
              <label className="block">
                <span className="tk-label">Feedback</span>
                <textarea className={fieldClass(fieldErrors.feedback)} value={form.feedback} onChange={event => setField('feedback', event.target.value)} rows={4} />
                <FieldError id="csat-feedback-error" message={fieldErrors.feedback} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="tk-label">Source label</span>
                  <input className={fieldClass(fieldErrors.sourceLabel)} value={form.sourceLabel} onChange={event => setField('sourceLabel', event.target.value)} />
                  <FieldError id="csat-source-label-error" message={fieldErrors.sourceLabel} />
                </label>
                <label className="block">
                  <span className="tk-label">Source date</span>
                  <input className={fieldClass(fieldErrors.sourceDate)} value={form.sourceDate} onChange={event => setField('sourceDate', event.target.value)} type="date" />
                  <FieldError id="csat-source-date-error" message={fieldErrors.sourceDate} />
                </label>
              </div>
              <label className="block">
                <span className="tk-label">Evidence link</span>
                <input className={fieldClass(fieldErrors.sourceLink)} value={form.sourceLink} onChange={event => setField('sourceLink', event.target.value)} />
                <FieldError id="csat-source-link-error" message={fieldErrors.sourceLink} />
              </label>
              {formError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{formError}</p> : null}
              <button className="tk-button-primary" type="submit" disabled={saving || !accounts.length}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save score
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">CSAT Trend</p>
                <h2 className="text-base font-semibold text-ink">{scores.length ? `${averageCsat}% average` : 'No CSAT scores'}</h2>
              </div>
              <button className="tk-button-secondary" type="button" onClick={() => void load()}>
                <Loader2 className={cn('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </button>
            </div>
            {!scores.length ? <EmptyState icon={AlertTriangle} heading="No CSAT scores" body="Manual CSAT entries will appear here." className="py-8" /> : null}
            <div className="space-y-3">
              {scores.map(score => (
                <article key={score.id} className="rounded-lg border border-surface-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{accountName(accounts, score.account_id)}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{score.customer_name || score.customer_email || score.source_label} · {formatDate(score.source_recorded_at)}</p>
                    </div>
                    <span className={cn('rounded-md px-2 py-1 text-xs font-bold', score.normalized_score >= 75 ? 'bg-rag-green/10 text-rag-green' : score.normalized_score >= 50 ? 'bg-brand-orange/10 text-brand-orange' : 'bg-rag-red/10 text-rag-red')}>
                      {score.normalized_score}%
                    </span>
                  </div>
                  {score.feedback ? <p className="mt-3 text-sm text-ink-secondary">{score.feedback}</p> : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {csatCategories.map(category => (
                      <span key={category.key} className="rounded-md bg-surface-secondary px-2 py-1 text-xs font-medium text-ink-secondary">
                        {category.label}: {score.category_scores_json?.[category.key] ?? '-'}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-secondary">
                    <span>Weighted {score.weighted_score || score.score}/5</span>
                    <span>{score.freshness_status}</span>
                    <span>{formatRelative(score.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function fieldClass(error?: string) {
  return cn('tk-input mt-2', error && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')
}

function accountName(accounts: Account[], accountId: string) {
  return accounts.find(account => account.id === accountId)?.name ?? 'Account'
}
