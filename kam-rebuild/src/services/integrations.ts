import { nanoid } from 'nanoid'
import { isAfter, parseISO, subMinutes } from 'date-fns'
import { currentUser } from '@/data/mock'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { ExternalEvent, IntegrationAdapter, IntegrationSource } from '@/types/integration'
import { TimelineEntry } from '@/types/timeline'

export function shouldCreateEntry(event: ExternalEvent, existing: TimelineEntry[], windowMinutes = 30): boolean {
  const windowStart = subMinutes(new Date(), windowMinutes)
  return !existing.some(entry => {
    const metadata = entry.metadata ?? {}
    return metadata.externalId === event.externalId && metadata.source === event.source && isAfter(parseISO(entry.timestamp), windowStart)
  })
}

function governanceTypeFromTitle(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('qbr')) return 'QBR held'
  if (lower.includes('steerco')) return 'SteerCo held'
  if (lower.includes('executive')) return 'Executive review completed'
  return 'Client call logged'
}

const googleCalendarAdapter: IntegrationAdapter = {
  name: 'Google Calendar',
  authenticate: async () => true,
  testConnection: async () => true,
  syncEvents: async accountId => [
    {
      externalId: `gcal-${accountId}-qbr-001`,
      source: 'google_calendar',
      type: 'QBR',
      title: '[AMD Global Services] QBR held',
      description: 'Quarterly business review completed with roadmap and expansion discussion.',
      occurredAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      metadata: { attendees: ['Ali Khan', 'Sarah Mitchell'], accountTag: 'AMD Global Services' },
    },
    {
      externalId: `gcal-${accountId}-call-002`,
      source: 'google_calendar',
      type: 'Client Call',
      title: '[AMD Global Services] Client call',
      description: 'Client call covering adoption blockers and next governance actions.',
      occurredAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      metadata: { accountTag: 'AMD Global Services' },
    },
  ],
  mapToTimeline: event => ({
    accountId: '',
    eventType: event.type.toLowerCase().includes('standup') ? 'manual_note' : 'governance_event',
    module: event.type.toLowerCase().includes('standup') ? 'activity' : 'governance',
    title: governanceTypeFromTitle(event.title),
    description: event.description,
    performedBy: currentUser.id,
    performedByName: currentUser.name,
    sourceRecordId: event.externalId,
    sourceRecordType: event.source,
    sourceRecordRoute: '/governance',
    metadata: { ...event.metadata, externalId: event.externalId, source: event.source },
    isSensitive: false,
    isSystemGenerated: true,
    isImmutable: false,
  }),
}

function genericAdapter(source: IntegrationSource, name: string): IntegrationAdapter {
  return {
    name,
    authenticate: async () => true,
    testConnection: async () => source !== 'salesforce',
    syncEvents: async accountId => [
      {
        externalId: `${source}-${accountId}-activity-001`,
        source,
        type: 'Activity',
        title: `${name} activity synced`,
        description: `Latest ${name} activity mapped to the account timeline.`,
        occurredAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        metadata: { source },
      },
    ],
    mapToTimeline: event => ({
      accountId: '',
      eventType: source === 'jira' ? 'escalation_event' : 'manual_note',
      module: source === 'jira' ? 'escalation' : 'activity',
      title: event.title,
      description: event.description,
      performedBy: currentUser.id,
      performedByName: currentUser.name,
      sourceRecordId: event.externalId,
      sourceRecordType: event.source,
      metadata: { ...event.metadata, externalId: event.externalId, source: event.source },
      isSensitive: source === 'jira',
      sensitivityLevel: source === 'jira' ? 'escalation' : undefined,
      isSystemGenerated: true,
      isImmutable: source === 'jira',
    }),
  }
}

export const adapters: Record<IntegrationSource, IntegrationAdapter> = {
  google_calendar: googleCalendarAdapter,
  jira: genericAdapter('jira', 'Jira'),
  salesforce: genericAdapter('salesforce', 'Salesforce'),
  hubspot: genericAdapter('hubspot', 'HubSpot'),
  ms_teams: genericAdapter('ms_teams', 'MS Teams'),
}

async function retry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      await new Promise(resolve => window.setTimeout(resolve, 150 * 2 ** index))
    }
  }
  throw lastError
}

export async function syncIntegrationNow(source: IntegrationSource, accountId: string) {
  const adapter = adapters[source]
  const config = useIntegrationStore.getState().configs.find(item => item.source === source)
  const existing = useTimelineStore.getState().entries

  try {
    const events = await retry(() => adapter.syncEvents(accountId))
    const created: TimelineEntry[] = []
    events.forEach(event => {
      if (!shouldCreateEntry(event, useTimelineStore.getState().entries, config?.deduplicationWindowMinutes ?? 30)) return
      const payload = adapter.mapToTimeline(event)
      const entry: TimelineEntry = {
        ...payload,
        accountId,
        id: nanoid(),
        timestamp: event.occurredAt,
      }
      useTimelineStore.getState().addEntry(entry)
      created.push(entry)
    })
    useIntegrationStore.getState().updateConfig(source, {
      status: 'connected',
      tokenStatus: 'valid',
      lastSynced: new Date().toISOString(),
    })
    return { created, skipped: events.length - created.length, existingCount: existing.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    useIntegrationStore.getState().addError({
      id: nanoid(),
      source,
      timestamp: new Date().toISOString(),
      message,
      payload: { accountId },
      critical: source === 'jira',
    })
    useNotificationStore.getState().addNotification({
      userId: 'usr-003',
      trigger: 'integration_error',
      sentence: `${adapter.name} sync failed`,
      contentPreview: message,
      route: '/admin',
    })
    useIntegrationStore.getState().updateConfig(source, { status: 'error' })
    return { created: [], skipped: 0, existingCount: existing.length, error: message }
  }
}
