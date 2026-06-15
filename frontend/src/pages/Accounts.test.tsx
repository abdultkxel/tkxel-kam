import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Accounts } from '@/pages/Accounts'
import { useAccountStore } from '@/stores/accountStore'

const mockedAuth = vi.hoisted(() => ({
  user: {
    id: 'usr-admin',
    name: 'KAM Super Admin',
    email: 'admin@tkxel.com',
    role: 'super_admin',
    avatarInitials: 'KA',
  },
  capabilities: {
    permission_keys: ['accounts:view_portfolio', 'accounts:assign_owner', 'onboarding:view_all', 'onboarding:approve_draft'],
    can_access_admin: true,
    can_view_portfolio: true,
    can_update_assigned_accounts: true,
    can_update_portfolio_accounts: true,
    can_assign_account_owners: true,
    can_approve_onboarding: true,
    can_view_sensitive_sources: true,
    can_manage_sensitive_sources: true,
    can_approve_kyc: true,
    can_moderate_timeline: true,
    can_export_reports: true,
    can_configure_playbooks: true,
    can_manage_tasks_portfolio: true,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: mockedAuth.user,
    capabilities: mockedAuth.capabilities,
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
    user_email: 'account.manager.user@tkxel.com',
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

const onboardingDraft = {
  id: 'draft-1',
  status: 'ready_for_review',
  extraction_status: 'completed',
  account_name: 'Draft Workspace',
  project_name: 'Draft customer launch',
  company_url: 'https://draft.example.com',
  linkedin_url: 'https://www.linkedin.com/company/draft-workspace',
  lifecycle_status: 'Draft',
  segment: 'Growth',
  region: 'Global',
  commercial_value: 0,
  currency: 'USD',
  primary_owner_id: 'usr-am',
  primary_owner_name: 'Account Manager KAM',
  primary_owner_email: 'account.manager.user@tkxel.com',
  confidence: 82,
  missing_fields: [],
  conflicts: [],
  source_citation: 'Charter p1: source-backed intake.',
  created_by_name: 'Admin',
  approved_account_id: null,
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
  source_documents: [],
  engagement_drafts: [],
}

function paginated(page = 1, pageSize = 12, items = [account]) {
  return {
    items,
    total: items.length === 1 ? 13 : items.length,
    page,
    page_size: pageSize,
    pages: items.length === 1 ? 2 : items.length ? 1 : 0,
  }
}

function draftPage(items = [] as typeof onboardingDraft[]) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 25,
    pages: items.length ? 1 : 0,
  }
}

describe('Accounts', () => {
  beforeEach(() => {
    window.localStorage.clear()
    Object.assign(mockedAuth.user, {
      id: 'usr-admin',
      name: 'KAM Super Admin',
      email: 'admin@tkxel.com',
      role: 'super_admin',
      avatarInitials: 'KA',
    })
    Object.assign(mockedAuth.capabilities, {
      permission_keys: ['accounts:view_portfolio', 'accounts:assign_owner', 'onboarding:view_all', 'onboarding:approve_draft'],
      can_access_admin: true,
      can_view_portfolio: true,
      can_update_assigned_accounts: true,
      can_update_portfolio_accounts: true,
      can_assign_account_owners: true,
      can_approve_onboarding: true,
      can_view_sensitive_sources: true,
      can_manage_sensitive_sources: true,
      can_approve_kyc: true,
      can_moderate_timeline: true,
      can_export_reports: true,
      can_configure_playbooks: true,
      can_manage_tasks_portfolio: true,
    })
    useAccountStore.setState({
      segmentTags: ['Strategic', 'Enterprise', 'Growth', 'APAC', 'Tier-1'],
    })
  })

  it('renders account cards and sends search, filters, sorting, and pagination to the API without segment filtering', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage())
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
    expect(screen.queryByText('Matched accounts')).not.toBeInTheDocument()
    expect(screen.queryByText('Page ARR')).not.toBeInTheDocument()
    expect(screen.queryByText('Segments')).not.toBeInTheDocument()
    expect(screen.getByText('account.manager.user@tkxel.com')).toBeInTheDocument()
    expect(screen.getAllByText('$1.3M').length).toBeGreaterThan(0)

    await userEvent.type(screen.getByPlaceholderText(/account name, am, or email/i), 'Cafe')
    await userEvent.selectOptions(screen.getByLabelText(/stage/i), 'Onboarding')
    await userEvent.click(screen.getByRole('button', { name: /^critical$/i }))
    await userEvent.selectOptions(screen.getByLabelText(/sort/i), 'commercial_value')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return (
        url.includes('/api/accounts?') &&
        url.includes('search=Cafe') &&
        url.includes('lifecycle_status=Onboarding') &&
        url.includes('risk_status=critical') &&
        url.includes('sort=commercial_value') &&
        url.includes('page=2') &&
        !url.includes('segment=')
      )
    })).toBe(true))
  })

  it('uses success styling for Active account stage badges in cards and table rows', async () => {
    const activeAccount = { ...account, lifecycle_status: 'Active' }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage())
      return jsonResponse(paginated(1, 12, [activeAccount]))
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

    const card = (await screen.findByText('Cafe Zupas')).closest('article')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('Active')).toHaveClass('bg-rag-green/10', 'text-rag-green')

    await userEvent.click(screen.getByRole('button', { name: /table view/i }))

    const table = screen.getByRole('table')
    expect(within(table).getByText('Active')).toHaveClass('bg-rag-green/10', 'text-rag-green')
  })

  it('ignores legacy segment query params after the segment filter removal', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage())
      return jsonResponse(paginated(1, 12))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts?segment=Enterprise']}>
        <Routes>
          <Route path="/accounts" element={<Accounts />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Cafe Zupas')).toBeInTheDocument()

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = new URL(String(call[0]), 'http://localhost')
      return url.pathname.endsWith('/api/accounts') && !url.searchParams.has('segment')
    })).toBe(true))
    expect(fetchMock.mock.calls.every(call => !String(call[0]).includes('segment='))).toBe(true)
  })

  it('uses server-side sorting when sortable table headers are clicked', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage())
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
    await userEvent.click(screen.getByRole('button', { name: /table view/i }))
    await userEvent.click(screen.getByRole('button', { name: /^am$/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return (
        url.includes('/api/accounts?') &&
        url.includes('sort=owner_name') &&
        url.includes('direction=asc') &&
        url.includes('page=1')
      )
    })).toBe(true))
  })

  it('preserves AM workload query aliases when requesting accounts', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/account-managers')) {
        return jsonResponse([
          {
            id: 'usr-am',
            email: 'account.manager.user@tkxel.com',
            full_name: 'Account Manager KAM',
            role: 'account_manager',
            title: 'Account Manager',
            is_active: true,
          },
        ])
      }
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage())
      return jsonResponse(paginated(1, 12))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts?am_id=usr-am']}>
        <Routes>
          <Route path="/accounts" element={<Accounts />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Cafe Zupas')).toBeInTheDocument()
    expect(await screen.findByText('AM workload: Account Manager KAM')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^account manager$/i })).toHaveValue('usr-am')

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = new URL(String(call[0]), 'http://localhost')
      return url.pathname.endsWith('/api/accounts') && url.searchParams.get('am_id') === 'usr-am' && !url.searchParams.has('primary_am')
    })).toBe(true))
  })

  it('shows ready-for-review onboarding drafts in the account list for portfolio reviewers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage([onboardingDraft]))
      return jsonResponse(paginated(1, 12, []))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/onboarding" element={<div>Onboarding review loaded</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByText('Draft Workspace'))

    expect(await screen.findByText('Onboarding review loaded')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return url.includes('/api/onboarding/drafts') && url.includes('status=ready_for_review')
    })).toBe(true)
  })

  it('shows ready-for-review onboarding drafts in the account list for account managers who created drafts', async () => {
    Object.assign(mockedAuth.user, {
      id: 'usr-am',
      name: 'Account Manager KAM',
      email: 'account.manager.user@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    })
    Object.assign(mockedAuth.capabilities, {
      permission_keys: ['accounts:view_assigned', 'onboarding:view_assigned', 'onboarding:create_draft'],
      can_access_admin: false,
      can_view_portfolio: false,
      can_update_assigned_accounts: true,
      can_update_portfolio_accounts: false,
      can_assign_account_owners: false,
      can_approve_onboarding: false,
      can_view_sensitive_sources: false,
      can_manage_sensitive_sources: false,
      can_approve_kyc: false,
      can_moderate_timeline: false,
      can_export_reports: false,
      can_configure_playbooks: false,
      can_manage_tasks_portfolio: false,
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/onboarding/drafts')) return jsonResponse(draftPage([onboardingDraft]))
      return jsonResponse(paginated(1, 12, []))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/onboarding" element={<div>Onboarding review loaded</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByText('Draft Workspace'))

    expect(await screen.findByText('Onboarding review loaded')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return url.includes('/api/onboarding/drafts') && url.includes('status=ready_for_review')
    })).toBe(true)
  })
})
