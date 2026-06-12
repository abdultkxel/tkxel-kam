import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminOpportunityTypesPanel } from '@/components/admin/AdminOpportunityTypesPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const opportunityTypes = [
  {
    id: 'type-expansion',
    slug: 'expansion',
    name: 'Expansion',
    description: 'Grow an existing account.',
    is_active: true,
    display_order: 10,
    in_use_count: 3,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'type-rescue',
    slug: 'rescue_recovery',
    name: 'Rescue/Recovery',
    description: 'Recover a risky relationship.',
    is_active: false,
    display_order: 20,
    in_use_count: 1,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
]

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page(items: typeof opportunityTypes) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 100,
    pages: 1,
  }
}

describe('AdminOpportunityTypesPanel', () => {
  function stubOpportunityTypeFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/opportunity-types/type-rescue') && init?.method === 'PATCH') {
        return jsonResponse({ ...opportunityTypes[1], is_active: true })
      }
      if (url.includes('/api/admin/opportunity-types')) {
        return jsonResponse(page(opportunityTypes))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('shows an explicit edit action that loads the type into the form', async () => {
    stubOpportunityTypeFetch()
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    await user.click(await screen.findByRole('button', { name: /edit expansion/i }))

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Expansion')
    expect(screen.getByLabelText(/^slug$/i)).toHaveValue('expansion')
    expect(screen.getByLabelText(/^display order$/i)).toHaveValue(10)
    expect(screen.getByLabelText(/^description$/i)).toHaveValue('Grow an existing account.')
    expect(screen.getByRole('checkbox', { name: /^active$/i })).toBeChecked()
  })

  it('shows a reactivate action for inactive types and patches them active', async () => {
    const fetchMock = stubOpportunityTypeFetch()
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    await user.click(await screen.findByRole('button', { name: /reactivate rescue\/recovery/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/opportunity-types/type-rescue'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ is_active: true }),
        }),
      )
    })
  })
})
