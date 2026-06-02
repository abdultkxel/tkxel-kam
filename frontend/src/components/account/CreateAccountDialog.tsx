import * as Dialog from '@radix-ui/react-dialog'
import { Building2, FileSearch, FileText, Globe2, Loader2, Mail, Plus, Sparkles, Upload, UserRound, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { FormEvent, forwardRef, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { users } from '@/data/mock'
import { ApiError } from '@/services/api'
import { AccountCustomFieldDefinition, createOnboardingDraft, listAccountCustomFields } from '@/services/accountWorkspace'
import { cn } from '@/utils/cn'

type CreateAccountField = 'accountName' | 'projectName' | 'companyUrl' | 'managerName' | 'managerEmail'

export function CreateAccountDialog({ label = 'Create account' }: { label?: string }) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const firstAm = users.find(item => item.role === 'am') ?? users[0]
  const [open, setOpen] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [managerName, setManagerName] = useState(firstAm.name)
  const [managerEmail, setManagerEmail] = useState(firstAm.email)
  const [errors, setErrors] = useState<Partial<Record<CreateAccountField, string>>>({})
  const [customFields, setCustomFields] = useState<AccountCustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [loadingCustomFields, setLoadingCustomFields] = useState(false)
  const [fileNames, setFileNames] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [creating, setCreating] = useState(false)
  const refs = {
    accountName: useRef<HTMLInputElement>(null),
    projectName: useRef<HTMLInputElement>(null),
    companyUrl: useRef<HTMLInputElement>(null),
    managerName: useRef<HTMLInputElement>(null),
    managerEmail: useRef<HTMLInputElement>(null),
  }

  function reset() {
    setAccountName('')
    setProjectName('')
    setCompanyUrl('')
    setManagerName(firstAm.name)
    setManagerEmail(firstAm.email)
    setErrors({})
    setCustomValues({})
    setCustomErrors({})
    setFileNames([])
    setExtracting(false)
    setCreating(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) window.setTimeout(reset, 180)
  }

  function updateField(field: CreateAccountField, value: string) {
    if (field === 'accountName') setAccountName(value)
    if (field === 'projectName') setProjectName(value)
    if (field === 'companyUrl') setCompanyUrl(value)
    if (field === 'managerName') {
      setManagerName(value)
      const matched = users.find(item => item.name.toLowerCase() === value.toLowerCase())
      if (matched?.email) setManagerEmail(matched.email)
    }
    if (field === 'managerEmail') {
      setManagerEmail(value)
      const matched = users.find(item => item.email.toLowerCase() === value.toLowerCase())
      if (matched?.name) setManagerName(matched.name)
    }
    setErrors(current => ({ ...current, [field]: undefined }))
  }

  function updateCustomField(fieldKey: string, value: unknown) {
    setCustomValues(current => ({ ...current, [fieldKey]: value }))
    setCustomErrors(current => {
      if (!current[fieldKey]) return current
      const next = { ...current }
      delete next[fieldKey]
      return next
    })
  }

  function validate() {
    const nextErrors: Partial<Record<CreateAccountField, string>> = {}
    const nextCustomErrors: Record<string, string> = {}
    if (!accountName.trim()) nextErrors.accountName = 'Account name is required'
    if (!projectName.trim()) nextErrors.projectName = 'Project name is required'
    if (!companyUrl.trim()) nextErrors.companyUrl = 'Company URL is required'
    if (!managerName.trim()) nextErrors.managerName = 'Account manager name is required'
    if (!managerEmail.trim()) nextErrors.managerEmail = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail.trim())) nextErrors.managerEmail = 'Enter a valid email'
    for (const field of customFields) {
      const value = customValues[field.field_key]
      if (field.is_required && isEmptyCustomValue(value)) nextCustomErrors[field.field_key] = `${field.label} is required`
    }
    setErrors(nextErrors)
    setCustomErrors(nextCustomErrors)
    const firstInvalid = (Object.keys(nextErrors) as CreateAccountField[])[0]
    if (firstInvalid) refs[firstInvalid].current?.focus()
    return Object.keys(nextErrors).length === 0 && Object.keys(nextCustomErrors).length === 0
  }

  function applyExtractedDocumentDetails(documentNames: string[]) {
    const names = documentNames.length ? documentNames : ['Signal Project Charter.pdf', 'Signal Growth SOW.pdf']
    const primary = names.find(name => /charter/i.test(name)) ?? names[0]
    const sow = names.find(name => /sow|statement/i.test(name)) ?? names[1] ?? names[0]
    const extractedAccountName = cleanDocumentName(primary)
    const extractedProjectName = cleanProjectName(sow)
    if (!accountName.trim()) setAccountName(extractedAccountName)
    if (!projectName.trim()) setProjectName(extractedProjectName)
    if (!companyUrl.trim()) setCompanyUrl(`https://${slugify(extractedAccountName)}.com`)
    setErrors({})
  }

  async function extractFromDocuments() {
    setExtracting(true)
    await new Promise(resolve => window.setTimeout(resolve, 650))
    applyExtractedDocumentDetails(fileNames)
    setExtracting(false)
    toast.success('SOW/charter details filled into the account form')
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault()
    if (!validate()) return
    if (!token) {
      toast.error('Please log in again before creating an account')
      return
    }
    setCreating(true)
    try {
      const draft = await createOnboardingDraft(token, {
        accountName: accountName.trim(),
        projectName: projectName.trim(),
        companyUrl: normalizeCompanyUrl(companyUrl),
        managerEmail: managerEmail.trim(),
        managerName: managerName.trim(),
        fileNames,
        customFieldValues: customValuesForSubmit(customFields, customValues),
      })
      setOpen(false)
      toast.success('Account draft created for onboarding review.')
      navigate(`/accounts/onboarding?draft=${draft.id}`)
    } catch (error) {
      applyApiErrors(error)
      toast.error(error instanceof Error ? error.message : 'Account could not be created')
    } finally {
      setCreating(false)
    }
  }

  function applyApiErrors(error: unknown) {
    if (!(error instanceof ApiError) || !error.fieldErrors.length) return
    const nextErrors: Partial<Record<CreateAccountField, string>> = {}
    const nextCustomErrors: Record<string, string> = {}
    for (const fieldError of error.fieldErrors) {
      if (fieldError.field.startsWith('custom_field_values.')) {
        nextCustomErrors[fieldError.field.replace('custom_field_values.', '')] = fieldError.message
        continue
      }
      const field = mapApiField(fieldError.field)
      if (field) nextErrors[field] = fieldError.message
    }
    setErrors(current => ({ ...current, ...nextErrors }))
    setCustomErrors(current => ({ ...current, ...nextCustomErrors }))
  }

  useEffect(() => {
    if (!open || !token) return
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
  }, [open, token])

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary">
          <Plus className="h-4 w-4" />
          {label}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,900px)] w-[min(980px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white shadow-panel">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account create flow</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Create account from SOW/charter</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Upload source documents to prefill the form. This step creates an onboarding draft; approval creates the official account and engagement.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close account create flow">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="border-b border-surface-border bg-surface-secondary p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <label className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-white p-4 text-center transition-colors hover:bg-blue-tint-20">
                <Upload className="h-6 w-6 text-brand-blue" />
                <span className="mt-2 text-sm font-semibold text-ink">Upload SOW or project charter</span>
                <span className="mt-1 text-xs text-ink-secondary">PDF or DOCX names are used for prototype extraction.</span>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  accept=".pdf,.doc,.docx"
                  onChange={event => {
                    const selectedNames = Array.from(event.target.files ?? []).map(file => file.name)
                    setFileNames(selectedNames)
                    if (selectedNames.length) applyExtractedDocumentDetails(selectedNames)
                  }}
                />
              </label>
              <div className="rounded-lg border border-surface-border bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Source documents</p>
                <div className="mt-2 space-y-2">
                  {(fileNames.length ? fileNames : ['No files selected']).slice(0, 4).map(name => (
                    <div key={name} className="flex items-center gap-2 rounded-md bg-surface-secondary p-2 text-xs font-medium text-ink-secondary">
                      <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                      <span className="min-w-0 truncate">{name}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="tk-button-secondary mt-3 w-full" onClick={extractFromDocuments} disabled={extracting}>
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                  Extract details
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={createAccount} className="p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <RequiredInput ref={refs.accountName} label="Name of Account" value={accountName} error={errors.accountName} onChange={value => updateField('accountName', value)} placeholder="Signal" icon={Building2} />
              <RequiredInput ref={refs.projectName} label="Name of Project" value={projectName} error={errors.projectName} onChange={value => updateField('projectName', value)} placeholder="Predictive analytics modernization" icon={FileText} />
              <RequiredInput ref={refs.companyUrl} label="Company URL" value={companyUrl} error={errors.companyUrl} onChange={value => updateField('companyUrl', value)} placeholder="https://signal.example.com" icon={Globe2} />
              <RequiredInput ref={refs.managerName} label="Account Manager Name" value={managerName} error={errors.managerName} onChange={value => updateField('managerName', value)} placeholder="Ali Khan" icon={UserRound} list="account-manager-names" />
              <RequiredInput ref={refs.managerEmail} label="Email" value={managerEmail} error={errors.managerEmail} onChange={value => updateField('managerEmail', value)} placeholder="ali.khan@tkxel.com" icon={Mail} list="account-manager-emails" className="md:col-span-2" />
              <datalist id="account-manager-names">
                {users.map(item => <option key={item.id} value={item.name} />)}
              </datalist>
              <datalist id="account-manager-emails">
                {users.map(item => <option key={item.id} value={item.email} />)}
              </datalist>
            </div>

            {loadingCustomFields || customFields.length ? (
              <div className="mt-5 rounded-lg border border-surface-border bg-surface-secondary p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Additional account fields</h3>
                    <p className="mt-1 text-xs text-ink-secondary">Fields configured in Admin Field Builder.</p>
                  </div>
                  {loadingCustomFields ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : null}
                </div>
                {customFields.length ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {customFields.map(field => (
                      <CustomFieldInput
                        key={field.id}
                        field={field}
                        value={customValues[field.field_key]}
                        error={customErrors[field.field_key]}
                        onChange={value => updateCustomField(field.field_key, value)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">Approval creates the official account</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">
                    SOW and charter uploads help fill account intake fields here. Review and approve this draft from Onboarding before it becomes an active account.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-surface-border pt-5">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create draft
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type RequiredInputProps = {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  placeholder: string
  icon: typeof Building2
  list?: string
  className?: string
}

const RequiredInput = forwardRef<HTMLInputElement, RequiredInputProps>(function RequiredInput({
  label,
  value,
  error,
  onChange,
  placeholder,
  icon: Icon,
  list,
  className,
}, ref) {
  return (
    <label className={cn('space-y-1', className)}>
      <span className={cn('tk-label flex items-center gap-1 text-xs', error ? 'text-rag-red' : '')}>
        {label} <span className="text-brand-orange">*</span>
      </span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          ref={ref}
          className={cn('tk-input pl-10', error ? 'border-rag-red focus:border-rag-red focus:ring-rag-red/30' : '')}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          list={list}
        />
      </div>
      {error ? <p className="text-xs text-rag-red">{error}</p> : null}
    </label>
  )
})

function CustomFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: AccountCustomFieldDefinition
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const label = (
    <span className={cn('tk-label flex items-center gap-1 text-xs', error ? 'text-rag-red' : '')}>
      {field.label} {field.is_required ? <span className="text-brand-orange">*</span> : null}
    </span>
  )
  const inputClass = cn('tk-input mt-1', error ? 'border-rag-red focus:border-rag-red focus:ring-rag-red/30' : '')
  const help = field.help_text || field.description

  if (field.field_type === 'textarea') {
    return (
      <label className="space-y-1 md:col-span-2">
        {label}
        <textarea className={inputClass} rows={3} value={String(value ?? '')} onChange={event => onChange(event.target.value)} placeholder={field.placeholder ?? undefined} />
        <CustomFieldMeta help={help} error={error} />
      </label>
    )
  }

  if (field.field_type === 'single_select') {
    return (
      <label className="space-y-1">
        {label}
        <select className={inputClass} value={String(value ?? '')} onChange={event => onChange(event.target.value)}>
          <option value="">Select {field.label.toLowerCase()}</option>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <CustomFieldMeta help={help} error={error} />
      </label>
    )
  }

  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="space-y-2 md:col-span-2">
        {label}
        <div className={cn('grid gap-2 rounded-md border border-surface-border bg-white p-2 sm:grid-cols-2', error && 'border-rag-red')}>
          {field.options.map(option => (
            <label key={option} className="flex min-h-[44px] items-center gap-2 rounded-md bg-surface-secondary px-3 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={event => onChange(event.target.checked ? [...selected, option] : selected.filter(item => item !== option))}
                className="h-4 w-4 rounded border-surface-border text-brand-blue"
              />
              {option}
            </label>
          ))}
        </div>
        <CustomFieldMeta help={help} error={error} />
      </div>
    )
  }

  if (field.field_type === 'boolean') {
    return (
      <label className="space-y-1">
        {label}
        <span className={cn('mt-1 flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink', error && 'border-rag-red')}>
          <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} className="h-4 w-4 rounded border-surface-border text-brand-blue" />
          Yes
        </span>
        <CustomFieldMeta help={help} error={error} />
      </label>
    )
  }

  const inputType = field.field_type === 'number' || field.field_type === 'currency' ? 'number' : field.field_type === 'date' ? 'date' : field.field_type === 'datetime' ? 'datetime-local' : field.field_type === 'email' ? 'email' : field.field_type === 'url' ? 'url' : field.field_type === 'phone' ? 'tel' : 'text'
  return (
    <label className="space-y-1">
      {label}
      <input
        className={inputClass}
        type={inputType}
        value={String(value ?? '')}
        onChange={event => onChange(inputType === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)}
        placeholder={field.placeholder ?? undefined}
      />
      <CustomFieldMeta help={help} error={error} />
    </label>
  )
}

function CustomFieldMeta({ help, error }: { help?: string | null; error?: string }) {
  if (error) return <p className="text-xs text-rag-red">{error}</p>
  if (help) return <p className="text-xs text-ink-secondary">{help}</p>
  return null
}

function customValuesForSubmit(fields: AccountCustomFieldDefinition[], values: Record<string, unknown>) {
  return fields.reduce<Record<string, unknown>>((payload, field) => {
    const value = values[field.field_key]
    if (!isEmptyCustomValue(value)) payload[field.field_key] = value
    return payload
  }, {})
}

function isEmptyCustomValue(value: unknown) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function cleanDocumentName(name: string) {
  const base = stripDocumentExtension(name)
  const cleaned = base
    .replace(/\b(project charter|charter|statement of work|sow|msa|contract|renewal|growth|services|service|q[1-4]|20\d{2})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return toTitleCase(cleaned || base)
}

function cleanProjectName(name: string) {
  const base = stripDocumentExtension(name)
  const cleaned = base
    .replace(/\b(project charter|charter|statement of work|sow)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return toTitleCase(cleaned || 'New client engagement')
}

function stripDocumentExtension(name: string) {
  return name.replace(/\.(pdf|docx?)$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase())
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || nanoid(5)
}

function normalizeCompanyUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function mapApiField(field: string): CreateAccountField | undefined {
  const fieldMap: Record<string, CreateAccountField> = {
    account_name: 'accountName',
    project_name: 'projectName',
    company_url: 'companyUrl',
    primary_owner_name: 'managerName',
    primary_owner_email: 'managerEmail',
    source_citation: 'accountName',
  }
  return fieldMap[field]
}
