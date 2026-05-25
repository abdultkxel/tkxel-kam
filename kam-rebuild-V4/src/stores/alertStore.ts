import { create } from 'zustand'
import { differenceInCalendarDays } from 'date-fns'
import { accounts as mockAccounts } from '@/data/mock'
import { Account } from '@/types/account'
import { AlertRule, AlertType, ProactiveAlert } from '@/types/alert'
import { TimelineEntry } from '@/types/timeline'

const defaultRules: AlertRule[] = [
  { id: 'rule-score', type: 'score_drop_threshold', threshold: '< 60 overall', severity: 'critical', notify: 'AM + leadership', active: true, snoozeDays: 7 },
  { id: 'rule-dimension', type: 'dimension_red_flag', threshold: '< 55 dimension', severity: 'warning', notify: 'AM + leadership', active: true, snoozeDays: 7 },
  { id: 'rule-activity', type: 'no_activity_window', threshold: '14 days', severity: 'warning', notify: 'AM', active: true, snoozeDays: 7 },
  { id: 'rule-renewal', type: 'renewal_approaching', threshold: '60 days', severity: 'warning', notify: 'AM + leadership', active: true, snoozeDays: 14 },
  { id: 'rule-escalation-overdue', type: 'escalation_overdue', threshold: '7 days without recovery update', severity: 'critical', notify: 'AM + leadership', active: true, snoozeDays: 7 },
  { id: 'rule-opportunity-stalled', type: 'opportunity_stalled', threshold: '30 days in same stage', severity: 'warning', notify: 'AM', active: true, snoozeDays: 7 },
  { id: 'rule-governance', type: 'governance_overdue', threshold: '7 days overdue', severity: 'warning', notify: 'AM + leadership', active: true, snoozeDays: 7 },
  { id: 'rule-stakeholder-gap', type: 'stakeholder_gap', threshold: 'No executive stakeholder', severity: 'warning', notify: 'AM', active: true, snoozeDays: 14 },
  { id: 'rule-sentiment', type: 'sentiment_decline', threshold: '3 CSAT drops', severity: 'warning', notify: 'AM + leadership', active: false, snoozeDays: 14 },
]

interface AlertStore {
  alerts: ProactiveAlert[]
  rules: AlertRule[]
  dismissAlert: (id: string, by: string) => void
  upsertAlert: (alert: ProactiveAlert) => void
  evaluateAccount: (account: Account, entries: TimelineEntry[]) => void
  updateRule: (id: string, patch: Partial<AlertRule>) => void
}

function latestEntry(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
}

function makeAlert(account: Account, type: AlertType, severity: ProactiveAlert['severity'], headline: string, detail: string, suggestedActions: string[], linkedEntries: string[]): ProactiveAlert {
  return {
    id: `${type}-${account.id}`,
    accountId: account.id,
    type,
    severity,
    headline,
    detail,
    suggestedActions,
    linkedEntries,
    createdAt: new Date().toISOString(),
  }
}

function initialAlerts(): ProactiveAlert[] {
  return mockAccounts.flatMap(account => {
    if (account.riskStatus === 'critical') {
      return [makeAlert(account, 'score_drop_threshold', 'critical', `${account.name} is below the health floor`, `Overall health is ${account.health.overall}/100 and the account is marked critical.`, ['Start retention plan', 'Log a check-in call', 'Schedule QBR'], [])]
    }
    if (account.riskStatus === 'warning') {
      return [makeAlert(account, 'renewal_approaching', 'warning', `${account.name} needs renewal attention`, 'Renewal stage account has warning risk and should have a retention plan confirmed.', ['Start retention plan', 'Schedule QBR'], [])]
    }
    return []
  })
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: initialAlerts(),
  rules: defaultRules,
  dismissAlert: (id, by) =>
    set(state => ({
      alerts: state.alerts.map(alert => (alert.id === id ? { ...alert, dismissedAt: new Date().toISOString(), dismissedBy: by } : alert)),
    })),
  upsertAlert: alert =>
    set(state => ({
      alerts: [alert, ...state.alerts.filter(item => item.id !== alert.id)],
    })),
  evaluateAccount: (account, entries) => {
    const accountEntries = entries.filter(entry => entry.accountId === account.id)
    const latest = latestEntry(accountEntries)
    const activeRules = get().rules.filter(rule => rule.active)
    const nextAlerts: ProactiveAlert[] = []

    const scoreRule = activeRules.find(rule => rule.type === 'score_drop_threshold')
    if (scoreRule && account.health.overall < 60) {
      nextAlerts.push(makeAlert(account, 'score_drop_threshold', scoreRule.severity, `${account.name} is below the health floor`, `Overall health is ${account.health.overall}/100 after the latest score check.`, ['Start retention plan', 'Log a check-in call', 'Schedule QBR'], latest ? [latest.id] : []))
    }
    const dimensionRule = activeRules.find(rule => rule.type === 'dimension_red_flag')
    if (dimensionRule) {
      const redDimensions = Object.entries(account.health).filter(([, value]) => value < 55).map(([key]) => key)
      if (redDimensions.length) {
        nextAlerts.push(makeAlert(account, 'dimension_red_flag', dimensionRule.severity, `${account.name} has a red health dimension`, `${redDimensions.join(', ')} dropped into the critical band.`, ['Log a check-in call', 'Review health score'], latest ? [latest.id] : []))
      }
    }
    const activityRule = activeRules.find(rule => rule.type === 'no_activity_window')
    if (activityRule && latest && differenceInCalendarDays(new Date(), new Date(latest.timestamp)) > 14) {
      nextAlerts.push(makeAlert(account, 'no_activity_window', activityRule.severity, `${account.name} has no recent activity`, `No timeline activity has been recorded in ${differenceInCalendarDays(new Date(), new Date(latest.timestamp))} days.`, ['Log a check-in call', 'Add timeline note'], [latest.id]))
    }
    const renewalRule = activeRules.find(rule => rule.type === 'renewal_approaching')
    if (renewalRule && account.stage === 'Renewal') {
      nextAlerts.push(makeAlert(account, 'renewal_approaching', renewalRule.severity, `${account.name} renewal is approaching`, 'Renewal-stage account needs a visible retention plan.', ['Start retention plan', 'Schedule QBR'], latest ? [latest.id] : []))
    }
    const stakeholderRule = activeRules.find(rule => rule.type === 'stakeholder_gap')
    if (stakeholderRule && !account.stakeholders.some(stakeholder => stakeholder.toLowerCase().includes('cio') || stakeholder.toLowerCase().includes('cto') || stakeholder.toLowerCase().includes('vp'))) {
      nextAlerts.push(makeAlert(account, 'stakeholder_gap', stakeholderRule.severity, `${account.name} has an executive stakeholder gap`, 'No CIO, CTO, or VP stakeholder is visible in KYC stakeholder data.', ['Update KYC stakeholders', 'Schedule executive intro'], latest ? [latest.id] : []))
    }

    set(state => ({
      alerts: [
        ...nextAlerts,
        ...state.alerts.filter(alert => alert.accountId !== account.id || !nextAlerts.some(next => next.type === alert.type)),
      ],
    }))
  },
  updateRule: (id, patch) =>
    set(state => ({
      rules: state.rules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)),
    })),
}))
