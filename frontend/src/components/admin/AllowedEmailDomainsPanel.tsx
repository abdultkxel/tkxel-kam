import { FormEvent, useEffect, useState } from 'react'
import { RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { AllowedEmailDomainsSettings, getAllowedEmailDomains, updateAllowedEmailDomains } from '@/services/adminAccess'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

export function AllowedEmailDomainsPanel() {
  const { token } = useAuth()
  const [settings, setSettings] = useState<AllowedEmailDomainsSettings | null>(null)
  const [domainsInput, setDomainsInput] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    void loadSettings()
  }, [token])

  async function loadSettings() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const response = await getAllowedEmailDomains(token)
      setSettings(response)
      setDomainsInput(response.domains_input ?? response.domains?.join(', ') ?? '')
      setFieldErrors({})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load allowed domains')
    } finally {
      setLoading(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      const response = await updateAllowedEmailDomains(token, domainsInput)
      setSettings(response)
      setDomainsInput(response.domains_input ?? response.domains?.join(', ') ?? '')
      toast.success(response.duplicates_removed ? 'Allowed domains saved. Duplicate domains were removed.' : 'Allowed domains saved.')
    } catch (err) {
      const nextErrors = apiFieldErrors(err, { domains_input: 'domainsInput' })
      setFieldErrors(nextErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextErrors)) setError(err.message)
      if (!(err instanceof ApiError)) setError('Unable to save allowed domains')
      toast.error(err instanceof ApiError ? err.message : 'Unable to save allowed domains')
    } finally {
      setSaving(false)
    }
  }

  const savedDomains = settings?.domains ?? []

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Security settings</p>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-brand-blue" />
            Allowed Email Domains
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">Subdomains must be listed separately.</p>
        </div>
        <button type="button" className="tk-button-secondary" onClick={() => void loadSettings()} disabled={loading || saving}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error ? <p className="m-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}

      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        <label className="block">
          <span className="tk-label">Allowed domains</span>
          <textarea
            className={cn('tk-input mt-2 min-h-[116px] resize-y', fieldErrors.domainsInput && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
            value={domainsInput}
            onChange={event => {
              setDomainsInput(event.target.value)
              setFieldErrors(errors => clearFieldError(errors, 'domainsInput'))
            }}
            placeholder="tkxel.com, tkxel.io, camp1.tkxel.com"
            disabled={loading || saving}
            aria-invalid={Boolean(fieldErrors.domainsInput)}
            aria-describedby={fieldErrors.domainsInput ? 'allowed-domains-error' : undefined}
          />
          <FieldError id="allowed-domains-error" message={fieldErrors.domainsInput} />
        </label>

        <div className="rounded-md border border-surface-border bg-surface-tertiary p-3 text-sm text-ink-secondary">
          {loading ? 'Loading allowed domains.' : savedDomains.length ? savedDomains.join(', ') : 'No allowed domains configured.'}
        </div>

        <div className="flex justify-end">
          <button type="submit" className="tk-button-primary" disabled={loading || saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving' : 'Save domains'}
          </button>
        </div>
      </form>
    </section>
  )
}
