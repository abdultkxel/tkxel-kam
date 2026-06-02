import { FormEvent, useState } from 'react'
import { KeyRound, Mail, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FieldError } from '@/components/form/FieldError'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { ApiError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

export function ResetPassword() {
  const { requestPasswordReset, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)

  function clearField(field: string) {
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setMessage('')
    setLoading(true)
    try {
      const response = await requestPasswordReset(email)
      setMessage(response.message)
      if (response.reset_token) setResetToken(response.reset_token)
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err)
      setFieldErrors(nextFieldErrors)
      setError(err instanceof ApiError && !hasFieldErrors(nextFieldErrors) ? err.message : err instanceof ApiError ? '' : 'Unable to start password reset')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setMessage('')
    setLoading(true)
    try {
      await resetPassword(resetToken, newPassword)
      setMessage('Password reset complete. You can sign in with the new password.')
      setNewPassword('')
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, { token: 'resetToken', new_password: 'newPassword' })
      setFieldErrors(nextFieldErrors)
      setError(err instanceof ApiError && !hasFieldErrors(nextFieldErrors) ? err.message : err instanceof ApiError ? '' : 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface-secondary px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <TkxelLogo size="topbar" />
          <Link className="tk-button-secondary" to="/login">
            Back to login
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="tk-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-tint-20 text-brand-blue">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Step 1</p>
                <h1 className="font-display text-3xl font-bold text-ink">Request reset</h1>
              </div>
            </div>
            <form className="space-y-4" onSubmit={handleRequestReset} noValidate>
              <label className="block">
                <span className="tk-label">Email</span>
                <input
                  className={cn('tk-input mt-2', fieldErrors.email && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type="email"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value)
                    clearField('email')
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'reset-email-error' : undefined}
                  required
                />
                <FieldError id="reset-email-error" message={fieldErrors.email} />
              </label>
              <button className="tk-button-primary w-full" type="submit" disabled={loading}>
                <RotateCcw className="h-4 w-4" />
                Generate reset token
              </button>
            </form>
          </section>

          <section className="tk-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-orange-tint-20 text-brand-orange">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-orange">Step 2</p>
                <h2 className="font-display text-3xl font-bold text-ink">Set password</h2>
              </div>
            </div>
            <form className="space-y-4" onSubmit={handleReset} noValidate>
              <label className="block">
                <span className="tk-label">Reset token</span>
                <textarea
                  className={cn('tk-input mt-2 min-h-24', fieldErrors.resetToken && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  value={resetToken}
                  onChange={event => {
                    setResetToken(event.target.value)
                    clearField('resetToken')
                  }}
                  aria-invalid={Boolean(fieldErrors.resetToken)}
                  aria-describedby={fieldErrors.resetToken ? 'reset-token-error' : undefined}
                  required
                />
                <FieldError id="reset-token-error" message={fieldErrors.resetToken} />
              </label>
              <label className="block">
                <span className="tk-label">New password</span>
                <input
                  className={cn('tk-input mt-2', fieldErrors.newPassword && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={event => {
                    setNewPassword(event.target.value)
                    clearField('newPassword')
                  }}
                  aria-invalid={Boolean(fieldErrors.newPassword)}
                  aria-describedby={fieldErrors.newPassword ? 'reset-new-password-error' : undefined}
                  minLength={8}
                  required
                />
                <FieldError id="reset-new-password-error" message={fieldErrors.newPassword} />
              </label>
              <button className="tk-button-primary w-full" type="submit" disabled={loading}>
                <KeyRound className="h-4 w-4" />
                Reset password
              </button>
            </form>
          </section>
        </div>

        {message ? <p className="mt-5 rounded-md border border-rag-green/20 bg-rag-green/10 px-3 py-2 text-sm font-medium text-rag-green">{message}</p> : null}
        {error ? <p className="mt-5 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}
      </div>
    </main>
  )
}
