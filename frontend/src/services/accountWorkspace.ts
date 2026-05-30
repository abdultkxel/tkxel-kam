import { apiRequest } from '@/services/api'
import { Account, AccountStage, RiskStatus } from '@/types/account'
import { EngagementRecord, SourceDocument } from '@/types/v3'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface ApiAccountOwner {
  id: string
  user_id?: string | null
  user_name: string
  user_email?: string | null
  ownership_role: string
}

interface ApiAccount {
  id: string
  name: string
  project_name?: string | null
  company_url?: string | null
  segment: string
  region?: string | null
  lifecycle_status: string
  risk_status: RiskStatus
  commercial_value: number
  currency: string
  health: {
    overall: number
    relationship: number
    usage: number
    delivery: number
    commercial: number
  }
  next_governance_at?: string | null
  updated_at: string
  primary_owner?: ApiAccountOwner | null
  owners: ApiAccountOwner[]
  governance_completeness: Record<string, boolean>
}

interface ApiSourceCitation {
  id: string
  source_document_id: string
  label: string
  page_number?: number | null
  excerpt: string
}

interface ApiSourceDocument {
  id: string
  account_id?: string | null
  engagement_id?: string | null
  draft_id?: string | null
  title: string
  source_type: string
  uploaded_by_name: string
  extraction_status: string
  confidence: number
  pages: number
  created_at: string
  citations: ApiSourceCitation[]
}

interface ApiEngagement {
  id: string
  account_id: string
  name: string
  status: EngagementRecord['status']
  owner_id?: string | null
  owner_name: string
  ops_lead_id?: string | null
  ops_lead_name?: string | null
  service_lines: string[]
  value: number
  currency: string
  delivery_status: string
  delivery_health: number
  start_date: string
  end_date?: string | null
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days?: number | null
  auto_renewal: boolean
  commercial_context?: string | null
  resource_dependency?: string | null
  risks: string[]
  source_citation?: string | null
  source_documents: ApiSourceDocument[]
}

interface ApiDraftEngagement {
  id: string
  draft_id: string
  name: string
  owner_id?: string | null
  owner_name?: string | null
  ops_lead_id?: string | null
  ops_lead_name?: string | null
  service_lines: string[]
  value: number
  currency: string
  delivery_status: string
  start_date?: string | null
  end_date?: string | null
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days?: number | null
  auto_renewal: boolean
  commercial_context?: string | null
  resource_dependency?: string | null
  risks: string[]
  source_citation?: string | null
  confidence: number
}

interface ApiOnboardingDraft {
  id: string
  status: 'ready_for_review' | 'approved' | 'rejected' | 'linked'
  account_name: string
  project_name?: string | null
  company_url?: string | null
  lifecycle_status: string
  segment: string
  region?: string | null
  commercial_value: number
  currency: string
  primary_owner_id?: string | null
  primary_owner_name?: string | null
  primary_owner_email?: string | null
  confidence: number
  missing_fields: string[]
  conflicts: string[]
  source_citation?: string | null
  created_by_name: string
  approved_account_id?: string | null
  created_at: string
  source_documents: ApiSourceDocument[]
  engagement_drafts: ApiDraftEngagement[]
}

export interface OnboardingDraftView {
  id: string
  status: ApiOnboardingDraft['status']
  createdAt: string
  createdByName: string
  accountDraft: Account
  engagementDrafts: EngagementRecord[]
  sourceDocuments: SourceDocument[]
  sourceDocumentIds: string[]
  confidence: number
  missingFields: string[]
  conflicts: string[]
  approvedAccountId?: string | null
}

export interface CreateDraftPayload {
  accountName: string
  projectName: string
  companyUrl: string
  managerEmail: string
  managerName: string
  fileNames: string[]
  customFieldValues?: Record<string, unknown>
}

