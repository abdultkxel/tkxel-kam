import { CheckCircle2, Download, Loader2, Upload, XCircle } from 'lucide-react'
import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { AccountCsvImportResponse, AccountCsvImportRow, AccountCustomFieldDefinition, importAccountsCsv, listAccountCustomFields } from '@/services/accountWorkspace'
import { useAccountStore } from '@/stores/accountStore'
import { cn } from '@/utils/cn'

type Step = 1 | 2 | 3 | 4

type ImportFieldOption = {
  key: string
  label: string
  required?: boolean
  customField?: AccountCustomFieldDefinition
}

const required = ['account_name']
const optional = ['project_name', 'company_url', 'industry', 'arr', 'stage', 'owner_email', 'owner_name', 'segment', 'region']
const baseFieldOptions: ImportFieldOption[] = [
  { key: 'account_name', label: 'Account name', required: true },
  { key: 'project_name', label: 'Project name' },
  { key: 'company_url', label: 'Company URL' },
  { key: 'industry', label: 'Industry' },
  { key: 'arr', label: 'ARR' },
  { key: 'stage', label: 'Stage' },
  { key: 'owner_email', label: 'Owner email' },
  { key: 'owner_name', label: 'Owner name' },
  { key: 'segment', label: 'Segment' },
  { key: 'region', label: 'Region' },
]
const template = `account_name,project_name,company_url,industry,arr,stage,owner_email,owner_name,segment,region\nExample Client,Customer Success Workspace,https://example.com,Technology,250000,Onboarding,account.manager.user@tkxelkam.com,Account Manager KAM,Enterprise,NA`
const csvSteps: { id: Step; label: string }[] = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Map' },
  { id: 3, label: 'Validate' },
  { id: 4, label: 'Confirm' },
]

function parseCsv(text: string) {
  const [headerLine = '', ...lines] = text.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine).map(item => item.trim())
  const rows = lines.filter(Boolean).map(line => {
    const values = parseCsvLine(line).map(item => item.trim())
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
  return { headers, rows }
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      values.push(value)
      value = ''
      continue
    }
    value += char
  }
  values.push(value)
  return values
}

