import { nanoid } from 'nanoid'
import { subMonths } from 'date-fns'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTimelineStore } from '@/stores/timelineStore'

export interface RetentionJobReport {
  id: string
  timestamp: string
  status: 'success' | 'error'
  archived: number
  deleted: number
  message: string
}

export async function runRetentionJob(): Promise<RetentionJobReport> {
  const timelineStore = useTimelineStore.getState()
  let archived = 0
  let deleted = 0

  try {
    timelineStore.eventTypes.forEach(policy => {
      if (policy.retentionPolicy === 'keep' || !policy.retentionMonths) return
      const cutoff = subMonths(new Date(), policy.retentionMonths)
      const eligible = useTimelineStore
        .getState()
        .entries.filter(entry => entry.eventType === policy.eventType && !entry.isImmutable && new Date(entry.timestamp) <= cutoff)

      if (policy.retentionPolicy === 'archive') {
        useTimelineStore.getState().archiveEntries(eligible.map(entry => entry.id))
        archived += eligible.length
      }

      if (policy.retentionPolicy === 'delete') {
        useTimelineStore.getState().deleteEntriesWithTombstone(eligible.map(entry => entry.id), policy.id)
        deleted += eligible.length
      }
    })

    const report = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      archived,
      deleted,
      message: 'Nightly 02:00 UTC retention policy check completed.',
    }
    useIntegrationStore.getState().addRetentionRun(report)
    useNotificationStore.getState().addNotification({
      userId: 'usr-003',
      trigger: 'retention_job_complete',
      sentence: 'Retention job completed',
      contentPreview: `Archived ${archived}; deleted ${deleted}.`,
      route: '/admin',
    })
    return report
  } catch (error) {
    const report = {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      status: 'error' as const,
      archived,
      deleted,
      message: error instanceof Error ? error.message : 'Retention job failed',
    }
    useIntegrationStore.getState().addRetentionRun(report)
    useIntegrationStore.getState().addError({
      id: nanoid(),
      source: 'jira',
      timestamp: new Date().toISOString(),
      message: report.message,
      payload: { job: 'retention' },
      critical: true,
    })
    useNotificationStore.getState().addNotification({
      userId: 'usr-003',
      trigger: 'integration_error',
      sentence: 'Retention job failed',
      contentPreview: report.message,
      route: '/admin',
    })
    return report
  }
}