export interface AccountCustomFieldDefinition {
  id: string
  module: string
  field_key: string
  label: string
  description?: string | null
  field_type: 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'single_select' | 'multi_select' | 'email' | 'url' | 'phone'
  placeholder?: string | null
  help_text?: string | null
  options: string[]
  is_required: boolean
  is_sensitive: boolean
  show_in_list: boolean
  show_in_detail: boolean
  sort_order: number
}

export async function listAccounts(token: string, params: URLSearchParams) {
  const query = params.toString()
  const page = await apiRequest<Page<ApiAccount>>(`/api/accounts${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapApiAccount) }
}

export async function getAccount(token: string, accountId: string) {
  return mapApiAccount(await apiRequest<ApiAccount>(`/api/accounts/${accountId}`, { token }))
}

export async function listAccountCustomFields(token: string) {
  return apiRequest<AccountCustomFieldDefinition[]>('/api/accounts/custom-fields', { token })
}

export async function listOnboardingDrafts(token: string, params: URLSearchParams) {
  const query = params.toString()
  const page = await apiRequest<Page<ApiOnboardingDraft>>(`/api/onboarding/drafts${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapDraft) }
}

export async function createOnboardingDraft(token: string, payload: CreateDraftPayload) {
  return mapDraft(
    await apiRequest<ApiOnboardingDraft>('/api/onboarding/drafts', {
      method: 'POST',
      token,
      body: JSON.stringify(buildDraftPayload(payload)),
    }),
  )
}

export async function approveOnboardingDraft(token: string, draftId: string) {
  return mapDraft(
    await apiRequest<ApiOnboardingDraft>(`/api/onboarding/drafts/${draftId}/approve`, {
      method: 'POST',
      token,
    }),
  )
}

export async function rejectOnboardingDraft(token: string, draftId: string, reason: string) {
  return mapDraft(
    await apiRequest<ApiOnboardingDraft>(`/api/onboarding/drafts/${draftId}/reject`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason }),
    }),
  )
}