function readFileText(file: File) {
  if (typeof file.text === 'function') return file.text()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function AccountCsvImport() {
  const { token } = useAuth()
  const upsertAccount = useAccountStore(state => state.upsertAccount)
  const existing = useAccountStore(state => state.accounts)
  const [step, setStep] = useState<Step>(1)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'overwrite' | 'create'>('skip')
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [customFields, setCustomFields] = useState<AccountCustomFieldDefinition[]>([])
  const [loadingCustomFields, setLoadingCustomFields] = useState(false)
  const [importReport, setImportReport] = useState<AccountCsvImportResponse | null>(null)

  const fieldOptions = useMemo<ImportFieldOption[]>(
    () => [
      ...baseFieldOptions,
      ...customFields.map(field => ({
        key: customFieldKey(field.field_key),
        label: `Custom: ${field.label}`,
        required: field.is_required,
        customField: field,
      })),
    ],
    [customFields],
  )

  const validationRows = useMemo(() => {
    return rows.map((row, index) => {
      const name = mappedValue(row, mapping, 'account_name')
      const duplicate = existing.some(account => account.name.toLowerCase() === name.toLowerCase())
      const missingCustom = customFields.find(field => field.is_required && isEmptyCsvValue(mappedValue(row, mapping, customFieldKey(field.field_key))))
      const missingName = !name
      return {
        index,
        row,
        status: missingName || missingCustom ? 'error' : duplicate ? 'warning' : 'valid',
        message: missingName ? 'Missing account_name' : missingCustom ? `Missing ${missingCustom.label}` : duplicate ? 'Duplicate account' : 'Ready',
      }
    })
  }, [customFields, existing, mapping, rows])

  const preview = useMemo(() => validationRows.slice(0, 10), [validationRows])

  function loadText(text: string) {
    const parsed = parseCsv(text)
    const autoMapping = Object.fromEntries(parsed.headers.map(header => [header, autoMapHeader(header, fieldOptions)]))
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    setMapping(autoMapping)
    setImportReport(null)
    setStep(2)
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      toast.error('Only .csv files are supported')
      return
    }
    setFileName(file.name)
    readFileText(file).then(loadText).catch(() => toast.error('CSV file could not be read'))
  }

  function download(filename: string, content: string) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function confirmImport() {
    if (!token) {
      toast.error('Please log in again before importing accounts')
      return
    }
    const validationErrors = validationRows.filter(item => item.status === 'error')
    if (validationErrors.length) {
      toast.error('Resolve required CSV fields before importing')
      return
    }
    setImporting(true)
    try {
      const report = await importAccountsCsv(token, {
        duplicateMode,
        sourceFileName: fileName || 'account-import.csv',
        rows: rows.map(row => buildImportRow(row, mapping, customFields)),
      })
      report.results.forEach(result => {
        if (result.account) upsertAccount(result.account)
      })
      setImportReport(report)
      const stored = report.created + report.updated
      if (stored) toast.success(`${stored} accounts stored in backend`)
      if (report.failed) toast.error(`${report.failed} CSV row${report.failed === 1 ? '' : 's'} failed validation`)
      download('kam-import-report.csv', importReportCsv(report))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'CSV import could not be stored')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (!token) return
    let active = true
    setLoadingCustomFields(true)
    listAccountCustomFields(token)
      .then(fields => {
        if (!active) return
        setCustomFields(fields.filter(field => field.show_in_detail))
      })
      .catch(() => {
        if (active) setCustomFields([])
      })
      .finally(() => {
        if (active) setLoadingCustomFields(false)
      })
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (!headers.length || !fieldOptions.length) return
    setMapping(current => Object.fromEntries(headers.map(header => [header, current[header] || autoMapHeader(header, fieldOptions)])))
  }, [fieldOptions, headers])

  const errors = validationRows.filter(item => item.status === 'error')
  const duplicates = validationRows.filter(item => item.status === 'warning')

  return (
    <section className="tk-card p-5">
      <div className="mb-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Accounts</p>
        <h2 className="text-base font-semibold text-ink">Import accounts</h2>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        {csvSteps.map(item => (
          <div
            key={item.id}
            className={cn(
              'rounded-lg border px-3 py-2 transition-colors',
              step >= item.id ? 'border-brand-blue bg-blue-tint-20 text-brand-blue' : 'border-surface-border bg-surface-tertiary text-ink-secondary',
            )}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-wider">Step {item.id}</p>
            <p className="mt-0.5 text-sm font-semibold">{item.label}</p>
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="overflow-hidden rounded-xl border border-dashed border-surface-border bg-surface-tertiary p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-blue">
            <Upload className="h-7 w-7" />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">Upload CSV</p>
          <p className="mx-auto mt-1 max-w-md break-words text-xs text-ink-secondary">
            Required: account_name{customFields.some(field => field.is_required) ? ', configured required fields' : ''}. Optional: {optional.join(', ')}.
          </p>
          <input id="account-csv-file" type="file" accept=".csv" onChange={handleFile} className="hidden" />
          <button type="button" className="tk-button-primary mt-4" onClick={() => document.getElementById('account-csv-file')?.click()}>
            <Upload className="h-4 w-4" />
            Choose CSV
          </button>
          <p className="mt-3 text-xs font-medium text-ink-secondary">{fileName || 'No file selected yet'}</p>
          <button className="tk-button-secondary mt-3" onClick={() => download('kam-account-template.csv', template)}>
            <Download className="h-4 w-4" />
            Download template
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Field mapping</h3>
            {loadingCustomFields ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                <tr><th className="py-2">CSV column</th><th>KAM field</th><th>Sample value</th></tr>
              </thead>
              <tbody>
                {headers.map(header => (
                  <tr key={header} className="border-t border-surface-border">
                    <td className="py-2 font-medium text-ink">{header}</td>
                    <td className="py-2">
                      <select className="tk-input" value={mapping[header] ?? ''} onChange={event => setMapping(prev => ({ ...prev, [header]: event.target.value }))}>
                        <option value="">Do not import</option>
                        {fieldOptions.map(field => <option key={field.key} value={field.key}>{field.label}{field.required ? ' *' : ''}</option>)}
                      </select>
                    </td>
                    <td className="py-2 text-ink-secondary">{rows[0]?.[header]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="tk-button-primary mt-4" onClick={() => setStep(3)}>Validate preview</button>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">Validation preview</h3>
          <div className="mt-3 space-y-2">
            {preview.map(item => (
              <div key={item.index} className="flex items-center justify-between rounded-lg border border-surface-border p-3">
                <span className="text-sm text-ink">Row {item.index + 1}: {item.row[Object.keys(item.row)[0]]}</span>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {item.status === 'valid' ? <CheckCircle2 className="h-4 w-4 text-rag-green" /> : <XCircle className="h-4 w-4 text-brand-orange" />}
                  {item.message}
                </span>
              </div>
            ))}
          </div>
          {errors.length ? <button className="tk-button-secondary mt-4" onClick={() => download('kam-import-errors.csv', 'row,error\n1,Missing account_name')}>Download error report</button> : <button className="tk-button-primary mt-4" onClick={() => setStep(4)}>Continue</button>}
        </div>
      ) : null}

      {step === 4 ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">Confirm import</h3>
          <p className="mt-2 text-sm text-ink-secondary">{rows.length - duplicates.length} accounts will be created, {duplicates.length} skipped unless duplicate handling changes.</p>
          <select className="tk-input mt-3" value={duplicateMode} onChange={event => setDuplicateMode(event.target.value as 'skip' | 'overwrite' | 'create')}>
            <option value="skip">Duplicates: skip</option>
            <option value="overwrite">Duplicates: overwrite</option>
            <option value="create">Duplicates: create new</option>
          </select>
          {importing ? <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-border"><div className="h-2 w-2/3 animate-pulse-soft rounded-full bg-brand-blue" /></div> : null}
          <button className="tk-button-primary mt-4" onClick={confirmImport} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import accounts
          </button>
          {importReport ? (
            <div className="mt-4 rounded-lg border border-surface-border bg-surface-secondary p-3 text-sm text-ink-secondary">
              <p className="font-semibold text-ink">
                Stored: {importReport.created + importReport.updated} | Skipped: {importReport.skipped} | Failed: {importReport.failed}
              </p>
              <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                {importReport.results.map(result => (
                  <p key={result.rowNumber} className={cn(result.status === 'failed' ? 'text-rag-red' : result.status === 'skipped' ? 'text-brand-orange' : 'text-ink-secondary')}>
                    Row {result.rowNumber}: {result.accountName || 'Unnamed'} - {result.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function autoMapHeader(header: string, fieldOptions: ImportFieldOption[]) {
  const normalized = normalizeHeader(header)
  const staticField = [...required, ...optional].find(field => normalizeHeader(field) === normalized)
  if (staticField) return staticField
  const custom = fieldOptions.find(option => option.customField && [option.customField.field_key, option.customField.label].map(normalizeHeader).includes(normalized))
  return custom?.key ?? ''
}

function customFieldKey(fieldKey: string) {
  return `custom:${fieldKey}`
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function mappedValue(row: Record<string, string>, mapping: Record<string, string>, field: string) {
  const column = Object.entries(mapping).find(([, mapped]) => mapped === field)?.[0]
  return column ? row[column]?.trim() ?? '' : ''
}

function buildImportRow(row: Record<string, string>, mapping: Record<string, string>, customFields: AccountCustomFieldDefinition[]): AccountCsvImportRow {
  const payload: AccountCsvImportRow = {
    account_name: mappedValue(row, mapping, 'account_name'),
    project_name: optionalValue(mappedValue(row, mapping, 'project_name')),
    company_url: optionalValue(mappedValue(row, mapping, 'company_url')),
    industry: optionalValue(mappedValue(row, mapping, 'industry')),
    arr: optionalNumber(mappedValue(row, mapping, 'arr')),
    stage: optionalValue(mappedValue(row, mapping, 'stage')),
    owner_email: optionalValue(mappedValue(row, mapping, 'owner_email')),
    owner_name: optionalValue(mappedValue(row, mapping, 'owner_name')),
    segment: optionalValue(mappedValue(row, mapping, 'segment')),
    region: optionalValue(mappedValue(row, mapping, 'region')),
  }
  const customValues = customFields.reduce<Record<string, unknown>>((values, field) => {
    const value = customValueForImport(field, mappedValue(row, mapping, customFieldKey(field.field_key)))
    if (!isEmptyCsvValue(value)) values[field.field_key] = value
    return values
  }, {})
  if (Object.keys(customValues).length) payload.custom_field_values = customValues
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => !isEmptyCsvValue(value))) as AccountCsvImportRow
}

function customValueForImport(field: AccountCustomFieldDefinition, value: string): unknown {
  if (!value.trim()) return undefined
  if (field.field_type === 'boolean') return /^(true|yes|1)$/i.test(value.trim())
  if (field.field_type === 'number' || field.field_type === 'currency') return optionalNumber(value)
  if (field.field_type === 'multi_select') return value.split(/[;|]/).map(item => item.trim()).filter(Boolean)
  return value.trim()
}

function optionalValue(value: string) {
  return value.trim() || undefined
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined
  const number = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(number) ? number : undefined
}

function isEmptyCsvValue(value: unknown) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function importReportCsv(report: AccountCsvImportResponse) {
  const lines = ['row,status,account_name,message,account_id,draft_id,errors']
  report.results.forEach(result => {
    lines.push([
      result.rowNumber,
      result.status,
      result.accountName ?? '',
      result.message,
      result.accountId ?? '',
      result.draftId ?? '',
      result.errors.map(error => `${error.field}: ${error.message}`).join('; '),
    ].map(csvCell).join(','))
  })
  return lines.join('\n')
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
