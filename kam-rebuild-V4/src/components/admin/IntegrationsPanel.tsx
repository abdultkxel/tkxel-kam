import * as Dialog from '@radix-ui/react-dialog'
import * as Switch from '@radix-ui/react-switch'
import { Check, CheckCircle2, Loader2, Settings, Unplug, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { syncIntegrationNow, adapters } from '@/services/integrations'
import { useIntegrationStore } from '@/stores/integrationStore'
import { IntegrationConfig, IntegrationSource } from '@/types/integration'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/formatters'

const statusClass = {
  connected: 'bg-rag-green/10 text-rag-green border-rag-green/20',
  disconnected: 'bg-surface-tertiary text-ink-secondary border-surface-border',
  error: 'bg-rag-red/10 text-rag-red border-rag-red/20',
}

function ConfigDrawer({ config, open, onOpenChange }: { config: IntegrationConfig | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const allErrors = useIntegrationStore(state => state.errors)
  const errors = useMemo(() => allErrors.filter(error => error.source === config?.source).slice(0, 10), [allErrors, config?.source])
  const updateConfig = useIntegrationStore(state => state.updateConfig)
  const [testing, setTesting] = useState(false)

  async function testConnection() {
    if (!config) return
    setTesting(true)
    const ok = await adapters[config.source].testConnection()
    updateConfig(config.source, { status: ok ? 'connected' : 'error', tokenStatus: ok ? 'valid' : 'expired' })
    toast[ok ? 'success' : 'error'](ok ? 'Connection test passed' : 'Connection test failed')
    setTesting(false)
  }

  if (!config) return null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed bottom-0 right-0 top-0 z-50 w-[min(720px,100vw)] overflow-y-auto border-l border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Integration Configuration</p>
              <Dialog.Title className="font-display text-3xl font-bold text-ink">{config.name}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">OAuth, mapping, filters, sync direction, dedupe, research-source governance, and recent errors.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close integration configuration">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="grid gap-4">
            <section className="tk-card p-4">
              <h3 className="text-base font-semibold text-ink">OAuth token status</h3>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-surface-border bg-surface-tertiary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-secondary">{config.tokenStatus}</span>
                <button className="tk-button-secondary" onClick={() => updateConfig(config.source, { tokenStatus: 'valid', status: 'connected' })}>Re-authenticate</button>
                <button className="tk-button-primary" onClick={testConnection} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Test connection
                </button>
              </div>
            </section>

            <section className="tk-card p-4">
              <h3 className="text-base font-semibold text-ink">Account mapping rules</h3>
              <div className="mt-3 grid gap-2">
                {config.accountMappingRules.map(rule => <input key={rule} className="tk-input" defaultValue={rule} />)}
              </div>
            </section>

            <section className="tk-card p-4">
              <h3 className="text-base font-semibold text-ink">Event type filter</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {config.eventTypeFilters.map(filter => (
                  <label key={filter} className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border px-3 text-sm text-ink">
                    <input type="checkbox" defaultChecked className="peer sr-only" />
                    <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-surface-border bg-white text-white peer-checked:border-brand-blue peer-checked:bg-brand-blue">
                      <Check className="h-3 w-3" />
                    </span>
                    {filter}
                  </label>
                ))}
              </div>
            </section>

            <section className="tk-card p-4">
              <h3 className="text-base font-semibold text-ink">Sync direction per field</h3>
              <div className="mt-3 grid gap-2">
                {Object.entries(config.syncDirections).map(([field, direction]) => (
                  <label key={field} className="grid gap-2 sm:grid-cols-[1fr_180px] sm:items-center">
                    <span className="text-sm font-medium capitalize text-ink">{field}</span>
                    <select className="tk-input" defaultValue={direction}>
                      <option value="inbound">Inbound</option>
                      <option value="outbound">Outbound</option>
                      <option value="bidirectional">Bidirectional</option>
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="tk-card p-4">
              <h3 className="text-base font-semibold text-ink">Deduplication window</h3>
              <input
                type="number"
                className="tk-input mt-3"
                value={config.deduplicationWindowMinutes}
                onChange={event => updateConfig(config.source, { deduplicationWindowMinutes: Number(event.target.value) })}
              />
            </section>

            {config.source === 'ai_llm_gateway' ? (
              <section className="tk-card p-4">
                <h3 className="text-base font-semibold text-ink">AI research sources</h3>
                <p className="mt-1 text-sm text-ink-secondary">Configured as gateway-governed research sources, not direct integration adapters.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {['Travoly', 'ZoomInfo', 'CrunchBase'].map(source => (
                    <div key={source} className="rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-3">
                      <p className="text-sm font-semibold text-brand-blue">{source}</p>
                      <p className="mt-1 text-xs text-ink-secondary">KYC enrichment with citation required</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="tk-card p-4">
              <h3 className="text-base font-semibold text-ink">Error log</h3>
              <div className="mt-3 space-y-2">
                {errors.length ? errors.map(error => (
                  <div key={error.id} className="rounded-lg border border-surface-border p-3 text-sm">
                    <p className="font-semibold text-ink">{error.message}</p>
                    <p className="mt-1 text-xs text-ink-secondary">{formatRelative(error.timestamp)} | {error.critical ? 'Admin alert sent' : 'Logged'}</p>
                  </div>
                )) : <p className="text-sm text-ink-secondary">No recent failures.</p>}
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function IntegrationsPanel() {
  const configs = useIntegrationStore(state => state.configs)
  const updateConfig = useIntegrationStore(state => state.updateConfig)
  const [selected, setSelected] = useState<IntegrationConfig | null>(null)
  const [syncing, setSyncing] = useState<IntegrationSource | null>(null)

  async function sync(config: IntegrationConfig) {
    setSyncing(config.source)
    const result = await syncIntegrationNow(config.source, 'amd-001')
    if (result.error) toast.error(result.error)
    else toast.success(`${config.name} synced ${result.created.length} events`)
    setSyncing(null)
  }

  return (
    <section className="tk-card p-5">
      <div className="mb-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">External Integrations</p>
        <h2 className="text-base font-semibold text-ink">Integration adapters</h2>
      </div>
      <div className="grid gap-3">
        {configs.map(config => (
          <article key={config.source} className="rounded-lg border border-surface-border p-4 transition-colors hover:bg-surface-tertiary">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-ink">{config.name}</h3>
                <p className="mt-1 text-xs text-ink-secondary">Last synced: {config.lastSynced ? formatRelative(config.lastSynced) : 'Never'}</p>
              </div>
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', statusClass[config.status])}>{config.status}</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button className="tk-button-secondary px-2 text-xs" onClick={() => sync(config)} disabled={syncing === config.source}>
                {syncing === config.source ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Sync
              </button>
              <button className="tk-button-secondary px-2 text-xs" onClick={() => setSelected(config)}>
                <Settings className="h-4 w-4" />
                Configure
              </button>
              <button className="tk-button-secondary px-2 text-xs" onClick={() => updateConfig(config.source, { status: 'disconnected', tokenStatus: 'missing' })}>
                <Unplug className="h-4 w-4" />
                Disconnect
              </button>
            </div>
            {config.source === 'google_calendar' ? (
              <div className="mt-3 flex min-h-[52px] items-center justify-between gap-3 rounded-lg bg-white p-3">
                <span className="text-sm text-ink-secondary">Auto-create tagged governance events</span>
                <Switch.Root checked={config.autoCreate} onCheckedChange={value => updateConfig(config.source, { autoCreate: value })} className="relative min-h-[44px] w-11 rounded-full bg-transparent after:absolute after:left-0 after:top-1/2 after:h-6 after:w-11 after:-translate-y-1/2 after:rounded-full after:bg-surface-border data-[state=checked]:after:bg-brand-blue">
                  <Switch.Thumb className="absolute left-0 top-1/2 z-10 block h-5 w-5 translate-x-0.5 -translate-y-1/2 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <ConfigDrawer config={selected} open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)} />
    </section>
  )
}
