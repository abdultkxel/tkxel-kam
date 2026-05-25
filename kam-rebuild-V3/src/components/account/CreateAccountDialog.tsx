import * as Dialog from '@radix-ui/react-dialog'
import { Building2, FileSearch, FileText, Globe2, Loader2, Mail, Plus, Sparkles, Upload, UserRound, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { FormEvent, forwardRef, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { users } from '@/data/mock'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'

type CreateAccountField = 'accountName' | 'projectName' | 'companyUrl' | 'managerName' | 'managerEmail'

export function CreateAccountDialog({ label = 'Create account' }: { label?: string }) {
  const user = useRole()
  const navigate = useNavigate()
  const importAccounts = useAccountStore(state => state.importAccounts)
  const firstAm = users.find(item => item.role === 'am') ?? users[0]
  const [open, setOpen] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [managerName, setManagerName] = useState(firstAm.name)
  const [managerEmail, setManagerEmail] = useState(firstAm.email)
  const [errors, setErrors] = useState<Partial<Record<CreateAccountField, string>>>({})
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

  function validate() {
    const nextErrors: Partial<Record<CreateAccountField, string>> = {}
    if (!accountName.trim()) nextErrors.accountName = 'Account name is required'
    if (!projectName.trim()) nextErrors.projectName = 'Project name is required'
    if (!companyUrl.trim()) nextErrors.companyUrl = 'Company URL is required'
    if (!managerName.trim()) nextErrors.managerName = 'Account manager name is required'
    if (!managerEmail.trim()) nextErrors.managerEmail = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail.trim())) nextErrors.managerEmail = 'Enter a valid email'
    setErrors(nextErrors)
    const firstInvalid = (Object.keys(nextErrors) as CreateAccountField[])[0]
    if (firstInvalid) refs[firstInvalid].current?.focus()
    return Object.keys(nextErrors).length === 0
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
    setCreating(true)
    await new Promise(resolve => window.setTimeout(resolve, 400))

    const matchedAm = users.find(item => item.email.toLowerCase() === managerEmail.trim().toLowerCase()) ?? users.find(item => item.name.toLowerCase() === managerName.trim().toLowerCase())
    const ownerId = matchedAm?.id ?? `am-${slugify(managerEmail)}`
    const ownerName = matchedAm?.name ?? managerName.trim()
    const id = `acct-${slugify(accountName)}-${nanoid(4)}`
    const normalizedUrl = normalizeCompanyUrl(companyUrl)
    const account: Account = {
      id,
      name: accountName.trim(),
      projectName: projectName.trim(),
      companyUrl: normalizedUrl,
      segment: 'Growth',
      tags: ['Growth'],
      ownerId,
      ownerName,
      stage: 'Onboarding',
      riskStatus: 'warning',
      arr: 0,
      nextQbr: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      health: { overall: 45, relationship: 45, usage: 40, delivery: 45, commercial: 50 },
      stakeholders: [`Account Manager: ${ownerName}`, `AM Email: ${managerEmail.trim()}`],
      risks: ['KYC has not been completed yet'],
    }

    importAccounts([account])
    emitTimelineEvent({
      accountId: account.id,
      eventType: 'account_setup',
      module: 'manual',
      title: 'Account created from SOW/charter intake',
      description: `${account.name} was created for ${projectName.trim()} and assigned to ${ownerName}. KYC remains pending in Account Overview.`,
      performedBy: user.id,
      performedByName: user.name,
      sourceRecordId: account.id,
      sourceRecordType: 'account',
      sourceRecordRoute: `/accounts/${account.id}`,
      metadata: {
        projectName: projectName.trim(),
        companyUrl: normalizedUrl,
        accountManagerEmail: managerEmail.trim(),
        sourceDocuments: fileNames,
      },
      isSensitive: false,
      isSystemGenerated: true,
      isImmutable: false,
    })
    setOpen(false)
    setCreating(false)
    toast.success('Account created. Complete KYC in Account Overview.')
    navigate(`/accounts/${account.id}`)
  }

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
                Upload source documents to prefill the form. This step creates the account only; KYC stays inside Account Overview.
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

            <div className="mt-5 rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">KYC is completed after account creation</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">
                    SOW and charter uploads help fill account intake fields here. The full AI-assisted KYC review remains in the Account Overview KYC section.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-surface-border pt-5">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create account
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
