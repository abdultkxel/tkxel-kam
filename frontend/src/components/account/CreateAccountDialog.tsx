import * as Dialog from '@radix-ui/react-dialog'
import { Building2, FileSearch, FileText, Globe2, Linkedin, Loader2, Plus, Sparkles, Upload, UserRound, X } from 'lucide-react'
import { FormEvent, forwardRef, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { DocumentExtractionReviewPanel } from '@/components/account/DocumentExtractionReviewPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { ApiError } from '@/services/api'
import {
  AccountCustomFieldDefinition,
  createOnboardingDraft,
  createOnboardingDraftFromUpload,
  listAccountCustomFields,
  listOnboardingAccountManagers,
  OnboardingAccountManager,
  OnboardingDraftView,
  updateOnboardingDraft,
} from '@/services/accountWorkspace'
import { cn } from '@/utils/cn'

type CreateAccountField = 'accountName' | 'projectName' | 'companyUrl' | 'linkedinUrl' | 'managerId'

export function CreateAccountDialog({ label = 'Create account' }: { label?: string }) {
  const { token } = useAuth()
  const currentUser = useRole()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [managerId, setManagerId] = useState('')
  const [accountManagers, setAccountManagers] = useState<OnboardingAccountManager[]>([])
  const [errors, setErrors] = useState<Partial<Record<CreateAccountField, string>>>({})
  const [customFields, setCustomFields] = useState<AccountCustomFieldDefinition[]>([])
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [loadingCustomFields, setLoadingCustomFields] = useState(false)
  const [loadingManagers, setLoadingManagers] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [selectedFileName, setSelectedFileName] = useState('')
  const [filePreviewUrl, setFilePreviewUrl] = useState('')
  const [uploadedDraft, setUploadedDraft] = useState<OnboardingDraftView | null>(null)
  const [extractionReviewHtml, setExtractionReviewHtml] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [creating, setCreating] = useState(false)
  const assignableManagers = assignableAccountManagers(accountManagers, currentUser)
  const selectedManager = assignableManagers.find(manager => manager.id === managerId)
  const refs = {
    accountName: useRef<HTMLInputElement>(null),
    projectName: useRef<HTMLInputElement>(null),
    companyUrl: useRef<HTMLInputElement>(null),
    linkedinUrl: useRef<HTMLInputElement>(null),
    managerId: useRef<HTMLSelectElement>(null),
  }

  function reset() {
    setAccountName('')
    setProjectName('')
    setCompanyUrl('')
    setLinkedinUrl('')
    setManagerId(defaultAccountManagerId(assignableManagers, currentUser))
    setErrors({})
    setCustomValues({})
    setCustomErrors({})
    setFiles([])
    setSelectedFileName('')
    setFilePreviewUrl('')
    setUploadedDraft(null)
    setExtractionReviewHtml('')
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
    if (field === 'linkedinUrl') setLinkedinUrl(value)
    if (field === 'managerId') setManagerId(value)
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
    if (!linkedinUrl.trim()) nextErrors.linkedinUrl = 'LinkedIn URL is required'
    else if (!isLinkedinUrl(linkedinUrl)) nextErrors.linkedinUrl = 'Enter a valid LinkedIn URL'
    if (!managerId || !selectedManager) nextErrors.managerId = 'Select an account manager'
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

  function applyExtractedDraftDetails(draft: OnboardingDraftView) {
    setAccountName(draft.accountDraft.name)
    setProjectName(draft.accountDraft.projectName ?? draft.engagementDrafts[0]?.name ?? '')
    setCompanyUrl(draft.accountDraft.companyUrl ?? '')
    setLinkedinUrl(draft.accountDraft.linkedinUrl ?? linkedinUrl)
    const matchedManager = assignableManagers.find(manager => (
      manager.id === draft.accountDraft.ownerId ||
      (draft.accountDraft.ownerEmail && manager.email.toLowerCase() === draft.accountDraft.ownerEmail.toLowerCase())
    ))
    if (matchedManager) setManagerId(matchedManager.id)
    setErrors({})
  }

  async function extractFromDocuments(): Promise<OnboardingDraftView | null> {
    if (!token) {
      toast.error('Please log in again before extracting source documents')
      return null
    }
    if (!files.length) {
      toast.error('Select at least one SOW, charter, or source document')
      return null
    }
    if (!selectedManager) {
      setErrors(current => ({ ...current, managerId: 'Select an account manager' }))
      refs.managerId.current?.focus()
      return null
    }
    setExtracting(true)
    try {
      const draft = await createOnboardingDraftFromUpload(token, {
        files,
        linkedinUrl: normalizeLinkedinUrl(linkedinUrl),
        managerId: selectedManager.id,
        managerEmail: selectedManager.email,
        managerName: selectedManager.name,
      })
      setUploadedDraft(draft)
      applyExtractedDraftDetails(draft)
      setExtractionReviewHtml(buildOnboardingExtractionReviewHtml(draft))
      toast.success('SOW/charter extracted for review')
      return draft
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'SOW/charter extraction failed')
      return null
    } finally {
      setExtracting(false)
    }
  }

  async function createAccount(event: FormEvent) {
    event.preventDefault()
    if (!validate()) return
    if (!token) {
      toast.error('Please log in again before creating an account')
      return
    }
    if (!selectedManager) {
      setErrors(current => ({ ...current, managerId: 'Select an account manager' }))
      refs.managerId.current?.focus()
      return
    }
    setCreating(true)
    try {
      if (files.length) {
        const draft = uploadedDraft ?? (await extractFromDocuments())
        if (!draft) return
        const reviewed = await updateOnboardingDraft(token, draft.id, {
          accountName: accountName.trim(),
          projectName: projectName.trim(),
          companyUrl: normalizeCompanyUrl(companyUrl),
          linkedinUrl: normalizeLinkedinUrl(linkedinUrl),
          managerId: selectedManager.id,
          managerEmail: selectedManager.email,
          managerName: selectedManager.name,
        })
        setOpen(false)
        toast.success('Extracted account draft saved for onboarding review.')
        navigate(`/accounts/onboarding?draft=${reviewed.id}`)
        return
      }
      const draft = await createOnboardingDraft(token, {
        accountName: accountName.trim(),
        projectName: projectName.trim(),
        companyUrl: normalizeCompanyUrl(companyUrl),
        linkedinUrl: normalizeLinkedinUrl(linkedinUrl),
        managerId: selectedManager.id,
        managerEmail: selectedManager.email,
        managerName: selectedManager.name,
        fileNames: [],
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

  useEffect(() => {
    if (!files.length) {
      setFilePreviewUrl('')
      return
    }
    const selected = files.find(file => file.name === selectedFileName) ?? files[0]
    const url = URL.createObjectURL(selected)
    setFilePreviewUrl(url)
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
  }, [files, selectedFileName])

  useEffect(() => {
    if (!open || !token) return
    let active = true
    setLoadingManagers(true)
    listOnboardingAccountManagers(token)
      .then(managers => {
        if (!active) return
        setAccountManagers(managers)
        setManagerId(current => current || defaultAccountManagerId(assignableAccountManagers(managers, currentUser), currentUser))
      })
      .catch(() => {
        if (!active) return
        setAccountManagers([])
      })
      .finally(() => {
        if (active) setLoadingManagers(false)
      })
    return () => {
      active = false
    }
  }, [currentUser, open, token])

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(94vh,980px)] w-[min(1280px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white shadow-panel">
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
                <span className="mt-1 text-xs text-ink-secondary">PDF, DOCX, and DOC files are uploaded, stored, and extracted.</span>
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  accept=".pdf,.doc,.docx"
                  onChange={event => {
                    const selectedFiles = Array.from(event.target.files ?? [])
                    setFiles(selectedFiles)
                    setSelectedFileName(selectedFiles[0]?.name ?? '')
                    setUploadedDraft(null)
                    setExtractionReviewHtml(selectedFiles.length ? buildPendingExtractionReviewHtml(selectedFiles) : '')
                  }}
                />
              </label>
              <div className="rounded-lg border border-surface-border bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Source documents</p>
                <div className="mt-2 space-y-2">
                  {(files.length ? files.map(file => file.name) : ['No files selected']).slice(0, 4).map(name => (
                    <button
                      key={name}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md p-2 text-left text-xs font-medium transition-colors',
                        selectedFileName === name ? 'bg-blue-tint-20 text-brand-blue' : 'bg-surface-secondary text-ink-secondary',
                      )}
                      onClick={() => setSelectedFileName(name)}
                      disabled={!files.length}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                      <span className="min-w-0 truncate">{name}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="tk-button-secondary mt-3 w-full" onClick={() => void extractFromDocuments()} disabled={extracting || !files.length}>
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                  Extract details
                </button>
              </div>
            </div>
            {files.length ? (
              <div className="mt-5">
                <DocumentExtractionReviewPanel
                  title="SOW extraction preview"
                  eyebrow="Source review"
                  documentName={selectedFileName || files[0]?.name}
                  previewUrl={filePreviewUrl}
                  mimeType={(files.find(file => file.name === selectedFileName) ?? files[0])?.type}
                  extractedHtml={extractionReviewHtml}
                  onExtractedHtmlChange={setExtractionReviewHtml}
                  disabled={extracting}
                  sources={files.map(file => ({ id: file.name, name: file.name, status: uploadedDraft ? 'extracted' : 'selected' }))}
                  selectedSourceId={selectedFileName}
                  onSelectSource={setSelectedFileName}
                />
              </div>
            ) : null}
          </div>

          <form onSubmit={createAccount} className="p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <RequiredInput ref={refs.accountName} label="Name of Account" value={accountName} error={errors.accountName} onChange={value => updateField('accountName', value)} placeholder="Signal" icon={Building2} />
              <RequiredInput ref={refs.projectName} label="Name of Project" value={projectName} error={errors.projectName} onChange={value => updateField('projectName', value)} placeholder="Predictive analytics modernization" icon={FileText} />
              <RequiredInput ref={refs.companyUrl} label="Company URL" value={companyUrl} error={errors.companyUrl} onChange={value => updateField('companyUrl', value)} placeholder="https://signal.example.com" icon={Globe2} />
              <RequiredInput ref={refs.linkedinUrl} label="LinkedIn URL" value={linkedinUrl} error={errors.linkedinUrl} onChange={value => updateField('linkedinUrl', value)} placeholder="https://www.linkedin.com/company/signal" icon={Linkedin} />
              <AccountManagerSelect
                ref={refs.managerId}
                value={managerId}
                error={errors.managerId}
                managers={assignableManagers}
                loading={loadingManagers}
                onChange={value => updateField('managerId', value)}
              />
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
              <button type="submit" className="tk-button-primary" disabled={creating || extracting}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {files.length ? (uploadedDraft ? 'Open onboarding review' : 'Create draft from upload') : 'Create draft'}
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

type AccountManagerSelectProps = {
  value: string
  error?: string
  managers: OnboardingAccountManager[]
  loading: boolean
  onChange: (value: string) => void
}

const AccountManagerSelect = forwardRef<HTMLSelectElement, AccountManagerSelectProps>(function AccountManagerSelect({
  value,
  error,
  managers,
  loading,
  onChange,
}, ref) {
  return (
    <label className="space-y-1 md:col-span-2">
      <span className={cn('tk-label flex items-center gap-1 text-xs', error ? 'text-rag-red' : '')}>
        Account Manager <span className="text-brand-orange">*</span>
      </span>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <select
          ref={ref}
          className={cn('tk-input pl-10', error ? 'border-rag-red focus:border-rag-red focus:ring-rag-red/30' : '')}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={loading}
        >
          <option value="">{loading ? 'Loading account managers...' : 'Select account manager'}</option>
          {managers.map(manager => (
            <option key={manager.id} value={manager.id}>
              {manager.name} - {manager.email}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-xs text-rag-red">{error}</p> : null}
      {!loading && managers.length === 0 ? <p className="text-xs text-rag-red">No active account managers are available.</p> : null}
    </label>
  )
})

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

function buildPendingExtractionReviewHtml(files: File[]) {
  const fileItems = files.map(file => `<li>${escapeHtml(file.name)} · ${formatBytes(file.size)}</li>`).join('')
  return [
    '<h4>Selected source documents</h4>',
    `<ul>${fileItems}</ul>`,
    '<p>Click <strong>Extract details</strong> to store these files and review source-backed account and engagement fields.</p>',
  ].join('')
}

function buildOnboardingExtractionReviewHtml(draft: OnboardingDraftView) {
  const extractedTextSections = draft.sourceDocuments
    .filter(document => document.extractedText?.trim())
    .map(document => [
      `<h5>${escapeHtml(document.fileName || document.name)}</h5>`,
      `<p>${textWithLineBreaks(document.extractedText || '')}</p>`,
    ].join(''))
    .join('')
  const engagementItems = draft.engagementDrafts.map(engagement => (
    `<li><strong>${escapeHtml(engagement.name)}</strong> · ${escapeHtml(engagement.serviceLines.join(', ') || 'No service lines')} · ${formatCurrency(engagement.value)}</li>`
  )).join('')
  const sourceItems = draft.sourceDocuments.map(document => (
    `<li><strong>${escapeHtml(document.name)}</strong> · ${escapeHtml(document.extractionStatus || document.status)} · ${document.confidence}% confidence · ${document.pages} page${document.pages === 1 ? '' : 's'}</li>`
  )).join('')
  const citationItems = draft.sourceDocuments.flatMap(document => document.citations.map(citation => (
    `<li><strong>${escapeHtml(citation.label)}</strong>${citation.page ? ` · page ${citation.page}` : ''}: ${escapeHtml(citation.excerpt)}</li>`
  ))).slice(0, 12).join('')
  const issues = [...draft.missingFields.map(item => `Missing: ${item}`), ...draft.conflicts.map(item => `Conflict: ${item}`)]

  return [
    '<h4>Full extracted PDF text</h4>',
    extractedTextSections || '<p>No extracted document text was returned yet.</p>',
    '<h4>Extracted account draft</h4>',
    '<ul>',
    `<li><strong>Account:</strong> ${escapeHtml(draft.accountDraft.name)}</li>`,
    `<li><strong>Project:</strong> ${escapeHtml(draft.accountDraft.projectName || draft.engagementDrafts[0]?.name || 'Not detected')}</li>`,
    `<li><strong>Company URL:</strong> ${escapeHtml(draft.accountDraft.companyUrl || 'Not detected')}</li>`,
    `<li><strong>Owner:</strong> ${escapeHtml(draft.accountDraft.ownerName || 'Unassigned')}</li>`,
    `<li><strong>Confidence:</strong> ${draft.confidence}%</li>`,
    '</ul>',
    '<h4>Engagement draft</h4>',
    engagementItems ? `<ul>${engagementItems}</ul>` : '<p>No engagement draft was extracted.</p>',
    '<h4>Source documents</h4>',
    sourceItems ? `<ul>${sourceItems}</ul>` : '<p>No source documents are attached.</p>',
    citationItems ? `<h4>Citations</h4><ul>${citationItems}</ul>` : '',
    issues.length ? `<h4>Review issues</h4><ul>${issues.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No extraction conflicts are currently flagged.</p>',
  ].join('')
}

function normalizeCompanyUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value) || value === 0) return 'Value not detected'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

function textWithLineBreaks(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br/>')
}

function normalizeLinkedinUrl(value: string) {
  return normalizeCompanyUrl(value)
}

function defaultAccountManagerId(managers: OnboardingAccountManager[], currentUser: { id: string; email: string; role: string }) {
  if (!['account_manager', 'am'].includes(currentUser.role)) return ''
  const self = managers.find(manager => manager.id === currentUser.id || manager.email.toLowerCase() === currentUser.email.toLowerCase())
  return self?.id ?? ''
}

function assignableAccountManagers(managers: OnboardingAccountManager[], currentUser: { id: string; email: string; role: string }) {
  if (!['account_manager', 'am'].includes(currentUser.role)) return managers
  return managers.filter(manager => manager.id === currentUser.id || manager.email.toLowerCase() === currentUser.email.toLowerCase())
}

function isLinkedinUrl(value: string) {
  try {
    const host = new URL(normalizeLinkedinUrl(value)).hostname.toLowerCase()
    return host === 'linkedin.com' || host.endsWith('.linkedin.com')
  } catch {
    return false
  }
}

function mapApiField(field: string): CreateAccountField | undefined {
  const fieldMap: Record<string, CreateAccountField> = {
    account_name: 'accountName',
    project_name: 'projectName',
    company_url: 'companyUrl',
    linkedin_url: 'linkedinUrl',
    primary_owner_id: 'managerId',
    primary_owner_name: 'managerId',
    primary_owner_email: 'managerId',
    source_citation: 'accountName',
  }
  return fieldMap[field]
}
