import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountDetail } from '@/pages/AccountDetail'
import { useAccountStore } from '@/stores/accountStore'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-1',
      name: 'Account Manager KAM',
      email: 'account.manager.user@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    },
  }),
}))

vi.mock('@/components/account/Account360', () => ({
  Account360: ({ account, overview }: { account: { name: string }; overview?: { summaryCards: { openOpportunities: number } } }) => (
    <div data-testid="account-360">
      <p>Workspace: {account.name}</p>
      <p>Open opportunities from overview: {overview?.summaryCards.openOpportunities ?? 'missing'}</p>
    </div>
  ),
}))

const apiOverview = {
  account: {
    id: 'acct-overview',
    name: 'Northwind Overview',
    project_name: 'Customer intelligence modernization',
    company_url: 'https://northwind.example.com',
    segment: 'Enterprise',
    region: 'North America',
    lifecycle_status: 'Active',
    risk_status: 'healthy',
    commercial_value: 875000,
    currency: 'USD',
    health: { overall: 82, relationship: 80, usage: 78, delivery: 88, commercial: 84 },
    next_governance_at: '2026-06-30T10:00:00Z',
    updated_at: '2026-06-02T10:00:00Z',
    primary_owner: {
      id: 'owner-1',
      user_id: 'usr-1',
      user_name: 'Account Manager KAM',
      user_email: 'account.manager.user@tkxel.com',
      ownership_role: 'primary_am',
      is_primary: true,
      is_active: true,
    },
    owners: [],
    governance_completeness: {
      accountable_am: true,
      current_kyc: true,
      engagement_records: false,
      next_governance: true,
    },
  },
  summary_cards: {
    commercial_value: 875000,
    currency: 'USD',
    lifecycle_status: 'Active',
    risk_status: 'healthy',
    health_overall: 82,
    open_signals: 0,
    overdue_activities: 0,
    next_governance_at: '2026-06-30T10:00:00Z',
    open_opportunities: 5,
    active_escalations: 0,
  },
  permissions: {
    can_view: true,
    can_update: true,
    can_delete: false,
    can_approve: false,
    can_assign: false,
    can_manage_attachments: true,
    read_only: false,
  },
  engagements: {
    items: [],
    total: 0,
    page: 1,
    page_size: 10,
    pages: 0,
  },
  attachments: {
    items: [],
    total: 0,
    page: 1,
    page_size: 10,
    pages: 0,
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AccountDetail', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: [], accountsLoaded: false, accountsLoading: false, accountsError: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the account overview endpoint and renders account data from the response', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(apiOverview))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts/acct-overview']}>
        <Routes>
          <Route path="/accounts/:id" element={<AccountDetail />} />
          <Route path="/accounts" element={<div>Accounts list</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Northwind Overview')).toBeInTheDocument()
    expect(screen.getByText('Workspace: Northwind Overview')).toBeInTheDocument()
    expect(screen.getByText('Open opportunities from overview: 5')).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://127.0.0.1:8001/api/accounts/acct-overview/overview')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
  })
})
