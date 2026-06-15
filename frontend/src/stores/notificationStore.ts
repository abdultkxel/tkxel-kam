import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { NotificationPreference, NotificationPreferenceMode, NotificationRecord, NotificationTrigger, EmailDigestMode } from '@/types/notification'

const triggers: NotificationTrigger[] = [
  'timeline_mention',
  'timeline_comment',
  'escalation_assigned',
  'account_stage_changed',
  'account_stage_recommendation_reviewed',
  'score_dropped_rag',
  'handover_requested',
  'sensitive_access_request',
  'integration_error',
  'retention_job_complete',
  'governance_overdue',
]

interface NotificationStore {
  notifications: NotificationRecord[]
  preferences: NotificationPreference[]
  digest: EmailDigestMode
  addNotification: (notification: Omit<NotificationRecord, 'id' | 'timestamp' | 'read' | 'emailQueued' | 'avatarInitials'>) => void
  markRead: (id: string) => void
  updatePreference: (trigger: NotificationTrigger, mode: NotificationPreferenceMode) => void
  setDigest: (digest: EmailDigestMode) => void
}

const defaultPreferences: NotificationPreference[] = triggers.map(trigger => ({
  trigger,
  mode: trigger === 'integration_error' || trigger === 'retention_job_complete' ? 'in_app_email' : 'in_app',
}))

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  preferences: defaultPreferences,
  digest: 'immediate',
  addNotification: notification => {
    const preference = get().preferences.find(item => item.trigger === notification.trigger)
    if (preference?.mode === 'off') return
    if (notification.sourceKey && get().notifications.some(item => item.trigger === notification.trigger && item.userId === notification.userId && item.sourceKey === notification.sourceKey)) return
    set(state => ({
      notifications: [
        {
          ...notification,
          id: nanoid(),
          avatarInitials: '@',
          timestamp: new Date().toISOString(),
          read: false,
          emailQueued: preference?.mode === 'in_app_email',
        },
        ...state.notifications,
      ],
    }))
  },
  markRead: id =>
    set(state => ({
      notifications: state.notifications.map(item => (item.id === id ? { ...item, read: true } : item)),
    })),
  updatePreference: (trigger, mode) =>
    set(state => ({
      preferences: state.preferences.map(item => (item.trigger === trigger ? { ...item, mode } : item)),
    })),
  setDigest: digest => set({ digest }),
}))
