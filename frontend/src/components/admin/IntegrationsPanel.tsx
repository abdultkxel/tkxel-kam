import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCcw, Save, Settings, Unplug, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  disconnectIntegration,
  googleCalendarOAuthUrl,
  IntegrationConnection,
  IntegrationProvider,
  IntegrationSyncLog,
  listIntegrationLogs,
  listIntegrations,
  readSecurityAlertSettings,
  retryIntegration,
  SecurityAlertSettings,
  syncIntegration,
  testIntegration,
  updateIntegration,
  updateSecurityAlertSettings,
} from '@/services/integrations'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/formatters'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'

const statusClass: Record<string, string> = {
  connected: 'bg-rag-green/10 text-rag-green border-rag-green/20',
  configuration_required: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
  disabled: 'bg-surface-tertiary text-ink-secondary border-surface-border',
  disconnected: 'bg-surface-tertiary text-ink-secondary border-surface-border',
  error: 'bg-rag-red/10 text-rag-red border-rag-red/20',
}

interface ConfigState {
  enabled: boolean
  sharedGovernanceCalendarId: string
  calendarId: string
  accessToken: string
  apiKey: string
  baseUrl: string
  healthPath: string
  syncIntervalMinutes: string
  deduplicationWindowMinutes: string
  autoCreateTaggedEvents: boolean
}

const visibleProviders = new Set<IntegrationProvider>(['google_calendar', 'ai_llm_gateway'])

const providerHelp: Partial<Record<IntegrationProvider, string>> = {
  google_calendar: 'Outbound governance events',
  ai_llm_gateway: 'AI run logs',
}

function supportsInboundSync(provider: IntegrationProvider) {
  return provider === 'ai_llm_gateway'
}

function isVisibleAdminConnection(connection: IntegrationConnection) {
  return visibleProviders.has(connection.provider)
}

function connectionName(connection: IntegrationConnection) {
  return connection.name || connection.provider.replace(/_/g, ' ')
}

