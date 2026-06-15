import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Onboarding } from '@/pages/Onboarding'

const mockedAuth = vi.hoisted(() => ({
  user: {
    id: 'usr-am',
    name: 'Account Manager KAM',
    email: 'account.manager.user@tkxel.com',
    role: 'account_manager',
    avatarInitials: 'AM',
  },
  capabilities: {
    permission_keys: ['accounts:view_assigned', 'onboarding:view_assigned', 'onboarding:create_draft', 'onboarding:update_draft', 'onboarding:approve_draft'],
    can_access_admin: false,
    can_view_portfolio: false,
    can_update_assigned_accounts: true,
    can_update_portfolio_accounts: false,
    can_assign_account_owners: false,
    can_approve_onboarding: true,
    can_view_sensitive_sources: false,
    can_manage_sensitive_sources: false,
    can_approve_kyc: false,
    can_moderate_timeline: false,
    can_export_reports: false,
    can_configure_playbooks: false,
    can_manage_tasks_portfolio: false,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: mockedAuth.user,
    capabilities: mockedAuth.capabilities,
  }),
}))

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const onboardingDraft = {
  id: 'draft-am-owned',
  status: 'ready_for_review',
  extraction_status: 'completed',
  account_name: 'AM Created Draft',
  project_name: 'Customer onboarding launch',
  company_url: 'https://am-created.example.com',
  linkedin_url: 'https://www.linkedin.com/company/am-created',
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
  source_citation: 'Uploaded SOW p1: source-backed intake.',
  created_by_name: 'Account Manager KAM',
  approved_account_id: null,
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
  source_documents: [],
  engagement_drafts: [],
}

describe('Onboarding', () => {
  it('shows AM-created drafts and saves editable draft fields through the API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
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
      if (url.pathname.endsWith('/api/onboarding/drafts/draft-am-owned') && method === 'PATCH') {
        return jsonResponse({ ...onboardingDraft, account_name: 'AM Edited Draft' })
      }
      if (url.pathname.endsWith('/api/onboarding/drafts')) {
        return jsonResponse({
          items: [onboardingDraft],
          total: 1,
          page: 1,
          page_size: 25,
          pages: 1,
        })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Onboarding />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'AM Created Draft' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /upload source documents/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/select charter\/sow files/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /draft queue/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /approve draft/i })).not.toBeDisabled()
    await userEvent.clear(screen.getByLabelText(/account name/i))
    await userEvent.type(screen.getByLabelText(/account name/i), 'AM Edited Draft')
    await userEvent.click(screen.getByRole('button', { name: /save draft changes/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'AM Edited Draft' })).toBeInTheDocument())
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/onboarding/drafts/draft-am-owned') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.account_name === 'AM Edited Draft' && payload.primary_owner_id === 'usr-am'
    })).toBe(true)
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/onboarding/drafts'))).toBe(true)
  })
})
