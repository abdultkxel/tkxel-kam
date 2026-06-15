import { getRetentionPolicies, runRetentionPolicy } from '@/services/timeline'

export interface RetentionJobReport {
  id: string
  timestamp: string
  status: 'success' | 'error'
  archived: number
  deleted: number
  message: string
}

export async function runRetentionJob(token: string): Promise<RetentionJobReport> {
  let archived = 0
  let deleted = 0

  try {
    const policies = await getRetentionPolicies(token)
    const results = await Promise.all(policies.items.filter(policy => policy.is_active).map(policy => runRetentionPolicy(token, policy.id)))
    archived = results.filter(result => result.action === 'archive').reduce((sum, result) => sum + result.affected_count, 0)
    deleted = results.filter(result => result.action === 'delete').reduce((sum, result) => sum + result.affected_count, 0)

    const report = {
      id: `retention-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      archived,
      deleted,
      message: 'Retention policies were executed through backend APIs.',
    }
    return report
  } catch (error) {
    const report = {
      id: `retention-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'error' as const,
      archived,
      deleted,
      message: error instanceof Error ? error.message : 'Retention job failed',
    }
    return report
  }
}
