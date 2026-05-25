import { CheckCircle2, Download, Loader2, Upload, XCircle } from 'lucide-react'
import { nanoid } from 'nanoid'
import { ChangeEvent, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAccountStore } from '@/stores/accountStore'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'

type Step = 1 | 2 | 3 | 4

const required = ['account_name']
const optional = ['industry', 'arr', 'stage', 'owner_email', 'segment', 'region']
const template = `account_name,industry,arr,stage,owner_email,segment,region\nExample Client,Technology,250000,Onboarding,am@example.com,Enterprise,NA`
const csvSteps: { id: Step; label: string }[] = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Map' },
  { id: 3, label: 'Validate' },
  { id: 4, label: 'Confirm' },
]

function parseCsv(text: string) {
  const [headerLine = '', ...lines] = text.trim().split(/\r?\n/)
  const headers = headerLine.split(',').map(item => item.trim())
  const rows = lines.filter(Boolean).map(line => {
    const values = line.split(',').map(item => item.trim())
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
  return { headers, rows }
}

export function AccountCsvImport() {
  const importAccounts = useAccountStore(state => state.importAccounts)
  const existing = useAccountStore(state => state.accounts)
  const [step, setStep] = useState<Step>(1)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'overwrite' | 'create'>('skip')
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')

  const preview = useMemo(() => {
    return rows.slice(0, 10).map((row, index) => {
      const accountNameColumn = Object.entries(mapping).find(([, field]) => field === 'account_name')?.[0]
      const name = accountNameColumn ? row[accountNameColumn] : ''
      const duplicate = existing.some(account => account.name.toLowerCase() === name.toLowerCase())
      const missingName = !name
      return {
        index,
        row,
        status: missingName ? 'error' : duplicate ? 'warning' : 'valid',
        message: missingName ? 'Missing account_name' : duplicate ? 'Duplicate account' : 'Ready',
      }
    })
  }, [existing, mapping, rows])

  function loadText(text: string) {
    const parsed = parseCsv(text)
    const autoMapping = Object.fromEntries(parsed.headers.map(header => [header, [...required, ...optional].includes(header) ? header : '']))
    setHeaders(parsed.headers)
    setRows(parsed.rows)
    setMapping(autoMapping)
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
    file.text().then(loadText)
  }

  function download(filename: string, content: string) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
    link.download = filename
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function confirmImport() {
    setImporting(true)
    await new Promise(resolve => window.setTimeout(resolve, 600))
    const nameColumn = Object.entries(mapping).find(([, field]) => field === 'account_name')?.[0]
    if (!nameColumn) {
      setImporting(false)
      toast.error('Map account_name before importing')
      return
    }
    const created: Account[] = rows
      .filter(row => duplicateMode !== 'skip' || !existing.some(account => account.name.toLowerCase() === row[nameColumn].toLowerCase()))
      .map(row => {
        const get = (field: string) => {
          const col = Object.entries(mapping).find(([, mapped]) => mapped === field)?.[0]
          return col ? row[col] : ''
        }
        const matched = duplicateMode === 'overwrite' ? existing.find(account => account.name.toLowerCase() === get('account_name').toLowerCase()) : undefined
        return {
          id: matched?.id ?? `import-${nanoid(6)}`,
          name: get('account_name'),
          segment: (get('segment') as Account['segment']) || 'Growth',
          tags: [get('segment') || 'Growth'].filter(Boolean),
          ownerId: 'usr-001',
          ownerName: get('owner_email') || 'Unassigned AM',
          stage: (get('stage') as Account['stage']) || 'Onboarding',
          riskStatus: 'healthy',
          arr: Number(get('arr')) || 0,
          nextQbr: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          health: { overall: 70, relationship: 70, usage: 70, delivery: 70, commercial: 70 },
          stakeholders: [],
          risks: [],
        }
      })
    importAccounts(created)
    created.forEach(account => {
      emitTimelineEvent({
        accountId: account.id,
        eventType: 'account_setup',
        module: 'manual',
        title: `Account imported: ${account.name}`,
        description: 'Account created via account CSV import.',
        performedBy: 'usr-001',
        performedByName: 'Sarah Mitchell',
        metadata: { importId: account.id },
        isSensitive: false,
        isSystemGenerated: true,
        isImmutable: false,
      })
    })
    setImporting(false)
    toast.success(`${created.length} accounts imported`)
    download('kam-import-report.csv', `created,skipped\n${created.length},${rows.length - created.length}`)
  }

  const errors = preview.filter(item => item.status === 'error')
  const duplicates = preview.filter(item => item.status === 'warning')

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
          <p className="mx-auto mt-1 max-w-md break-words text-xs text-ink-secondary">Required: account_name. Optional: {optional.join(', ')}.</p>
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
          <h3 className="text-sm font-semibold text-ink">Field mapping</h3>
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
                        {[...required, ...optional].map(field => <option key={field}>{field}</option>)}
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
        </div>
      ) : null}
    </section>
  )
}
