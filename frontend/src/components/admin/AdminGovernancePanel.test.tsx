import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminGovernancePanel } from '@/components/admin/AdminGovernancePanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'user-1', fullName: 'Admin User' },
  }),
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

function page<T>(items: T[], total = items.length) {
  return { items, total, page: 1, page_size: 10, pages: total ? 1 : 0 }
}

describe('AdminGovernancePanel', () => {
  it('shows recurrence rules without loading the integrations card', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/admin/governance-recurrence-rules')) {
        return jsonResponse(page([
          {
            id: 'rule-1',
            name: 'Cafe Zupas quarterly QBR',
            governance_type: 'QBR',
            cadence: 'quarterly',
            interval: 1,
            start_at: '2026-06-15T10:00:00Z',
            end_policy: 'after_occurrences',
            occurrences: 4,
            account_id: 'account-1',
            owner_id: 'user-1',
            owner_name: 'Admin User',
            is_active: true,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z',
          },
        ]))
      }
      if (url.includes('/api/accounts')) {
        return jsonResponse(page([
          {
            id: 'account-1',
            name: 'Cafe Zupas',
            segment: 'Enterprise',
            region: 'North America',
            lifecycle_status: 'Expansion Focus',
            risk_status: 'healthy',
            commercial_value: 100000,
            currency: 'USD',
            health: { overall: 91, relationship: 90, usage: 88, delivery: 93, commercial: 92 },
            updated_at: '2026-06-01T00:00:00Z',
            owners: [],
            governance_completeness: {},
          },
        ]))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminGovernancePanel />)

    expect(await screen.findByText('Cafe Zupas quarterly QBR')).toBeInTheDocument()
    expect(screen.getByText(/account Cafe Zupas/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /recurrence rules/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /approved integrations/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/admin/integrations'))).toBe(false)
    })
  })
})
