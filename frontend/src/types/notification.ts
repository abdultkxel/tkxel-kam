export type NotificationTrigger =
  | 'timeline_mention'
  | 'timeline_comment'
  | 'escalation_assigned'
  | 'account_stage_changed'
  | 'score_dropped_rag'
  | 'handover_requested'
  | 'sensitive_access_request'
  | 'integration_error'
  | 'retention_job_complete'

export type NotificationPreferenceMode = 'in_app' | 'in_app_email' | 'off'
export type EmailDigestMode = 'immediate' | 'daily' | 'weekly'

export interface NotificationPreference {
  trigger: NotificationTrigger
  mode: NotificationPreferenceMode
}

export interface NotificationRecord {
  id: string
  trigger: NotificationTrigger
  userId: string
  avatarInitials: string
  sentence: string
  accountId?: string
  accountName?: string
  contentPreview: string
  route?: string
  read: boolean
  timestamp: string
  emailQueued: boolean
}
