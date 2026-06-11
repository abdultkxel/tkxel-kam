import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationTray } from '@/components/notifications/NotificationTray'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('NotificationTray', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes notifications when the navbar bell is opened', async () => {
    let calls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.includes('/api/notifications')) return jsonResponse({})
      calls += 1
      if (calls === 1) {
        return jsonResponse({ latest: [], total_count: 0, unread_count: 0 })
      }
      return jsonResponse({
        latest: [
          {
            id: 'notification-1',
            recipient_user_id: 'admin-1',
            recipient_name: 'Admin User',
            recipient_email: 'admin@tkxel.com',
            trigger: 'integration_failure',
            title: 'Fathom integration failure',
            body: 'Fathom has failed 3 consecutive time(s).',
            account_id: null,
            account_name_snapshot: null,
            source_record_type: 'integration_connection',
            source_record_id: 'integration-1',
            source_record_route: '/admin?section=integrations',
            priority: 'critical',
            channel: 'in_app',
            delivery_status: 'delivered',
            delivery_metadata_json: {},
            deduplication_key: 'integration_failure:fathom:error:admin-1',
            email_queued: false,
            retry_count: 0,
            error_message: null,
            read_at: null,
            delivered_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        total_count: 1,
        unread_count: 1,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <NotificationTray />
      </MemoryRouter>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(await screen.findByText('Fathom integration failure')).toBeInTheDocument()
    expect(screen.getByText(/1 unread updates/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
