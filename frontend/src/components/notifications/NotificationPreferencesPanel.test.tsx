import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationPreferencesPanel } from '@/components/notifications/NotificationPreferencesPanel'

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

describe('NotificationPreferencesPanel', () => {
  it('loads preferences and saves changes through the API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/users/me/notification-preferences') && init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({
          items: [
            { trigger: 'new_signal', mode: 'in_app_email', digest_cadence: 'daily' },
            { trigger: 'sla_escalation', mode: 'in_app_email', digest_cadence: 'daily' },
          ],
        })
      }
      return jsonResponse([
        { trigger: 'new_signal', label: 'New signal', mode: 'in_app', digest_cadence: 'daily', mandatory: false, supported_channels: ['in_app', 'email'], policy_override: false },
        { trigger: 'sla_escalation', label: 'SLA escalation', mode: 'in_app_email', digest_cadence: 'daily', mandatory: true, supported_channels: ['in_app', 'email'], policy_override: false },
      ])
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NotificationPreferencesPanel />)

    expect(await screen.findByText('New signal')).toBeInTheDocument()
    const selects = screen.getAllByDisplayValue('In-app')
    await userEvent.selectOptions(selects[0], 'in_app_email')
    await userEvent.click(screen.getByRole('button', { name: /save preferences/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/users/me/notification-preferences') && call[1]?.method === 'PUT')).toBe(true))
  })

  it('shows loading and error states', async () => {
    let resolveRequest: (response: Response) => void = () => undefined
    const pendingRequest = new Promise<Response>(resolve => {
      resolveRequest = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pendingRequest),
    )

    render(<NotificationPreferencesPanel />)

    expect(await screen.findByText(/loading preferences/i)).toBeInTheDocument()
    resolveRequest(jsonResponse({ detail: 'Forbidden' }, 403))
    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
  })
})
