export type GovernanceEventType = 'QBR' | 'SteerCo' | 'Monthly Review' | 'Executive Review'

export interface GovernanceEventRecord {
  id: string
  accountId: string
  accountName: string
  ownerId: string
  type: GovernanceEventType
  date: string
  agenda: string
  attendees: string[]
  actionItems: string[]
  status: 'upcoming' | 'completed' | 'overdue'
}
