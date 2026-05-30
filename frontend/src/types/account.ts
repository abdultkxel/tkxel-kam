export type AccountStage =
  | 'Onboarding'
  | 'Active'
  | 'Adoption'
  | 'Expansion'
  | 'Expansion Focus'
  | 'Renewal'
  | 'Renewal Focus'
  | 'At Risk'
  | 'Dormant'
  | 'Archived'
export type RiskStatus = 'healthy' | 'warning' | 'critical'

export interface HealthScore {
  overall: number
  relationship: number
  usage: number
  delivery: number
  commercial: number
}

export interface ScoreSnapshot {
  id: string
  accountId: string
  timestamp: string
  overall: number
  dimensions: Record<string, number>
  calculatorVersion: string
  changedBy: string
  changedByName: string
  triggerEntryId: string
}

export interface SavedAccountFilter {
  id: string
  name: string
  query: string
  stage: string
  risk: string
  segments: string[]
  creatorId: string
  shared: boolean
}

export interface Account {
  id: string
  name: string
  projectName?: string
  companyUrl?: string
  segment: 'Strategic' | 'Enterprise' | 'Growth'
  tags: string[]
  ownerId: string
  ownerName: string
  ownerEmail?: string
  stage: AccountStage
  riskStatus: RiskStatus
  arr: number
  nextQbr: string
  health: HealthScore
  stakeholders: string[]
  risks: string[]
}