export async function listEngagements(token: string, accountId: string, params = new URLSearchParams()) {
  const query = params.toString()
  const page = await apiRequest<Page<ApiEngagement>>(`/api/accounts/${accountId}/engagements${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(item => mapEngagement(item, '')) }
}

function buildDraftPayload(payload: CreateDraftPayload) {
  const now = new Date().toISOString()
  const sourceNames = payload.fileNames.length ? payload.fileNames : [`${payload.accountName} Project Charter.pdf`]
  const primarySource = sourceNames[0]
  return {
    account_name: payload.accountName,
    project_name: payload.projectName,
    company_url: normalizeUrl(payload.companyUrl),
    lifecycle_status: 'Onboarding',
    segment: 'Growth',
    region: 'Global',
    commercial_value: 0,
    currency: 'USD',
    primary_owner_name: payload.managerName,
    primary_owner_email: payload.managerEmail,
    confidence: 82,
    source_citation: `${primarySource}: account and project details provided during intake.`,
    source_documents: sourceNames.map((name, index) => ({
      title: stripExtension(name),
      source_type: /sow|statement/i.test(name) ? 'sow' : 'project_charter',
      file_name: name,
      confidence: 82,
      pages: 1,
      citations: [
        {
          label: `${stripExtension(name)} p1`,
          page_number: 1,
          excerpt: `${payload.accountName} ${payload.projectName}`.trim(),
          field_key: index === 0 ? 'account_name' : 'engagement_name',
        },
      ],
    })),
    custom_field_values: payload.customFieldValues ?? {},
    engagement_drafts: [
      {
        name: payload.projectName,
        owner_name: payload.managerName,
        service_lines: ['Account onboarding'],
        value: 0,
        currency: 'USD',
        delivery_status: 'active',
        start_date: now,
        commercial_context: `Initial engagement created from ${primarySource}.`,
        risks: ['KYC has not been completed yet'],
        source_citation: `${primarySource}: engagement context provided during intake.`,
        confidence: 82,
      },
    ],
  }
}

function mapDraft(draft: ApiOnboardingDraft): OnboardingDraftView {
  const account = mapApiAccount({
    id: draft.approved_account_id ?? draft.id,
    name: draft.account_name,
    project_name: draft.project_name,
    company_url: draft.company_url,
    segment: draft.segment,
    region: draft.region,
    lifecycle_status: draft.lifecycle_status,
    risk_status: 'warning',
    commercial_value: draft.commercial_value,
    currency: draft.currency,
    health: { overall: 45, relationship: 45, usage: 45, delivery: 45, commercial: 45 },
    next_governance_at: null,
    updated_at: draft.created_at,
    primary_owner: draft.primary_owner_name
      ? {
          id: draft.primary_owner_id ?? 'pending-owner',
          user_id: draft.primary_owner_id,
          user_name: draft.primary_owner_name,
          user_email: draft.primary_owner_email,
          ownership_role: 'primary_am',
        }
      : null,
    owners: [],
    governance_completeness: {},
  })
  const documents = draft.source_documents.map(mapSourceDocument)
  return {
    id: draft.id,
    status: draft.status,
    createdAt: draft.created_at,
    createdByName: draft.created_by_name,
    accountDraft: account,
    engagementDrafts: draft.engagement_drafts.map(item => mapDraftEngagement(item, draft)),
    sourceDocuments: documents,
    sourceDocumentIds: documents.map(document => document.id),
    confidence: draft.confidence,
    missingFields: draft.missing_fields,
    conflicts: draft.conflicts,
    approvedAccountId: draft.approved_account_id,
  }
}

function mapApiAccount(account: ApiAccount): Account {
  const owner = account.primary_owner ?? account.owners[0]
  const segment = toSegment(account.segment)
  return {
    id: account.id,
    name: account.name,
    projectName: account.project_name ?? undefined,
    companyUrl: account.company_url ?? undefined,
    segment,
    tags: [account.segment, account.region].filter(Boolean) as string[],
    ownerId: owner?.user_id ?? owner?.id ?? '',
    ownerName: owner?.user_name ?? 'Unassigned',
    ownerEmail: owner?.user_email ?? undefined,
    stage: toStage(account.lifecycle_status),
    riskStatus: account.risk_status,
    arr: Number(account.commercial_value ?? 0),
    nextQbr: account.next_governance_at ?? account.updated_at,
    health: account.health,
    stakeholders: account.owners.map(item => `${ownerLabel(item.ownership_role)}: ${item.user_name}`),
    risks: Object.entries(account.governance_completeness)
      .filter(([, complete]) => !complete)
      .map(([key]) => `${key.replace(/_/g, ' ')} is incomplete`),
  }
}

function mapDraftEngagement(engagement: ApiDraftEngagement, draft: ApiOnboardingDraft): EngagementRecord {
  const startDate = engagement.start_date ?? draft.created_at
  const endDate = engagement.end_date ?? engagement.renewal_date ?? startDate
  const renewalDate = engagement.renewal_date ?? endDate
  return {
    id: engagement.id,
    accountId: draft.approved_account_id ?? draft.id,
    accountName: draft.account_name,
    name: engagement.name,
    status: 'draft',
    ownerId: engagement.owner_id ?? draft.primary_owner_id ?? '',
    ownerName: engagement.owner_name ?? draft.primary_owner_name ?? 'Unassigned',
    opsLeadId: engagement.ops_lead_id ?? '',
    opsLeadName: engagement.ops_lead_name ?? 'Unassigned',
    serviceLines: engagement.service_lines,
    value: Number(engagement.value ?? 0),
    deliveryHealth: engagement.confidence,
    resourceDependency: engagement.resource_dependency ?? 'No resource dependency recorded.',
    commercialContext: engagement.commercial_context ?? 'No commercial context recorded yet.',
    risks: engagement.risks,
    sourceDocumentIds: draft.source_documents.map(document => document.id),
    renewalTerms: {
      startDate,
      endDate,
      renewalDate,
      noticeDeadline: engagement.notice_deadline ?? renewalDate,
      noticePeriodDays: engagement.notice_period_days ?? 0,
      autoRenewal: engagement.auto_renewal,
      commercialExposure: Number(engagement.value ?? 0),
      daysToExpiry: daysUntil(endDate),
      riskStatus: engagement.confidence < 60 ? 'critical' : engagement.confidence < 75 ? 'warning' : 'healthy',
      confidence: engagement.confidence,
      sourceDocumentId: draft.source_documents[0]?.id ?? '',
      sourceCitation: engagement.source_citation ?? draft.source_citation ?? 'No source citation recorded.',
    },
  }
}

function mapEngagement(engagement: ApiEngagement, accountName: string): EngagementRecord {
  const endDate = engagement.end_date ?? engagement.renewal_date ?? engagement.start_date
  const renewalDate = engagement.renewal_date ?? endDate
  return {
    id: engagement.id,
    accountId: engagement.account_id,
    accountName,
    name: engagement.name,
    status: engagement.status,
    ownerId: engagement.owner_id ?? '',
    ownerName: engagement.owner_name,
    opsLeadId: engagement.ops_lead_id ?? '',
    opsLeadName: engagement.ops_lead_name ?? 'Unassigned',
    serviceLines: engagement.service_lines,
    value: Number(engagement.value ?? 0),
    deliveryHealth: engagement.delivery_health,
    resourceDependency: engagement.resource_dependency ?? 'No resource dependency recorded.',
    commercialContext: engagement.commercial_context ?? 'No commercial context recorded yet.',
    risks: engagement.risks,
    sourceDocumentIds: engagement.source_documents.map(document => document.id),
    renewalTerms: {
      startDate: engagement.start_date,
      endDate,
      renewalDate,
      noticeDeadline: engagement.notice_deadline ?? renewalDate,
      noticePeriodDays: engagement.notice_period_days ?? 0,
      autoRenewal: engagement.auto_renewal,
      commercialExposure: Number(engagement.value ?? 0),
      daysToExpiry: daysUntil(endDate),
      riskStatus: engagement.delivery_health < 60 ? 'critical' : engagement.delivery_health < 75 ? 'warning' : 'healthy',
      confidence: engagement.delivery_health,
      sourceDocumentId: engagement.source_documents[0]?.id ?? '',
      sourceCitation: engagement.source_citation ?? 'No source citation recorded.',
    },
  }
}

function mapSourceDocument(document: ApiSourceDocument): SourceDocument {
  return {
    id: document.id,
    accountId: document.account_id ?? undefined,
    engagementId: document.engagement_id ?? undefined,
    name: document.title,
    type: toSourceType(document.source_type),
    uploadedAt: document.created_at,
    uploadedByName: document.uploaded_by_name,
    confidence: document.confidence,
    pages: document.pages,
    status: document.extraction_status === 'needs_review' ? 'needs_review' : 'parsed',
    citations: document.citations.map(citation => ({
      id: citation.id,
      documentId: citation.source_document_id,
      label: citation.label,
      page: citation.page_number ?? 1,
      excerpt: citation.excerpt,
    })),
  }
}

function toSegment(value: string): Account['segment'] {
  if (value === 'Strategic' || value === 'Enterprise' || value === 'Growth') return value
  return 'Growth'
}

function toStage(value: string): AccountStage {
  const stages: AccountStage[] = ['Onboarding', 'Active', 'Adoption', 'Expansion', 'Expansion Focus', 'Renewal', 'Renewal Focus', 'At Risk', 'Dormant', 'Archived']
  return stages.includes(value as AccountStage) ? (value as AccountStage) : 'Onboarding'
}

function toSourceType(value: string): SourceDocument['type'] {
  if (value === 'sow' || value === 'commercial_note' || value === 'research') return value
  return 'project_charter'
}

function ownerLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function stripExtension(value: string) {
  return value.replace(/\.(pdf|docx?|xlsx?|csv)$/i, '')
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function daysUntil(value: string) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}
