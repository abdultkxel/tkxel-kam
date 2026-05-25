import { TimelineEntry } from '@/types/timeline'

export type IntegrationSource = 'jira' | 'salesforce' | 'hubspot' | 'google_calendar' | 'ms_teams'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

export interface ExternalEvent {
  externalId: string
  source: IntegrationSource
  type: string
  title: string
  description: string
  occurredAt: string
  metadata: Record<string, unknown>
}

export interface IntegrationAdapter {
  name: string
  authenticate: () => Promise<boolean>
  testConnection: () => Promise<boolean>
  syncEvents: (accountId: string) => Promise<ExternalEvent[]>
  mapToTimeline: (event: ExternalEvent) => Omit<TimelineEntry, 'id' | 'timestamp'>
}

export interface IntegrationConfig {
  source: IntegrationSource
  name: string
  status: IntegrationStatus
  tokenStatus: 'valid' | 'expired' | 'missing'
  lastSynced?: string
  autoCreate: boolean
  deduplicationWindowMinutes: number
  accountMappingRules: string[]
  eventTypeFilters: string[]
  syncDirections: Record<string, 'inbound' | 'outbound' | 'bidirectional'>
}

export interface IntegrationError {
  id: string
  source: IntegrationSource
  timestamp: string
  message: string
  payload: Record<string, unknown>
  critical: boolean
}
