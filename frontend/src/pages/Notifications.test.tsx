import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Notifications } from '@/pages/Notifications'

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

describe('Notifications page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads trigger metadata and sends expanded filters to the API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/notifications/triggers')) {
        return jsonResponse({
          items: [
            { id: 'cfg-1', trigger: 'task_created', label: 'Task assigned', workflow: 'tasks', priority: 'medium', recipient_policy: 'task_assignee', default_mode: 'in_app', default_digest_cadence: 'daily', supported_channels: ['in_app', 'email'], mandatory: false, timing_mode: 'immediate', timing_unit: 'business_days', repeat_enabled: false, escalation_enabled: false, is_active: true },
            { id: 'cfg-2', trigger: 'sla_escalation', label: 'SLA escalation', workflow: 'escalations', priority: 'critical', recipient_policy: 'kam_head_admin', default_mode: 'in_app_email', default_digest_cadence: 'daily', supported_channels: ['in_app', 'email'], mandatory: true, timing_mode: 'after_pending', timing_unit: 'business_days', repeat_enabled: false, escalation_enabled: true, is_active: true },
          ],
        })
      }
      if (url.includes('/api/notifications')) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 12, pages: 0, unread_count: 0 })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Inbox')).toBeInTheDocument()
    await screen.findByText('Task assigned')

    await userEvent.selectOptions(screen.getByDisplayValue('All triggers'), 'task_created')
    await userEvent.selectOptions(screen.getByDisplayValue('All channels'), 'in_app')
    await userEvent.type(screen.getByPlaceholderText('Account ID'), 'acct-1')
    await userEvent.type(screen.getByPlaceholderText(/search title/i), 'renewal')
    await userEvent.click(screen.getByRole('button', { name: /search/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => {
        const url = String(call[0])
        return url.includes('/api/notifications')
          && url.includes('trigger=task_created')
          && url.includes('channel=in_app')
          && url.includes('account_id=acct-1')
          && url.includes('search=renewal')
      })).toBe(true)
    })
  })
})
