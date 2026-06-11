import { create } from 'zustand'
import { IntegrationConfig, IntegrationError, IntegrationSource } from '@/types/integration'

interface SensitivePolicy {
  level: 'escalation' | 'commercial' | 'executive' | 'legal'
  canCreate: string
  canView: string
}

interface AccessAudit {
  id: string
  user: string
  entryId: string
  timestamp: string
  ip: string
  action: 'viewed' | 'requested' | 'granted'
}

interface RetentionJobRun {
  id: string
  timestamp: string
  status: 'success' | 'error'
  archived: number
  deleted: number
  message: string
}

interface IntegrationStore {
  configs: IntegrationConfig[]
  errors: IntegrationError[]
  sensitivePolicies: SensitivePolicy[]
  accessAudits: AccessAudit[]
  retentionRuns: RetentionJobRun[]
  updateConfig: (source: IntegrationSource, config: Partial<IntegrationConfig>) => void
  addError: (error: IntegrationError) => void
  addAccessAudit: (audit: AccessAudit) => void
  addRetentionRun: (run: RetentionJobRun) => void
}

const baseConfig: IntegrationConfig[] = [
  {
    source: 'google_calendar',
    name: 'Google Calendar',
    status: 'connected',
    tokenStatus: 'valid',
    lastSynced: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    autoCreate: true,
    deduplicationWindowMinutes: 30,
    accountMappingRules: ['Meeting title contains [Account Name]', 'Manual tag in governance panel'],
    eventTypeFilters: ['QBR', 'SteerCo', 'Executive Review', 'Client Call'],
    syncDirections: { title: 'inbound', attendees: 'inbound', notes: 'bidirectional' },
  },
  {
    source: 'fathom',
    name: 'Fathom',
    status: 'disconnected',
    tokenStatus: 'missing',
    autoCreate: false,
    deduplicationWindowMinutes: 30,
    accountMappingRules: ['Meeting title contains [Account Name]', 'Meeting owner manually confirms account'],
    eventTypeFilters: ['Meeting Summary', 'Decision', 'Action Item'],
    syncDirections: { transcript: 'inbound', summary: 'inbound', actionItems: 'bidirectional' },
  },
  {
    source: 'csat',
    name: 'CSAT',
    status: 'connected',
    tokenStatus: 'valid',
    lastSynced: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    autoCreate: true,
    deduplicationWindowMinutes: 60,
    accountMappingRules: ['Account record match', 'Engagement record match', 'Manual review for unmatched survey'],
    eventTypeFilters: ['Score Received', 'Trend Change', 'Critical Comment'],
    syncDirections: { score: 'inbound', comment: 'inbound', trend: 'inbound' },
  },
  {
    source: 'ai_llm_gateway',
    name: 'AI/LLM Gateway',
    status: 'connected',
    tokenStatus: 'valid',
    lastSynced: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    autoCreate: false,
    deduplicationWindowMinutes: 15,
    accountMappingRules: ['RBAC-filtered context', 'Source citation required', 'Human approval before official record'],
    eventTypeFilters: ['Charter/SOW extraction', 'KYC enrichment', 'AI Search', 'Summary', 'Signal explanation'],
    syncDirections: { prompt: 'outbound', response: 'inbound', citations: 'inbound', audit: 'inbound' },
  },
]

export const useIntegrationStore = create<IntegrationStore>(set => ({
  configs: baseConfig,
  errors: [
    {
      id: 'err-001',
      source: 'fathom',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      message: 'OAuth token missing. Re-authenticate before importing meeting summaries.',
      payload: { status: 401 },
      critical: false,
    },
  ],
  sensitivePolicies: [
    { level: 'escalation', canCreate: 'AM+', canView: 'leadership+' },
    { level: 'commercial', canCreate: 'leadership+', canView: 'leadership+' },
    { level: 'executive', canCreate: 'leadership+', canView: 'admin only' },
    { level: 'legal', canCreate: 'admin', canView: 'admin only' },
  ],
  accessAudits: [
    {
      id: 'audit-001',
      user: 'Sarah Mitchell',
      entryId: 'tl-004',
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      ip: '127.0.0.1',
      action: 'viewed',
    },
  ],
  retentionRuns: [],
  updateConfig: (source, config) =>
    set(state => ({
      configs: state.configs.map(item => (item.source === source ? { ...item, ...config } : item)),
    })),
  addError: error => set(state => ({ errors: [error, ...state.errors].slice(0, 30) })),
  addAccessAudit: audit => set(state => ({ accessAudits: [audit, ...state.accessAudits].slice(0, 50) })),
  addRetentionRun: run => set(state => ({ retentionRuns: [run, ...state.retentionRuns].slice(0, 30) })),
}))
