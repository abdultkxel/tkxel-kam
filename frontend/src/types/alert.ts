export type AlertType =
  | 'score_drop_threshold'
  | 'dimension_red_flag'
  | 'no_activity_window'
  | 'renewal_approaching'
  | 'escalation_overdue'
  | 'opportunity_stalled'
  | 'governance_overdue'
  | 'stakeholder_gap'
  | 'sentiment_decline'

export interface ProactiveAlert {
  id: string
  accountId: string
  type: AlertType
  severity: 'info' | 'warning' | 'critical'
  headline: string
  detail: string
  suggestedActions: string[]
  createdAt: string
  linkedEntries: string[]
  dismissedAt?: string
  dismissedBy?: string
}

export interface AlertRule {
  id: string
  type: AlertType
  threshold: string
  severity: 'info' | 'warning' | 'critical'
  notify: string
  active: boolean
  snoozeDays: number
}
