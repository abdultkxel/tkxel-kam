export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface AccountPlanAction {
  id: string
  title: string
  ownerId?: string | null
  ownerName: string
  ownerEmail?: string | null
  dueAt: string
  status: string
  priority: string
  successCriteria: string[]
}

export interface AccountPlan {
  id: string
  accountId: string
  retentionFocus?: string | null
  growthFocus?: string | null
  risks: string[]
  opportunities?: string | null
  commitments: string[]
  serviceGaps: string[]
  reviewCadence?: string | null
  nextReviewAt?: string | null
  status: string
  actions: AccountPlanAction[]
  updatedAt: string
}

export interface AccountPlanInput {
  retentionFocus?: string | null
  growthFocus?: string | null
  risks?: string[]
  opportunities?: string | null
  commitments?: string[]
  serviceGaps?: string[]
  reviewCadence?: string | null
  nextReviewAt?: string | null
  status?: string
  actions?: { title: string; ownerId: string; dueAt: string; status?: string; priority?: string; successCriteria?: string[] }[]
  changeSummary?: string | null
}

export interface ServiceCatalogItem {
  id: string
  slug: string
  name: string
  category?: string | null
  description?: string | null
  tags: string[]
  isActive: boolean
  displayOrder: number
  inUseCount: number
}

export interface StakeholderRoleConfig {
  id: string
  slug: string
  name: string
  description?: string | null
  isActive: boolean
  displayOrder: number
  inUseCount: number
}

export interface StakeholderGapRule {
  id: string
  ruleKey: string
  title: string
  description: string
  severity: string
  conditionJson: Record<string, unknown>
  isActive: boolean
  displayOrder: number
}

export interface OpportunityStageConfig {
  id: string
  slug: string
  name: string
  isTerminal: boolean
  requiresOutcomeReason: boolean
  isActive: boolean
  displayOrder: number
}

export interface OpportunityStageTransitionConfig {
  id: string
  fromStage: string
  toStage: string
  isActive: boolean
  requiresReason: boolean
}

export interface ServiceAdjacencyRule {
  id: string
  sourceServiceId: string
  sourceServiceName: string
  targetServiceId: string
  targetServiceName: string
  relevanceScore: number
  rationale: string
  isActive: boolean
}

export interface WhitespaceItem {
  id: string
  accountId: string
  engagementId?: string | null
  serviceId: string
  serviceName: string
  coverageStatus: string
  notes?: string | null
  source: string
}

export interface ServiceRecommendation {
  id: string
  accountId: string
  sourceServiceId?: string | null
  sourceServiceName?: string | null
  targetServiceId: string
  targetServiceName: string
  relevanceScore: number
  rationale: string
  status: string
  sourceContext: string
  createdOpportunityId?: string | null
}

export interface RenewalProfile {
  id: string
  accountId: string
  engagementId: string
  renewalReadiness: string
  renewalRisk: string
  confidence: number
  commercialExposure: number
  commercialExposureCurrency: string
  ownerId?: string | null
  ownerName?: string | null
  sourceType: string
  sourceCitation?: string | null
  manualOverrideReason?: string | null
  sowStartDate?: string | null
  sowEndDate?: string | null
  renewalDate?: string | null
  noticeDeadline?: string | null
  noticePeriodDays?: number | null
  autoRenewal: boolean
  daysToExpiry?: number | null
  renewalStatus: string
}

export interface RetentionPlan {
  id: string
  accountId: string
  engagementId?: string | null
  planType: string
  status: string
  title: string
  summary?: string | null
  ownerId?: string | null
  ownerName: string
  ownerEmail?: string | null
  renewalMilestoneAt?: string | null
  successCriteria: string[]
  sourceContext?: string | null
  actions: AccountPlanAction[]
}

export interface RetentionRecommendation {
  id: string
  accountId: string
  engagementId?: string | null
  title: string
  rationale: string
  severity: string
  recommendedAction: string
  sourceContext: string
  status: string
  createdTaskId?: string | null
}
