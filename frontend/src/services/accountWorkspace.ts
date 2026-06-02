import { apiRequest } from '@/services/api'
import type { Account, AccountStage, RiskStatus } from '@/types/account'
import type { TimelineEntry, TimelineEventType, TimelineModule } from '@/types/timeline'
import type {
  EngagementCommercialStatus,
  EngagementDeliveryStatus,
  EngagementHealthStatus,
  EngagementRecord,
  EngagementRenewalRisk,
  EngagementRenewalStatus,
  EngagementSourceLink,
  SourceDocument,
} from '@/types/v3'

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
  is_primary?: boolean
  is_active?: boolean
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
  description?: string | null
  status: EngagementRecord['status']
  owner_id?: string | null
  owner_name: string
  ops_lead_id?: string | null
  ops_lead_name?: string | null
  service_lines: string[]
  source_document_ids?: string[]
  source_links?: EngagementSourceLink[]
  value?: number
  contract_value?: number
  currency: string
  delivery_status: EngagementDeliveryStatus
  commercial_status?: EngagementCommercialStatus
  delivery_health?: number
  health_score?: number
  health_status?: EngagementHealthStatus
  renewal_risk?: EngagementRenewalRisk
  start_date: string
  end_date?: string | null
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days?: number | null
  days_to_expiry?: number | null
  renewal_status?: EngagementRenewalStatus | null
  auto_renewal: boolean
  commercial_context?: string | null
  resource_dependency?: string | null
  resource_dependency_notes?: string | null
  risks: string[]
  source_citation?: string | null
  created_by_id?: string | null
  updated_by_id?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at?: string
  updated_at?: string
  source_documents?: ApiSourceDocument[]
}

