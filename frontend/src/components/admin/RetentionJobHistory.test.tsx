import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RetentionJobHistory } from '@/components/admin/RetentionJobHistory'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RetentionJobHistory', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads retention policies and sends log search/action filters', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/admin/retention-policies')) {
        return jsonResponse({
          items: [{
            id: 'policy-1',
            name: 'Archive old timeline',
            entity_type: 'timeline_entry',
            action: 'archive',
            duration_days: 365,
            reason_template: 'Archive old entries.',
            critical_behavior: 'tombstone',
            schedule_enabled: true,
            schedule_interval_hours: 24,
            last_run_at: null,
            next_run_at: null,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
          total: 1,
          page: 1,
          page_size: 100,
          pages: 1,
        })
      }
      return jsonResponse({
        items: [{
          id: 'action-1',
          policy_id: 'policy-1',
          entity_type: 'timeline_entry',
          action: url.includes('action=delete') ? 'delete' : 'archive',
          mode: 'manual',
          status: 'complete',
          matched_count: 1,
          affected_count: 1,
          reason: 'Test retention policy.',
          actor_id: 'admin',
          actor_name: 'KAM Super Admin',
          error_message: null,
          metadata: {},
          created_at: new Date().toISOString(),
        }],
        total: 1,
        page: 1,
        page_size: 25,
        pages: 1,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RetentionJobHistory />)

    expect(await screen.findByText('Archive old timeline')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText('Reason or actor'), 'Test retention')
    await userEvent.selectOptions(screen.getByLabelText(/action/i), 'delete')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('search=Test+retention'), expect.anything())
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('action=delete'), expect.anything())
    })
  })
})
