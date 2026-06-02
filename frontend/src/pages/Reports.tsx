import { BellRing, Download, FileText, Loader2, Play, Save, Search, ShieldAlert } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import {
  createDigestSchedule,
  createReport,
  DigestRun,
  DigestSchedule,
  EscalatedItem,
  evaluateSla,
  exportReport,
  getDigestSchedules,
  getDigests,
  getEscalatedItems,
  getReportFields,
  getReports,
  previewDigest,
  previewReport,
  ReportDefinition,
  ReportField,
  ReportPreview,
} from '@/services/notificationsReporting'

type Tab = 'builder' | 'digests' | 'sla'

export function Reports() {
  const { token, user } = useAuth()
  const [tab, setTab] = useState<Tab>('builder')
  const [dataSource, setDataSource] = useState('accounts')
  const [fields, setFields] = useState<ReportField[]>([])
  const [selectedFields, setSelectedFields] = useState<string[]>(['name', 'risk_status', 'health_overall'])
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<ReportPreview | null>(null)
  const [reports, setReports] = useState<ReportDefinition[]>([])
  const [reportName, setReportName] = useState('Portfolio attention report')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [digests, setDigests] = useState<DigestRun[]>([])
  const [schedules, setSchedules] = useState<DigestSchedule[]>([])
  const [escalated, setEscalated] = useState<EscalatedItem[]>([])
  const [digestLoading, setDigestLoading] = useState(false)
  const [slaLoading, setSlaLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    setError('')
    getReportFields(token, dataSource)
      .then(result => {
        if (!active) return
        setFields(result.fields)
        setSelectedFields(current => current.filter(field => result.fields.some(item => item.field === field)))
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Report fields could not be loaded')
      })
    getReports(token, { page: 1, page_size: 20, data_source: dataSource })
      .then(result => {
        if (active) setReports(Array.isArray(result.items) ? result.items : [])
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [dataSource, token])

  useEffect(() => {
    if (!token || tab !== 'digests') return
    void loadDigests()
  }, [tab, token])

  useEffect(() => {
    if (!token || tab !== 'sla') return
    void loadEscalated()
  }, [tab, token])

  const availableFields = useMemo(() => fields.filter(field => !field.sensitive), [fields])

  function toggleField(field: string) {
    setSelectedFields(current => current.includes(field) ? current.filter(item => item !== field) : [...current, field])
  }

  async function runPreview(event?: FormEvent) {
    event?.preventDefault()
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const result = await previewReport(token, {
        data_source: dataSource,
        fields: selectedFields,
        filters: { search },
        page: 1,
        page_size: 12,
      })
      setPreview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report preview failed')
    } finally {
      setLoading(false)
    }
  }

  async function saveReport() {
    if (!token) return
    setLoading(true)
    try {
      const report = await createReport(token, {
        name: reportName,
        visibility: 'private',
        data_source: dataSource,
        fields: selectedFields,
        filters: { search },
        grouping: [],
        layout: { type: 'table' },
        export_format: 'csv',
      })
      setReports(current => [report, ...current])
      toast.success('Report saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Report could not be saved')
    } finally {
      setLoading(false)
    }
  }

  async function exportSaved(report: ReportDefinition, format: 'csv' | 'pdf') {
    if (!token) return
    try {
      const run = await exportReport(token, report.id, format)
      toast.success(`${run.export_format.toUpperCase()} export generated`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  async function loadDigests() {
    if (!token) return
    setDigestLoading(true)
    try {
      const [history, schedulePage] = await Promise.all([getDigests(token, { page: 1, page_size: 10 }), getDigestSchedules(token)])
      setDigests(history.items)
      setSchedules(schedulePage.items)
    } finally {
      setDigestLoading(false)
    }
  }

  async function previewExecutiveDigest() {
    if (!token) return
    setDigestLoading(true)
    try {
      const result = await previewDigest(token, { sections: ['strategic_risks', 'retention_outlook', 'growth_opportunities', 'major_escalations', 'required_decisions'], filters: {} })
      setDigests(current => [result, ...current])
      toast.success('Digest preview generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Digest preview failed')
    } finally {
      setDigestLoading(false)
    }
  }

  async function scheduleDigest() {
    if (!token || !user) return
    setDigestLoading(true)
    try {
      const schedule = await createDigestSchedule(token, {
        name: 'Weekly executive digest',
        cadence: 'weekly',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        recipient_user_ids: [user.id],
        sections: ['strategic_risks', 'retention_outlook', 'growth_opportunities', 'major_escalations', 'required_decisions'],
        filters: {},
        delivery_channels: ['in_app'],
        is_active: true,
      })
      setSchedules(current => [schedule, ...current])
      toast.success('Digest scheduled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Digest schedule failed')
    } finally {
      setDigestLoading(false)
    }
  }

  async function loadEscalated() {
    if (!token) return
    setSlaLoading(true)
    try {
      const result = await getEscalatedItems(token, { page: 1, page_size: 20 })
      setEscalated(result.items)
    } finally {
      setSlaLoading(false)
    }
  }

  async function runSlaEvaluation() {
    if (!token) return
    setSlaLoading(true)
    try {
      const result = await evaluateSla(token)
      toast.success(`${result.escalated_items} SLA item(s) escalated`)
      await loadEscalated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SLA evaluation failed')
    } finally {
      setSlaLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Dashboards and reporting"
        title="Reports"
        description="Build permission-scoped reports, preview executive digests, and review SLA escalations."
      />

      <section className="tk-card p-3">
        <div className="flex flex-wrap gap-2">
          <button className={tab === 'builder' ? 'tk-button-primary' : 'tk-button-secondary'} type="button" onClick={() => setTab('builder')}><FileText className="h-4 w-4" />Builder</button>
          <button className={tab === 'digests' ? 'tk-button-primary' : 'tk-button-secondary'} type="button" onClick={() => setTab('digests')}><BellRing className="h-4 w-4" />Digests</button>
          <button className={tab === 'sla' ? 'tk-button-primary' : 'tk-button-secondary'} type="button" onClick={() => setTab('sla')}><ShieldAlert className="h-4 w-4" />SLA escalations</button>
        </div>
      </section>

      {tab === 'builder' ? (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <section className="tk-card overflow-hidden">
            <div className="border-b border-surface-border p-4">
              <h2 className="text-base font-semibold text-ink">Report builder</h2>
            </div>
            <form className="space-y-4 p-4" onSubmit={runPreview}>
              <label className="block">
                <span className="tk-label">Report name</span>
                <input className="tk-input mt-2" value={reportName} onChange={event => setReportName(event.target.value)} />
              </label>
              <label className="block">
                <span className="tk-label">Data source</span>
                <select className="tk-input mt-2" value={dataSource} onChange={event => { setDataSource(event.target.value); setPreview(null) }}>
                  <option value="accounts">Accounts</option>
                  <option value="tasks">Tasks</option>
                  <option value="signals">Signals</option>
                  <option value="escalations">Escalations</option>
                  <option value="opportunities">Opportunities</option>
                </select>
              </label>
              <label className="block">
                <span className="tk-label">Search filter</span>
                <input className="tk-input mt-2" value={search} onChange={event => setSearch(event.target.value)} placeholder="Optional search" />
              </label>
              <div>
                <span className="tk-label">Fields</span>
                <div className="mt-2 grid gap-2">
                  {availableFields.map(field => (
                    <label key={field.field} className="flex min-h-[40px] items-center gap-2 rounded-md border border-surface-border px-3 text-sm">
                      <input type="checkbox" checked={selectedFields.includes(field.field)} onChange={() => toggleField(field.field)} />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button className="tk-button-primary" type="submit" disabled={loading || selectedFields.length === 0}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Preview</button>
                <button className="tk-button-secondary" type="button" onClick={() => void saveReport()} disabled={loading || selectedFields.length === 0}><Save className="h-4 w-4" />Save</button>
              </div>
            </form>
          </section>

          <section className="space-y-5">
            <PreviewTable preview={preview} loading={loading} />
            <section className="tk-card overflow-hidden">
              <div className="border-b border-surface-border p-4">
                <h2 className="text-base font-semibold text-ink">Saved reports</h2>
              </div>
              {reports.length === 0 ? <p className="p-4 text-sm text-ink-secondary">No saved reports for this source.</p> : null}
              <div className="divide-y divide-surface-border">
                {reports.map(report => (
                  <article key={report.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{report.name}</h3>
                      <p className="text-xs text-ink-secondary">{report.data_source} · {report.fields_json.length} fields · {report.visibility}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="tk-button-secondary" type="button" onClick={() => void exportSaved(report, 'csv')}><Download className="h-4 w-4" />CSV</button>
                      <button className="tk-button-secondary" type="button" onClick={() => void exportSaved(report, 'pdf')}><Download className="h-4 w-4" />PDF</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        </div>
      ) : null}

      {tab === 'digests' ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <section className="tk-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border p-4">
              <h2 className="text-base font-semibold text-ink">Executive digests</h2>
              <div className="flex gap-2">
                <button className="tk-button-secondary" type="button" onClick={() => void previewExecutiveDigest()} disabled={digestLoading}><Play className="h-4 w-4" />Preview</button>
                <button className="tk-button-primary" type="button" onClick={() => void scheduleDigest()} disabled={digestLoading}><BellRing className="h-4 w-4" />Schedule</button>
              </div>
            </div>
            {digestLoading ? <LoadingLine label="Loading digests" /> : null}
            {digests.length === 0 && !digestLoading ? <p className="p-4 text-sm text-ink-secondary">No digest history.</p> : null}
            <div className="divide-y divide-surface-border">
              {digests.map(item => <DigestRunRow key={item.id} item={item} />)}
            </div>
          </section>
          <section className="tk-card overflow-hidden">
            <div className="border-b border-surface-border p-4">
              <h2 className="text-base font-semibold text-ink">Schedules</h2>
            </div>
            {schedules.length === 0 ? <p className="p-4 text-sm text-ink-secondary">No digest schedules.</p> : null}
            <div className="divide-y divide-surface-border">
              {schedules.map(schedule => (
                <article key={schedule.id} className="p-4">
                  <h3 className="text-sm font-semibold text-ink">{schedule.name}</h3>
                  <p className="text-xs text-ink-secondary">{schedule.cadence} · {schedule.timezone} · {schedule.is_active ? 'active' : 'inactive'}</p>
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {tab === 'sla' ? (
        <section className="tk-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border p-4">
            <h2 className="text-base font-semibold text-ink">Escalated items</h2>
            <button className="tk-button-primary" type="button" onClick={() => void runSlaEvaluation()} disabled={slaLoading}>{slaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run SLA</button>
          </div>
          {slaLoading ? <LoadingLine label="Loading escalated items" /> : null}
          {escalated.length === 0 && !slaLoading ? <p className="p-4 text-sm text-ink-secondary">No escalated items.</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <tbody>
                {escalated.map(item => (
                  <tr key={item.id} className="border-b border-surface-border last:border-b-0">
                    <td className="px-4 py-3 font-semibold text-ink">{item.title}</td>
                    <td className="px-4 py-3 text-ink-secondary">{item.source_type}</td>
                    <td className="px-4 py-3 text-ink-secondary">{item.severity ?? '-'}</td>
                    <td className="px-4 py-3 text-ink-secondary">{item.owner_name ?? '-'}</td>
                    <td className="px-4 py-3 text-ink-secondary">{item.recipient_name ?? '-'}</td>
                    <td className="px-4 py-3 text-ink-secondary">{new Date(item.escalated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function PreviewTable({ preview, loading }: { preview: ReportPreview | null; loading: boolean }) {
  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-4">
        <h2 className="text-base font-semibold text-ink">Preview</h2>
      </div>
      {loading ? <LoadingLine label="Generating preview" /> : null}
      {!preview && !loading ? <p className="p-4 text-sm text-ink-secondary">Run a preview to see report output.</p> : null}
      {preview ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <tr>{preview.columns.map(column => <th key={column.field} className="px-4 py-3">{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {preview.rows.map((row, index) => (
                <tr key={index} className="border-b border-surface-border last:border-b-0">
                  {preview.columns.map(column => <td key={column.field} className="max-w-[240px] truncate px-4 py-3 text-ink-secondary">{String(row[column.field] ?? '-')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

function DigestRunRow({ item }: { item: DigestRun }) {
  const sections = Object.keys(item.content_json)
  return (
    <article className="p-4">
      <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
      <p className="text-xs text-ink-secondary">{item.status} · {new Date(item.generated_at).toLocaleString()}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sections.map(section => <span key={section} className="rounded-full bg-surface-tertiary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">{section.replace(/_/g, ' ')}</span>)}
      </div>
    </article>
  )
}

function LoadingLine({ label }: { label: string }) {
  return <div className="flex items-center gap-2 p-4 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>
}