interface ApiTimelineEvent {
  id: string
  account_id: string
  engagement_id?: string | null
  event_type: string
  title: string
  description: string
  previous_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  actor_id: string
  actor_name: string
  source_module: string
  source_record_id?: string | null
  source_record_type?: string | null
  source_record_route?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
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

export interface AccountCsvImportRow {
  account_name?: string
  project_name?: string
  company_url?: string
  industry?: string
  arr?: number
  commercial_value?: number
  currency?: string
  stage?: string
  lifecycle_status?: string
  owner_email?: string
  owner_name?: string
  segment?: string
  region?: string
  custom_field_values?: Record<string, unknown>
}

interface ApiAccountCsvImportResult {
  row_number: number
  status: 'created' | 'updated' | 'skipped' | 'failed'
  account_name?: string | null
  message: string
  account_id?: string | null
  draft_id?: string | null
  errors: { field: string; message: string }[]
  account?: ApiAccount | null
}

interface ApiAccountCsvImportResponse {
  created: number
  updated: number
  skipped: number
  failed: number
  total_rows: number
  results: ApiAccountCsvImportResult[]
}

export interface AccountCsvImportResult {
  rowNumber: number
  status: ApiAccountCsvImportResult['status']
  accountName?: string | null
  message: string
  accountId?: string | null
  draftId?: string | null
  errors: { field: string; message: string }[]
  account?: Account | null
}

export interface AccountCsvImportResponse {
  created: number
  updated: number
  skipped: number
  failed: number
  totalRows: number
  results: AccountCsvImportResult[]
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

export interface AccountOwnerView {
  id: string
  userId?: string | null
  name: string
  email?: string | null
  ownershipRole: string
  isPrimary: boolean
  isActive: boolean
}

export interface EngagementListParams {
  search?: string
  status?: EngagementRecord['status'] | ''
  owner?: string
  service_line?: string
  renewal_window?: 'next_30' | 'next_60' | 'next_90' | 'expired' | 'notice_due' | 'missing' | ''
  risk_status?: RiskStatus | ''
  sort?: 'renewal_date' | 'end_date' | 'value' | 'delivery_status' | 'updated_date'
  direction?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface EngagementTimelineParams {
  page?: number
  page_size?: number
}

export interface EngagementCreatePayload {
  name: string
  description?: string | null
  ownerId: string
  opsLeadId?: string | null
  serviceLines: string[]
  sourceLinks?: EngagementSourceLink[]
  value?: number
  contractValue?: number
  currency?: string
  deliveryStatus?: EngagementDeliveryStatus
  commercialStatus?: EngagementCommercialStatus
  deliveryHealth?: number
  healthScore?: number
  healthStatus?: EngagementHealthStatus
  renewalRisk?: EngagementRenewalRisk
  startDate: string
  endDate?: string | null
  renewalDate?: string | null
  noticePeriodDays?: number | null
  autoRenewal?: boolean
  commercialContext?: string | null
  resourceDependency?: string | null
  resourceDependencyNotes?: string | null
  risks?: string[]
  sourceCitation?: string | null
}

export interface EngagementUpdatePayload {
  name?: string
  description?: string | null
  status?: EngagementRecord['status']
  ownerId?: string | null
  opsLeadId?: string | null
  serviceLines?: string[]
  sourceLinks?: EngagementSourceLink[]
  value?: number
  contractValue?: number
  currency?: string
  deliveryStatus?: EngagementDeliveryStatus
  commercialStatus?: EngagementCommercialStatus
  deliveryHealth?: number
  healthScore?: number
  healthStatus?: EngagementHealthStatus
  renewalRisk?: EngagementRenewalRisk
  startDate?: string
  endDate?: string | null
  renewalDate?: string | null
  noticePeriodDays?: number | null
  autoRenewal?: boolean
  commercialContext?: string | null
  resourceDependency?: string | null
  resourceDependencyNotes?: string | null
  risks?: string[]
  sourceCitation?: string | null
}

export async function listAccounts(token: string, params: URLSearchParams) {
  const query = params.toString()
  const page = await apiRequest<Page<ApiAccount>>(`/api/accounts${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapApiAccount) }
}

export async function getAccount(token: string, accountId: string) {
  return mapApiAccount(await apiRequest<ApiAccount>(`/api/accounts/${accountId}`, { token }))
}

export async function listAccountOwners(token: string, accountId: string) {
  return (await apiRequest<ApiAccountOwner[]>(`/api/accounts/${accountId}/owners`, { token })).map(mapAccountOwner)
}

export async function listAccountCustomFields(token: string) {
  return apiRequest<AccountCustomFieldDefinition[]>('/api/accounts/custom-fields', { token })
}

export async function importAccountsCsv(
  token: string,
  payload: { duplicateMode: 'skip' | 'overwrite' | 'create'; sourceFileName?: string; rows: AccountCsvImportRow[] },
) {
  const response = await apiRequest<ApiAccountCsvImportResponse>('/api/accounts/import-csv', {
    method: 'POST',
    token,
    body: JSON.stringify({
      duplicate_mode: payload.duplicateMode,
      source_file_name: payload.sourceFileName,
      rows: payload.rows,
    }),
  })
  return {
    created: response.created,
    updated: response.updated,
    skipped: response.skipped,
    failed: response.failed,
    totalRows: response.total_rows,
    results: response.results.map(result => ({
      rowNumber: result.row_number,
      status: result.status,
      accountName: result.account_name,
      message: result.message,
      accountId: result.account_id,
      draftId: result.draft_id,
      errors: result.errors,
      account: result.account ? mapApiAccount(result.account) : null,
    })),
  } satisfies AccountCsvImportResponse
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

export async function listEngagements(token: string, accountId: string, params: URLSearchParams | EngagementListParams = new URLSearchParams()) {
  const query = queryString(params)
  const page = await apiRequest<Page<ApiEngagement>>(`/api/accounts/${accountId}/engagements${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(item => mapEngagement(item, '')) }
}

export async function getEngagement(token: string, engagementId: string) {
  return mapEngagement(await apiRequest<ApiEngagement>(`/api/engagements/${engagementId}`, { token }), '')
}

export async function createEngagement(token: string, accountId: string, payload: EngagementCreatePayload) {
  return mapEngagement(
    await apiRequest<ApiEngagement>(`/api/accounts/${accountId}/engagements`, {
      method: 'POST',
      token,
      body: JSON.stringify(buildEngagementPayload(payload)),
    }),
    '',
  )
}

export async function updateEngagement(token: string, engagementId: string, payload: EngagementUpdatePayload) {
  return mapEngagement(
    await apiRequest<ApiEngagement>(`/api/engagements/${engagementId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(buildEngagementPayload(payload)),
    }),
    '',
  )
}

export async function archiveEngagement(token: string, engagementId: string) {
  return apiRequest<{ message: string }>(`/api/engagements/${engagementId}`, {
    method: 'DELETE',
    token,
  })
}

export async function getEngagementTimeline(token: string, engagementId: string, params: URLSearchParams | EngagementTimelineParams = new URLSearchParams()) {
  const query = queryString(params)
  const page = await apiRequest<Page<ApiTimelineEvent>>(`/api/engagements/${engagementId}/timeline${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapTimelineEvent) }
}

function buildDraftPayload(payload: CreateDraftPayload) {
  const sourceNames = payload.fileNames.length ? payload.fileNames : [`${payload.accountName} Project Charter.pdf`]
  const primarySource = sourceNames[0]
  const engagementName = payload.projectName || `${payload.accountName} Engagement`
  const engagementCitation = `${primarySource}: engagement context provided during intake.`
  return {
    account_name: payload.accountName,
    project_name: payload.projectName,
    company_url: normalizeUrl(payload.companyUrl),
    lifecycle_status: 'Draft',
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
        name: engagementName,
        owner_name: payload.managerName,
        service_lines: ['Account onboarding'],
        value: 0,
        currency: 'USD',
        delivery_status: 'active',
        start_date: new Date().toISOString(),
        commercial_context: engagementCitation,
        risks: ['KYC has not been completed yet'],
        source_citation: engagementCitation,
        confidence: 82,
      },
    ],
  }
}

function buildEngagementPayload(payload: EngagementCreatePayload | EngagementUpdatePayload) {
  const body: Record<string, unknown> = {}
  const resourceDependency = payload.resourceDependencyNotes !== undefined ? payload.resourceDependencyNotes : payload.resourceDependency
  setIfDefined(body, 'name', payload.name)
  setIfDefined(body, 'description', payload.description)
  setIfDefined(body, 'status', 'status' in payload ? payload.status : undefined)
  setIfDefined(body, 'owner_id', payload.ownerId)
  setIfDefined(body, 'ops_lead_id', payload.opsLeadId)
  setIfDefined(body, 'service_lines', payload.serviceLines)
  setIfDefined(body, 'source_links', payload.sourceLinks)
  setIfDefined(body, 'value', payload.contractValue ?? payload.value)
  setIfDefined(body, 'currency', payload.currency)
  setIfDefined(body, 'delivery_status', payload.deliveryStatus)
  setIfDefined(body, 'commercial_status', payload.commercialStatus)
  setIfDefined(body, 'delivery_health', payload.healthScore ?? payload.deliveryHealth)
  setIfDefined(body, 'health_status', payload.healthStatus)
  setIfDefined(body, 'renewal_risk', payload.renewalRisk)
  setIfDefined(body, 'start_date', payload.startDate)
  setIfDefined(body, 'end_date', payload.endDate)
  setIfDefined(body, 'renewal_date', payload.renewalDate)
  setIfDefined(body, 'notice_period_days', payload.noticePeriodDays)
  setIfDefined(body, 'auto_renewal', payload.autoRenewal)
  setIfDefined(body, 'commercial_context', payload.commercialContext)
  setIfDefined(body, 'resource_dependency', resourceDependency)
  setIfDefined(body, 'risks', payload.risks)
  setIfDefined(body, 'source_citation', payload.sourceCitation)
  return body
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value
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

function mapAccountOwner(owner: ApiAccountOwner): AccountOwnerView {
  return {
    id: owner.id,
    userId: owner.user_id,
    name: owner.user_name,
    email: owner.user_email,
    ownershipRole: owner.ownership_role,
    isPrimary: Boolean(owner.is_primary),
    isActive: owner.is_active ?? true,
  }
}

function mapDraftEngagement(engagement: ApiDraftEngagement, draft: ApiOnboardingDraft): EngagementRecord {
  const startDate = engagement.start_date ?? draft.created_at
  const rawEndDate = engagement.end_date ?? null
  const rawRenewalDate = engagement.renewal_date ?? null
  const rawNoticeDeadline = engagement.notice_deadline ?? null
  const endDate = rawEndDate ?? rawRenewalDate ?? startDate
  const renewalDate = rawRenewalDate ?? endDate
  const noticeDeadline = rawNoticeDeadline ?? renewalDate
  const daysToExpiry = rawEndDate ? daysUntil(rawEndDate) : Number.NaN
  const renewalStatus = computeRenewalStatus(rawEndDate, rawRenewalDate, rawNoticeDeadline)
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
      noticeDeadline,
      noticePeriodDays: engagement.notice_period_days ?? 0,
      autoRenewal: engagement.auto_renewal,
      commercialExposure: Number(engagement.value ?? 0),
      daysToExpiry,
      renewalStatus,
      riskStatus: engagement.confidence < 60 ? 'critical' : engagement.confidence < 75 ? 'warning' : 'healthy',
      confidence: engagement.confidence,
      sourceDocumentId: draft.source_documents[0]?.id ?? '',
      sourceCitation: engagement.source_citation ?? draft.source_citation ?? 'No source citation recorded.',
    },
  }
}

function mapEngagement(engagement: ApiEngagement, accountName: string): EngagementRecord {
  const rawEndDate = engagement.end_date ?? null
  const rawRenewalDate = engagement.renewal_date ?? null
  const rawNoticeDeadline = engagement.notice_deadline ?? null
  const sourceDocuments = engagement.source_documents ?? []
  const contractValue = Number(engagement.contract_value ?? engagement.value ?? 0)
  const healthScore = Number(engagement.health_score ?? engagement.delivery_health ?? 0)
  const resourceDependency = engagement.resource_dependency_notes ?? engagement.resource_dependency ?? 'No resource dependency recorded.'
  const daysToExpiry = engagement.days_to_expiry === undefined ? (rawEndDate ? daysUntil(rawEndDate) : Number.NaN) : engagement.days_to_expiry ?? Number.NaN
  const renewalStatus = engagement.renewal_status ?? computeRenewalStatus(rawEndDate, rawRenewalDate, rawNoticeDeadline)
  return {
    id: engagement.id,
    accountId: engagement.account_id,
    accountName,
    name: engagement.name,
    description: engagement.description ?? null,
    status: engagement.status,
    ownerId: engagement.owner_id ?? '',
    ownerName: engagement.owner_name,
    opsLeadId: engagement.ops_lead_id ?? '',
    opsLeadName: engagement.ops_lead_name ?? 'Unassigned',
    serviceLines: engagement.service_lines,
    value: contractValue,
    contractValue,
    currency: engagement.currency,
    deliveryStatus: engagement.delivery_status,
    commercialStatus: engagement.commercial_status,
    deliveryHealth: healthScore,
    healthScore,
    healthStatus: engagement.health_status,
    renewalRisk: engagement.renewal_risk,
    renewalStatus,
    resourceDependency,
    resourceDependencyNotes: engagement.resource_dependency_notes ?? engagement.resource_dependency ?? null,
    commercialContext: engagement.commercial_context ?? 'No commercial context recorded yet.',
    risks: engagement.risks,
    sourceDocumentIds: engagement.source_document_ids ?? sourceDocuments.map(document => document.id),
    sourceLinks: engagement.source_links ?? [],
    sourceCitation: engagement.source_citation ?? null,
    createdById: engagement.created_by_id ?? null,
    updatedById: engagement.updated_by_id ?? null,
    createdBy: engagement.created_by ?? null,
    updatedBy: engagement.updated_by ?? null,
    createdAt: engagement.created_at,
    updatedAt: engagement.updated_at,
    renewalTerms: {
      startDate: engagement.start_date,
      endDate: rawEndDate ?? '',
      renewalDate: rawRenewalDate ?? '',
      noticeDeadline: rawNoticeDeadline ?? '',
      noticePeriodDays: engagement.notice_period_days ?? 0,
      autoRenewal: engagement.auto_renewal,
      commercialExposure: contractValue,
      daysToExpiry,
      renewalStatus,
      riskStatus: healthScore < 60 ? 'critical' : healthScore < 75 ? 'warning' : 'healthy',
      confidence: healthScore,
      sourceDocumentId: sourceDocuments[0]?.id ?? engagement.source_document_ids?.[0] ?? '',
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

function mapTimelineEvent(event: ApiTimelineEvent): TimelineEntry {
  return {
    id: event.id,
    accountId: event.account_id,
    eventType: toTimelineEventType(event.event_type),
    module: toTimelineModule(event.source_module),
    title: event.title,
    description: event.description,
    performedBy: event.actor_id,
    performedByName: event.actor_name,
    timestamp: event.created_at,
    sourceRecordId: event.source_record_id ?? event.engagement_id ?? undefined,
    sourceRecordType: event.source_record_type ?? (event.engagement_id ? 'engagement' : undefined),
    sourceRecordRoute: event.source_record_route ?? undefined,
    beforeValue: event.previous_value ?? undefined,
    afterValue: event.new_value ?? undefined,
    metadata: {
      ...(event.metadata ?? {}),
      engagementId: event.engagement_id ?? undefined,
    },
    isSensitive: false,
    isSystemGenerated: true,
    isImmutable: true,
  }
}

function toSegment(value: string): Account['segment'] {
  if (value === 'Strategic' || value === 'Enterprise' || value === 'Growth') return value
  return 'Growth'
}

function toStage(value: string): AccountStage {
  const stages: AccountStage[] = ['Draft', 'Onboarding', 'Active', 'Adoption', 'Expansion', 'Expansion Focus', 'Renewal', 'Renewal Focus', 'At Risk', 'Dormant', 'Archived']
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

function queryString(params: URLSearchParams | EngagementListParams | EngagementTimelineParams) {
  if (params instanceof URLSearchParams) return params.toString()
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}

function toTimelineEventType(value: string): TimelineEventType {
  const eventTypes: TimelineEventType[] = [
    'account_setup',
    'kyc_update',
    'score_change',
    'calculator_change',
    'stage_change',
    'opportunity_event',
    'retention_event',
    'client_education',
    'escalation_event',
    'governance_event',
    'approval_event',
    'executive_event',
    'ai_event',
    'manual_note',
    'engagement_created',
    'engagement_updated',
    'sow_terms_updated',
    'renewal_dates_updated',
    'engagement_health_changed',
    'engagement_delivery_status_changed',
    'engagement_archived',
  ]
  return eventTypes.includes(value as TimelineEventType) ? (value as TimelineEventType) : 'manual_note'
}

function toTimelineModule(value: string): TimelineModule {
  const modules: TimelineModule[] = ['kyc', 'scoring', 'stage', 'opportunity', 'activity', 'education', 'escalation', 'governance', 'approval', 'executive', 'ai', 'manual', 'engagements']
  return modules.includes(value as TimelineModule) ? (value as TimelineModule) : 'manual'
}

function daysUntil(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return Number.NaN
  const target = new Date(time)
  const today = new Date()
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((targetDay - todayDay) / (24 * 60 * 60 * 1000))
}

function computeRenewalStatus(endDate?: string | null, renewalDate?: string | null, noticeDeadline?: string | null): EngagementRenewalStatus {
  const daysToExpiry = endDate ? daysUntil(endDate) : Number.NaN
  if (!Number.isFinite(daysToExpiry)) return 'unknown'
  if (daysToExpiry < 0) return 'expired'

  const daysToRenewal = renewalDate ? daysUntil(renewalDate) : Number.NaN
  if (Number.isFinite(daysToRenewal) && daysToRenewal <= 30) return 'renewal_due'

  const daysToNotice = noticeDeadline ? daysUntil(noticeDeadline) : Number.NaN
  if (Number.isFinite(daysToNotice) && daysToNotice <= 30) return 'notice_due'
  if (Number.isFinite(daysToNotice) && daysToNotice <= 90) return 'upcoming_notice_window'

  return 'not_due'
}
