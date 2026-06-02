import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FieldError } from '@/components/form/FieldError'
import { TkxelLogo } from '@/components/ui/TkxelLogo'
import { ApiError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void
        }
      }
    }
  }
}

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, googleSignIn } = useAuth()
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
  const googleClientId = import.meta.env.VITE_GOOGLE_SIGN_IN_CLIENT_ID as string | undefined

  function clearField(field: string) {
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  const handleGoogleCredential = useCallback(
    async (credential?: string) => {
      if (!credential) {
        setError('Google Sign-In did not return a credential.')
        return
      }
      setError('')
      setFieldErrors({})
      setGoogleLoading(true)
      try {
        await googleSignIn(credential)
        navigate(from, { replace: true })
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to sign in with Google')
      } finally {
        setGoogleLoading(false)
      }
    },
    [from, googleSignIn, navigate],
  )

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return
    const clientId = googleClientId

    function initializeGoogleButton() {
      const googleId = window.google?.accounts?.id
      if (!googleId || !googleButtonRef.current) return
      googleButtonRef.current.innerHTML = ''
      googleId.initialize({
        client_id: clientId,
        callback: response => {
          void handleGoogleCredential(response.credential)
        },
      })
      googleId.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 384,
        text: 'continue_with',
        shape: 'rectangular',
      })
      setGoogleReady(true)
    }

    const existingScript = document.getElementById('google-identity-services') as HTMLScriptElement | null
    if (existingScript) {
      if (window.google?.accounts?.id) initializeGoogleButton()
      else existingScript.addEventListener('load', initializeGoogleButton, { once: true })
      return () => existingScript.removeEventListener('load', initializeGoogleButton)
    }

    const script = document.createElement('script')
    script.id = 'google-identity-services'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initializeGoogleButton
    script.onerror = () => setError('Google Sign-In is unavailable.')
    document.head.appendChild(script)

    return () => {
      script.onload = null
      script.onerror = null
    }
  }, [googleClientId, handleGoogleCredential])

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
        <div className="w-full max-w-md">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-blue">Secure access</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-ink">Login</h2>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-3">
              {googleClientId ? (
                <div className={cn('min-h-[44px]', googleLoading && 'pointer-events-none opacity-60')}>
                  <div ref={googleButtonRef} />
                  {!googleReady ? (
                    <button type="button" className="tk-button-secondary w-full" disabled>
                      <LogIn className="h-4 w-4" />
                      Loading Google
                    </button>
                  ) : null}
                  {googleLoading ? <p className="mt-2 text-sm font-medium text-ink-secondary">Signing in with Google</p> : null}
                </div>
              ) : (
                <button type="button" className="tk-button-secondary w-full" disabled>
                  <LogIn className="h-4 w-4" />
                  Google unavailable
                </button>
              )}
              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-ink-tertiary">
                <span className="h-px flex-1 bg-surface-border" />
                Email
                <span className="h-px flex-1 bg-surface-border" />
              </div>
            </div>

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
        </div>
      </section>
    </main>
  )
}
