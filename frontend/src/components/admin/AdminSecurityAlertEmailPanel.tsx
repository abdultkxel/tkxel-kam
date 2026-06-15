import { FormEvent, useEffect, useState } from 'react'
import { MailWarning, Save } from 'lucide-react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { readSecurityAlertSettings, SecurityAlertSettings, updateSecurityAlertSettings } from '@/services/integrations'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'

export function AdminSecurityAlertEmailPanel() {
  const { token } = useAuth()
  const [settings, setSettings] = useState<SecurityAlertSettings | null>(null)
  const [administrationEmail, setAdministrationEmail] = useState('')
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
      const response = await readSecurityAlertSettings(token)
      setSettings(response)
      setAdministrationEmail(response.administration_email)
      setFieldErrors({})
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load administration alert email')
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
      const response = await updateSecurityAlertSettings(token, administrationEmail)
      setSettings(response)
      setAdministrationEmail(response.administration_email)
      toast.success('Administration alert email saved.')
    } catch (err) {
      const nextErrors = apiFieldErrors(err, {
        administration_email: 'administrationEmail',
        'body.administration_email': 'administrationEmail',
      })
      setFieldErrors(nextErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextErrors)) setError(err.message)
      if (!(err instanceof ApiError)) setError('Unable to save administration alert email')
      toast.error(err instanceof Error ? err.message : 'Unable to save administration alert email')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Security settings</p>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <MailWarning className="h-4 w-4 text-brand-blue" />
          Administration alert email
        </h2>
      </div>

      {error ? <p className="m-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}

      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        <label className="block">
          <span className="tk-label">Administration alert email</span>
          <input
            className={cn('tk-input mt-2', fieldErrors.administrationEmail && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
            value={administrationEmail}
            onChange={event => {
              setAdministrationEmail(event.target.value)
              setFieldErrors(errors => clearFieldError(errors, 'administrationEmail'))
            }}
            type="email"
            disabled={loading || saving}
            aria-invalid={Boolean(fieldErrors.administrationEmail)}
            aria-describedby={fieldErrors.administrationEmail ? 'administration-alert-email-error' : undefined}
          />
          <FieldError id="administration-alert-email-error" message={fieldErrors.administrationEmail} />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-secondary">
            {loading ? 'Loading administration alert email.' : settings?.updated_by_name ? `Updated by ${settings.updated_by_name}` : ''}
          </p>
          <button type="submit" className="tk-button-primary" disabled={loading || saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  )
}
