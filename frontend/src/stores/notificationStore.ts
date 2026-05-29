import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { currentUser, users } from '@/data/mock'
import { NotificationPreference, NotificationPreferenceMode, NotificationRecord, NotificationTrigger, EmailDigestMode } from '@/types/notification'

const triggers: NotificationTrigger[] = [
  'timeline_mention',
  'timeline_comment',
  'escalation_assigned',
  'account_stage_changed',
  'score_dropped_rag',
  'handover_requested',
  'sensitive_access_request',
  'integration_error',
  'retention_job_complete',
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
  notifications: [
    {
      id: 'notif-001',
      trigger: 'handover_requested',
      userId: currentUser.id,
      avatarInitials: currentUser.avatarInitials,
      sentence: 'Ali Khan requested a handover summary review',
      accountId: 'amd-001',
      accountName: 'Signal',
      contentPreview: 'Expansion handover is ready for leadership review.',
      route: '/accounts/amd-001',
      read: false,
      timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      emailQueued: false,
    },
  ],
  preferences: defaultPreferences,
  digest: 'immediate',
  addNotification: notification => {
    const preference = get().preferences.find(item => item.trigger === notification.trigger)
    if (preference?.mode === 'off') return
    const target = users.find(user => user.id === notification.userId)
    set(state => ({
      notifications: [
        {
          ...notification,
          id: nanoid(),
          avatarInitials: target?.avatarInitials ?? currentUser.avatarInitials,
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
