import { FormEvent, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FieldError } from '@/components/form/FieldError'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { ApiError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loginWithGoogle } = useAuth()
  const googleButtonRef = useRef<HTMLDivElement | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return
    let cancelled = false

    function renderGoogleButton() {
      if (cancelled || !window.google || !googleButtonRef.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: response => {
          if (!response.credential) {
            setError('Google Sign-In failed')
            return
          }
          void handleGoogleCredential(response.credential)
        },
      })
      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: Math.min(googleButtonRef.current.offsetWidth || 400, 400),
        text: 'signin_with',
      })
      setGoogleReady(true)
    }

    if (window.google) {
      renderGoogleButton()
      return () => {
        cancelled = true
      }
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    script.onerror = () => !cancelled && setGoogleReady(false)
    document.head.appendChild(script)
    return () => {
      cancelled = true
    }
  }, [googleClientId])

  function clearField(field: string) {
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setLoading(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err)
      setFieldErrors(nextFieldErrors)
      setError(err instanceof ApiError && !hasFieldErrors(nextFieldErrors) ? err.message : err instanceof ApiError ? '' : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleCredential(credential: string) {
    setError('')
    setFieldErrors({})
    setGoogleLoading(true)
    try {
      await loginWithGoogle(credential)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google Sign-In failed')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-surface-secondary lg:grid-cols-[minmax(420px,0.42fr)_1fr]">
      <section className="flex min-h-screen flex-col justify-between bg-brand-blue-dark p-6 text-white sm:p-8">
        <TkxelLogo size="sidebar" tone="white" />
        <div className="max-w-md py-12">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/65">KAM Intelligence Platform</p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-none text-white sm:text-6xl">Account governance, secured.</h1>
          <p className="mt-5 text-base leading-7 text-white/72">
            Sign in to manage strategic account intelligence, renewals, escalations, and executive workflows.
          </p>
        </div>
        <div className="h-1.5 w-40 rounded-full bg-white/20">
          <div className="h-full w-2/3 rounded-full bg-brand-orange" />
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-blue">Secure access</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-ink">Login</h2>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="tk-label">Email</span>
              <input
                className={cn('tk-input mt-2', fieldErrors.email && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => {
                  setEmail(event.target.value)
                  clearField('email')
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                required
              />
              <FieldError id="login-email-error" message={fieldErrors.email} />
            </label>

            <label className="block">
              <span className="tk-label">Password</span>
              <div className="relative mt-2">
                <input
                  className={cn('tk-input pr-12', fieldErrors.password && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value)
                    clearField('password')
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-secondary hover:bg-surface-tertiary hover:text-ink"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <FieldError id="login-password-error" message={fieldErrors.password} />
            </label>

            <div className="flex items-center justify-between gap-4">
              <Link className="text-sm font-semibold text-brand-blue hover:text-brand-blue-dark" to="/reset-password">
                Reset password
              </Link>
            </div>

            {error ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}

            <button className="tk-button-primary w-full" type="submit" disabled={loading}>
              <LogIn className="h-4 w-4" />
              {loading ? 'Signing in' : 'Sign in'}
            </button>
          </form>

          {googleClientId ? (
            <div className="mt-5 border-t border-surface-border pt-5">
              <div ref={googleButtonRef} className={cn('google-signin-slot min-h-[44px] w-full', googleLoading && 'pointer-events-none opacity-60')} aria-label="Google Sign-In" />
              {!googleReady ? <p className="mt-2 text-center text-xs text-ink-secondary">Loading Google Sign-In</p> : null}
              {googleLoading ? <p className="mt-2 text-center text-xs font-semibold text-brand-blue">Signing in with Google</p> : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
