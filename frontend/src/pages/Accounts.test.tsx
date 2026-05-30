import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Accounts } from '@/pages/Accounts'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-admin',
      name: 'KAM Super Admin',
      email: 'admin@tkxelkam.com',
      role: 'super_admin',
      avatarInitials: 'KA',
    },
  }),
}))

const account = {
  id: 'acct-cafe-zupas',
  name: 'Cafe Zupas',
  project_name: 'Cafe Zupas Customer Success Workspace',
  company_url: 'https://cafezupas.com',
  segment: 'Enterprise',
  region: 'North America',
  lifecycle_status: 'Onboarding',
  risk_status: 'critical',
  commercial_value: 1260000,
  currency: 'USD',
  health: { overall: 56, relationship: 45, usage: 45, delivery: 86, commercial: 45 },
  next_governance_at: '2026-06-30T00:00:00Z',
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
  primary_owner: {
    id: 'owner-1',
    user_id: 'usr-am',
    user_name: 'Account Manager KAM',
    user_email: 'account.manager.user@tkxelkam.com',
    ownership_role: 'primary_am',
    is_primary: true,
    is_active: true,
  },
  owners: [],
  governance_completeness: {
    accountable_am: true,
    current_kyc: false,
    engagement_records: true,
    next_governance: false,
  },
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function paginated(page = 1, pageSize = 12) {
  return {
    items: [account],
    total: 13,
    page,
    page_size: pageSize,
    pages: 2,
  }
}

describe('Accounts', () => {
  it('renders account cards and sends search, filters, sorting, and pagination to the API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const page = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('page_size') ?? '12')
      return jsonResponse(paginated(page, pageSize))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/:id" element={<div>Account detail</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Cafe Zupas')).toBeInTheDocument()
    expect(screen.getByText('account.manager.user@tkxelkam.com')).toBeInTheDocument()
    expect(screen.getAllByText('$1.3M').length).toBeGreaterThan(0)

    await userEvent.type(screen.getByPlaceholderText(/account, am, or email/i), 'Cafe')
    await userEvent.selectOptions(screen.getByLabelText(/stage/i), 'Onboarding')
    await userEvent.selectOptions(screen.getByLabelText(/risk/i), 'critical')
    await userEvent.selectOptions(screen.getByLabelText(/sort/i), 'commercial_value')
    await userEvent.click(screen.getByRole('button', { name: /enterprise/i }))
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return (
        url.includes('/api/accounts?') &&
        url.includes('search=Cafe') &&
        url.includes('lifecycle_status=Onboarding') &&
        url.includes('risk_status=critical') &&
        url.includes('segment=Enterprise') &&
        url.includes('sort=commercial_value') &&
        url.includes('page=2')
      )
    })).toBe(true))
  })
})
