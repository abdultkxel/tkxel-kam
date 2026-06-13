import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminNotificationsReportingPanel } from '@/components/admin/AdminNotificationsReportingPanel'
import type { NotificationTriggerConfig } from '@/services/notificationsReporting'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function trigger(index: number, overrides: Partial<NotificationTriggerConfig> = {}): NotificationTriggerConfig {
  return {
    id: `trigger-${index}`,
    trigger: `trigger_${index}`,
    label: `Trigger ${index}`,
    workflow: index % 2 === 0 ? 'alerts' : 'tasks',
    priority: 'medium',
    recipient_policy: 'account_owner',
    default_mode: 'in_app',
    default_digest_cadence: 'daily',
    supported_channels: ['in_app', 'email'],
    mandatory: false,
    timing_mode: 'immediate',
    timing_unit: 'business_days',
    repeat_enabled: false,
    escalation_enabled: false,
    is_active: true,
    ...overrides,
  }
}

describe('AdminNotificationsReportingPanel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('hides signal, escalation, and SLA settings and paginates trigger defaults', async () => {
    const visibleTriggers = Array.from({ length: 9 }, (_, index) => trigger(index + 1))
    const escalationTrigger = trigger(10, {
      id: 'trigger-escalation',
      trigger: 'escalation_opened',
      label: 'Escalation opened',
      workflow: 'escalations',
      priority: 'high',
      mandatory: true,
    })
    const signalTrigger = trigger(11, {
      id: 'trigger-signal',
      trigger: 'signal_unreviewed',
      label: 'Signal unreviewed',
      workflow: 'signals',
      priority: 'high',
      mandatory: true,
    })
    let savedDefaults: { items: NotificationTriggerConfig[] } | null = null

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/notification-defaults') && init?.method === 'PUT') {
        const payload = JSON.parse(String(init.body)) as { items: NotificationTriggerConfig[] }
        savedDefaults = payload
        return jsonResponse({ items: [...payload.items, signalTrigger, escalationTrigger] })
      }
      if (url.includes('/api/admin/notification-defaults')) {
        return jsonResponse({ items: [...visibleTriggers, signalTrigger, escalationTrigger] })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminNotificationsReportingPanel />)

    expect(await screen.findByText('Trigger 1')).toBeInTheDocument()
    expect(screen.getByText('Delivery defaults')).toBeInTheDocument()
    expect(screen.getByText('Trigger 8')).toBeInTheDocument()
    expect(screen.queryByText('Trigger 9')).not.toBeInTheDocument()
    expect(screen.queryByText('Signal unreviewed')).not.toBeInTheDocument()
    expect(screen.queryByText('Escalation opened')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications and SLA')).not.toBeInTheDocument()
    expect(screen.queryByText('SLA rules')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /run sla/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Critical signal inactivity')).not.toBeInTheDocument()
    expect(screen.queryByText('Formal escalation inactivity')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Signal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Escalation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dry run/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Scheduler run history')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1-8 of 9')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/admin/notification-scheduler'))).toBe(false)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/admin/sla-rules') || String(input).includes('/api/sla/jobs/evaluate'))).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Trigger 9')).toBeInTheDocument()
    expect(screen.queryByText('Trigger 1')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 9-9 of 9')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /save defaults/i }))

    await waitFor(() => expect(savedDefaults).not.toBeNull())
    expect(savedDefaults?.items).toHaveLength(9)
    expect(savedDefaults?.items.some(item => ['signals', 'escalations'].includes(item.workflow) || ['signal_unreviewed', 'escalation_opened'].includes(item.trigger))).toBe(false)
    await waitFor(() => expect(screen.queryByText('Signal unreviewed')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Escalation opened')).not.toBeInTheDocument())
  })
})
