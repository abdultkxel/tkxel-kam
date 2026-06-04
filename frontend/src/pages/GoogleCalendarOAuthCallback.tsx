import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCcw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

export function GoogleCalendarOAuthCallback() {
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')
  const message = searchParams.get('message') || defaultMessage(status)
  const isSuccess = status === 'success'
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle

  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-lg border border-surface-border bg-white p-6 shadow-card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className={isSuccess ? 'rounded-full bg-rag-green/10 p-3 text-rag-green' : 'rounded-full bg-brand-orange/10 p-3 text-brand-orange'}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Google Calendar</p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink">{isSuccess ? 'Connection Complete' : 'Connection Needs Attention'}</h1>
            <p className="mt-3 text-sm leading-6 text-ink-secondary">{message}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="tk-button-primary" to="/admin?section=integrations">
                <ArrowRight className="h-4 w-4" />
                Admin Integrations
              </Link>
              {!isSuccess ? (
                <Link className="tk-button-secondary" to="/admin?section=integrations">
                  <RefreshCcw className="h-4 w-4" />
                  Retry Connection
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function defaultMessage(status: string | null) {
  return status === 'success'
    ? 'Google Calendar is connected and ready for governance event pushes.'
    : 'Google Calendar could not be connected. Return to Admin Integrations and try again.'
}
