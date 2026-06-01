import * as Switch from '@radix-ui/react-switch'
import { RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { getEmailDomainSettings, updateEmailDomainSettings } from '@/services/adminAccess'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatters'

function previewDomains(rawInput: string) {
  return Array.from(
    new Set(
      rawInput
        .split(',')
        .map(item => item.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean),
    ),
  ).sort()
}

export function EmailDomainSettingsPanel() {
  const { token } = useAuth()
  const [rawInput, setRawInput] = useState('')
  const [initialRawInput, setInitialRawInput] = useState('')
  const [active, setActive] = useState(true)
  const [initialActive, setInitialActive] = useState(true)
  const [reason, setReason] = useState('')
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const domains = useMemo(() => previewDomains(rawInput), [rawInput])
  const isDirty = rawInput !== initialRawInput || active !== initialActive || Boolean(reason.trim())

  useEffect(() => {
    if (!token) return
    void loadSettings()
  }, [token])

  async function loadSettings() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const settings = await getEmailDomainSettings(token)
      setRawInput(settings.raw_input ?? '')
      setInitialRawInput(settings.raw_input ?? '')
      setActive(settings.active ?? true)
      setInitialActive(settings.active ?? true)
      setUpdatedBy(settings.updated_by ?? null)
      setUpdatedAt(settings.updated_at ?? null)
      setFieldErrors({})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Email domain settings could not load')
    } finally {
      setLoading(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setFieldErrors({})
    setError('')
    try {
      const settings = await updateEmailDomainSettings(token, {
        raw_input: rawInput,
        active,
        reason: reason.trim() || undefined,
      })
      setRawInput(settings.raw_input)
      setInitialRawInput(settings.raw_input)
      setActive(settings.active)
      setInitialActive(settings.active)
      setUpdatedBy(settings.updated_by ?? null)
      setUpdatedAt(settings.updated_at ?? null)
      setReason('')
      toast.success('Email domain policy saved')
    } catch (err) {
      const nextErrors = apiFieldErrors(err)
      setFieldErrors(nextErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextErrors)) setError(err.message)
      if (!(err instanceof ApiError)) setError('Email domain settings could not be saved')
      toast.error(err instanceof ApiError ? err.message : 'Email domain settings could not be saved')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setRawInput(initialRawInput)
    setActive(initialActive)
    setReason('')
    setFieldErrors({})
    setError('')
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Authentication</p>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-brand-blue" />
            Allowed Email Domains
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
            Parent domains control Admin user creation and Google Sign-In. `tkxel.com` also allows subdomains such as `corp.tkxel.com`.
          </p>
        </div>
        <button type="button" className="tk-button-secondary" onClick={() => void loadSettings()} disabled={loading || saving}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error ? <p className="m-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}

      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        {loading ? (
          <div className="rounded-md border border-surface-border bg-surface-tertiary p-4 text-sm font-medium text-ink-secondary">Loading email domain policy...</div>
        ) : null}
        <label className="block">
          <span className="tk-label">Allowed parent domains</span>
          <textarea
            className={cn('tk-input mt-2 min-h-28 resize-y', fieldErrors.raw_input && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
            value={rawInput}
            onChange={event => {
              setRawInput(event.target.value)
              setFieldErrors(errors => clearFieldError(errors, 'raw_input'))
            }}
            placeholder="tkxel.com, tkxel.io"
            aria-invalid={Boolean(fieldErrors.raw_input)}
            aria-describedby="email-domain-help email-domain-error"
            disabled={loading}
          />
          <p id="email-domain-help" className="mt-2 text-xs leading-5 text-ink-secondary">
            Use commas between parent domains. Subdomains are allowed automatically for each parent domain.
          </p>
          <FieldError id="email-domain-error" message={fieldErrors.raw_input} />
        </label>

        <div className="rounded-md border border-surface-border bg-surface-tertiary p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Normalized preview</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {domains.length ? domains.map(domain => (
              <span key={domain} className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-blue shadow-sm">{domain}</span>
            )) : <span className="text-sm text-ink-secondary">No domain restriction will be applied.</span>}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-md border border-surface-border p-3">
          <span>
            <span className="block text-sm font-semibold text-ink">Enforce domain policy</span>
            <span className="block text-xs leading-5 text-ink-secondary">When enabled, Admin user creation and Google Sign-In must match the configured domains.</span>
          </span>
          <Switch.Root checked={active} onCheckedChange={setActive} className="relative min-h-[44px] w-11 shrink-0 rounded-full bg-transparent after:absolute after:left-0 after:top-1/2 after:h-6 after:w-11 after:-translate-y-1/2 after:rounded-full after:bg-surface-border data-[state=checked]:after:bg-brand-blue">
            <Switch.Thumb className="absolute left-0 top-1/2 z-10 block h-5 w-5 translate-x-0.5 -translate-y-1/2 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
          </Switch.Root>
        </label>

        <label className="block">
          <span className="tk-label">Reason</span>
          <input className="tk-input mt-2" value={reason} onChange={event => setReason(event.target.value)} placeholder="Optional audit note" />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-4">
          <p className="text-xs text-ink-secondary">
            {updatedAt ? `Last updated ${formatDate(updatedAt)}${updatedBy ? ` by ${updatedBy}` : ''}` : 'No update history yet.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="tk-button-secondary" onClick={resetForm} disabled={!isDirty || saving}>Reset</button>
            <button type="submit" className="tk-button-primary" disabled={loading || saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Saving' : 'Save policy'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