function ConfigDrawer({
  config,
  logs,
  open,
  loadingLogs,
  onOpenChange,
  onSaved,
}: {
  config: IntegrationConnection | null
  logs: IntegrationSyncLog[]
  open: boolean
  loadingLogs: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (connection: IntegrationConnection) => void
}) {
  const { token } = useAuth()
  const [form, setForm] = useState<ConfigState>(() => formFromConnection(config))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    setForm(formFromConnection(config))
    setError('')
    setFieldErrors({})
  }, [config])

  if (!config) return null
  const activeConfig = config
  const showSyncSettings = supportsInboundSync(config.provider)

  function setField<K extends keyof ConfigState>(field: K, value: ConfigState[K]) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSaving(true)
    setError('')
    setFieldErrors({})
    try {
      const payload = buildPayload(activeConfig.provider, form)
      const saved = await updateIntegration(token, activeConfig.provider, payload)
      onSaved(saved)
      toast.success('Integration saved')
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, {
        'settings_json.shared_governance_calendar_id': 'sharedGovernanceCalendarId',
        'settings_json.calendar_id': 'calendarId',
        'settings_json.base_url': 'baseUrl',
        'settings_json.sync_interval_minutes': 'syncIntervalMinutes',
        'settings_json.deduplication_window_minutes': 'deduplicationWindowMinutes',
        credentials_json: 'apiKey',
        scopes: 'scopes',
      })
      setFieldErrors(nextFieldErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextFieldErrors)) setError(err.message)
      if (!(err instanceof ApiError)) setError('Integration could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    if (!token) return
    setTesting(true)
    try {
      const result = await testIntegration(token, activeConfig.provider)
      toast[result.errors ? 'error' : 'success'](result.message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  async function startOAuth() {
    if (!token) return
    try {
      const response = await googleCalendarOAuthUrl(token)
      window.location.assign(response.authorization_url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OAuth could not start')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 w-[min(760px,100vw)] overflow-y-auto border-l border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Integration Configuration</p>
              <Dialog.Title className="font-display text-3xl font-bold text-ink">{connectionName(config)}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">{providerHelp[config.provider] ?? 'Admin integration'}</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close integration configuration">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form className="grid gap-4" onSubmit={save} noValidate>
            <section className="rounded-lg border border-surface-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex min-h-[44px] items-center gap-3">
                  <input type="checkbox" checked={form.enabled} onChange={event => setField('enabled', event.target.checked)} />
                  <span className="text-sm font-semibold text-ink">Enabled</span>
                </label>
                {showSyncSettings ? (
                  <label className="block">
                    <span className="tk-label">Sync interval minutes</span>
                    <input className={cn('tk-input mt-2', fieldErrors.syncIntervalMinutes && 'border-rag-red')} value={form.syncIntervalMinutes} onChange={event => setField('syncIntervalMinutes', event.target.value)} inputMode="numeric" />
                    <FieldError id="integration-sync-interval-error" message={fieldErrors.syncIntervalMinutes} />
                  </label>
                ) : null}
              </div>
            </section>

            {config.provider === 'google_calendar' ? (
              <section className="rounded-lg border border-surface-border p-4">
                <button className="tk-button-secondary" type="button" onClick={() => void startOAuth()}>
                  <ExternalLink className="h-4 w-4" />
                  Connect Google
                </button>
              </section>
            ) : null}

            {config.provider === 'ai_llm_gateway' ? (
              <section className="rounded-lg border border-surface-border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="tk-label">Base URL</span>
                    <input className={cn('tk-input mt-2', fieldErrors.baseUrl && 'border-rag-red')} value={form.baseUrl} onChange={event => setField('baseUrl', event.target.value)} />
                    <FieldError id="integration-base-url-error" message={fieldErrors.baseUrl} />
                  </label>
                  <label className="block">
                    <span className="tk-label">Health path</span>
                    <input className="tk-input mt-2" value={form.healthPath} onChange={event => setField('healthPath', event.target.value)} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="tk-label">API key</span>
                    <input className={cn('tk-input mt-2', fieldErrors.apiKey && 'border-rag-red')} value={form.apiKey} onChange={event => setField('apiKey', event.target.value)} type="password" autoComplete="off" />
                    <FieldError id="integration-api-key-error" message={fieldErrors.apiKey} />
                  </label>
                </div>
              </section>
            ) : null}

            {error ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button className="tk-button-primary" type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
              <button className="tk-button-secondary" type="button" onClick={() => void runTest()} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Test
              </button>
            </div>
          </form>

          <section className="mt-6 rounded-lg border border-surface-border p-4">
            <h3 className="text-base font-semibold text-ink">Recent Logs</h3>
            <div className="mt-3 space-y-2">
              {loadingLogs ? <Loader2 className="h-5 w-5 animate-spin text-brand-blue" /> : null}
              {!loadingLogs && !logs.length ? <p className="text-sm text-ink-secondary">No sync logs.</p> : null}
              {logs.map(log => (
                <div key={log.id} className="rounded-md border border-surface-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{log.action}</p>
                    <span className="text-xs text-ink-secondary">{formatRelative(log.created_at)}</span>
                  </div>
                  <p className="mt-1 text-ink-secondary">{log.message || log.status}</p>
                </div>
              ))}
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function IntegrationsPanel() {
  const { token } = useAuth()
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [settings, setSettings] = useState<SecurityAlertSettings | null>(null)
  const [alertEmail, setAlertEmail] = useState('')
  const [selected, setSelected] = useState<IntegrationConnection | null>(null)
  const [logs, setLogs] = useState<IntegrationSyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [savingAlertEmail, setSavingAlertEmail] = useState(false)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')

  const connectedCount = useMemo(() => connections.filter(item => item.status === 'connected').length, [connections])

  useEffect(() => {
    if (!token) return
    void load()
  }, [token])

  useEffect(() => {
    if (!token || !selected) return
    setLoadingLogs(true)
    listIntegrationLogs(token, { provider: selected.provider, page_size: 10 })
      .then(page => setLogs(page.items))
      .catch(() => setLogs([]))
      .finally(() => setLoadingLogs(false))
  }, [selected, token])

  async function load() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [integrationList, alertSettings] = await Promise.all([
        listIntegrations(token),
        readSecurityAlertSettings(token),
      ])
      setConnections(integrationList.filter(isVisibleAdminConnection))
      setSettings(alertSettings)
      setAlertEmail(alertSettings.administration_email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Integrations could not load')
    } finally {
      setLoading(false)
    }
  }

  function replaceConnection(connection: IntegrationConnection) {
    setConnections(items => items.map(item => (item.provider === connection.provider ? connection : item)))
    setSelected(connection)
  }

  async function run(provider: IntegrationProvider, kind: 'sync' | 'retry' | 'disconnect') {
    if (!token) return
    setAction(`${kind}:${provider}`)
    try {
      if (kind === 'sync') {
        const result = await syncIntegration(token, provider)
        toast[result.errors ? 'error' : 'success'](result.message)
      }
      if (kind === 'retry') {
        const result = await retryIntegration(token, provider)
        toast[result.errors ? 'error' : 'success'](result.message)
      }
      if (kind === 'disconnect') {
        const connection = await disconnectIntegration(token, provider)
        replaceConnection(connection)
        toast.success('Integration disconnected')
      }
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Integration action failed')
    } finally {
      setAction('')
    }
  }

  async function saveAlertEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setSavingAlertEmail(true)
    try {
      const saved = await updateSecurityAlertSettings(token, alertEmail)
      setSettings(saved)
      setAlertEmail(saved.administration_email)
      toast.success('Alert email saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Alert email could not be saved')
    } finally {
      setSavingAlertEmail(false)
    }
  }

  return (
    <section className="rounded-lg border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">External Integrations</p>
          <h2 className="text-base font-semibold text-ink">Admin-owned adapters</h2>
          <p className="mt-1 text-sm text-ink-secondary">{connectedCount}/{connections.length || 2} connected</p>
        </div>
        <button className="tk-icon-button" type="button" onClick={() => void load()} title="Refresh integrations">
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map(item => <div key={item} className="h-36 animate-pulse rounded-lg border border-surface-border bg-surface-secondary" />)}
        </div>
      ) : null}

      {!loading && error ? <EmptyState icon={AlertTriangle} heading="Integrations could not load" body={error} action={{ label: 'Retry', onClick: () => void load() }} className="py-8" /> : null}
      {!loading && !error && !connections.length ? <EmptyState icon={Settings} heading="No admin-owned adapters" body="Google Calendar and AI/LLM Gateway adapters are seeded when the backend starts." className="py-8" /> : null}

      {!loading && !error && connections.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {connections.map(connection => (
            <article key={connection.provider} className="rounded-lg border border-surface-border p-4 transition-colors hover:bg-surface-tertiary">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold capitalize text-ink">{connectionName(connection)}</h3>
                  <p className="mt-1 text-xs text-ink-secondary">Last synced: {connection.last_synced_at ? formatRelative(connection.last_synced_at) : 'Never'}</p>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', statusClass[connection.status] || statusClass.error)}>{connection.status.replace(/_/g, ' ')}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-secondary">
                <span>Credentials: {connection.credential_status.configured ? 'Configured' : 'Missing'}</span>
                <span>Failures: {connection.failure_count}</span>
                <span>Last test: {connection.last_test_status || 'Not tested'}</span>
                <span>Enabled: {connection.enabled ? 'Yes' : 'No'}</span>
              </div>

              {connection.last_error ? <p className="mt-3 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-xs font-medium text-rag-red">{connection.last_error}</p> : null}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {supportsInboundSync(connection.provider) ? (
                  <>
                    <button className="tk-button-secondary px-2 text-xs" type="button" onClick={() => void run(connection.provider, 'sync')} disabled={Boolean(action)}>
                      {action === `sync:${connection.provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Sync
                    </button>
                    <button className="tk-button-secondary px-2 text-xs" type="button" onClick={() => void run(connection.provider, 'retry')} disabled={Boolean(action)}>
                      {action === `retry:${connection.provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Retry
                    </button>
                  </>
                ) : null}
                <button className="tk-button-secondary px-2 text-xs" type="button" onClick={() => setSelected(connection)}>
                  <Settings className="h-4 w-4" />
                  Configure
                </button>
                <button className="tk-button-secondary px-2 text-xs" type="button" onClick={() => void run(connection.provider, 'disconnect')} disabled={Boolean(action)}>
                  {action === `disconnect:${connection.provider}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Disconnect
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <form className="mt-5 rounded-lg border border-surface-border p-4" onSubmit={saveAlertEmail} noValidate>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="tk-label">Administration alert email</span>
            <input className="tk-input mt-2" value={alertEmail} onChange={event => setAlertEmail(event.target.value)} type="email" />
          </label>
          <button className="tk-button-primary" type="submit" disabled={savingAlertEmail}>
            {savingAlertEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
        {settings?.updated_by_name ? <p className="mt-2 text-xs text-ink-secondary">Updated by {settings.updated_by_name}</p> : null}
      </form>

      <ConfigDrawer config={selected} logs={logs} loadingLogs={loadingLogs} open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} onSaved={replaceConnection} />
    </section>
  )
}

function formFromConnection(config: IntegrationConnection | null): ConfigState {
  const settings = config?.settings_json ?? {}
  return {
    enabled: config?.enabled ?? false,
    sharedGovernanceCalendarId: stringValue(settings.shared_governance_calendar_id),
    calendarId: stringValue(settings.calendar_id),
    accessToken: '',
    apiKey: '',
    baseUrl: stringValue(settings.base_url),
    healthPath: stringValue(settings.health_path) || '/health',
    syncIntervalMinutes: stringValue(settings.sync_interval_minutes),
    deduplicationWindowMinutes: stringValue(settings.deduplication_window_minutes),
    autoCreateTaggedEvents: Boolean(settings.auto_create_tagged_events),
  }
}

function buildPayload(provider: IntegrationProvider, form: ConfigState) {
  const settings: Record<string, unknown> = {}
  if (supportsInboundSync(provider)) {
    settings.sync_interval_minutes = numberOrUndefined(form.syncIntervalMinutes)
  }
  const credentials: Record<string, unknown> = {}

  if (provider === 'google_calendar') {
    return { enabled: form.enabled }
  }
  if (provider === 'ai_llm_gateway') {
    settings.base_url = emptyToUndefined(form.baseUrl)
    settings.health_path = emptyToUndefined(form.healthPath)
    if (form.apiKey.trim()) credentials.api_key = form.apiKey.trim()
  }

  Object.keys(settings).forEach(key => settings[key] === undefined && delete settings[key])
  return {
    enabled: form.enabled,
    settings_json: settings,
    ...(Object.keys(credentials).length ? { credentials_json: credentials } : {}),
  }
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value)
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

function numberOrUndefined(value: string) {
  const trimmed = value.trim()
  return trimmed ? Number(trimmed) : undefined
}
