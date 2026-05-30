import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CreateAccountDialog } from '@/components/account/CreateAccountDialog'
import { toast } from 'sonner'

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

function apiDraft(status: 'ready_for_review' | 'approved' = 'ready_for_review') {
  return {
    id: 'draft-1',
    status,
    extraction_status: 'completed',
    account_name: 'Acme Corp',
    project_name: 'Customer intelligence',
    company_url: 'https://acme.example.com',
    lifecycle_status: 'Onboarding',
    segment: 'Growth',
    region: 'Global',
    commercial_value: 0,
    currency: 'USD',
    primary_owner_id: 'usr-am',
    primary_owner_name: 'Account Manager KAM',
    primary_owner_email: 'account.manager.user@tkxelkam.com',
    confidence: 82,
    missing_fields: [],
    conflicts: [],
    source_citation: 'Charter p1: source-backed intake.',
    created_by_name: 'Admin',
    approved_account_id: status === 'approved' ? 'acct-1' : null,
    created_at: '2026-05-30T00:00:00Z',
    updated_at: '2026-05-30T00:00:00Z',
    source_documents: [
      {
        id: 'doc-1',
        account_id: null,
        engagement_id: null,
        draft_id: 'draft-1',
        title: 'Acme Charter',
        source_type: 'project_charter',
        uploaded_by_name: 'Admin',
        extraction_status: 'completed',
        confidence: 82,
        pages: 1,
        is_sensitive: false,
        created_at: '2026-05-30T00:00:00Z',
        updated_at: '2026-05-30T00:00:00Z',
        citations: [{ id: 'cit-1', source_document_id: 'doc-1', label: 'Charter p1', page_number: 1, excerpt: 'Acme Corp' }],
      },
    ],
    engagement_drafts: [
      {
        id: 'eng-draft-1',
        draft_id: 'draft-1',
        name: 'Customer intelligence',
        owner_id: 'usr-am',
        owner_name: 'Account Manager KAM',
        service_lines: ['Account onboarding'],
        value: 0,
        currency: 'USD',
        delivery_status: 'active',
        start_date: '2026-05-30T00:00:00Z',
        auto_renewal: false,
        risks: [],
        confidence: 82,
      },
    ],
  }
}

const apiAccount = {
  id: 'acct-1',
  name: 'Acme Corp',
  project_name: 'Customer intelligence',
  company_url: 'https://acme.example.com',
  segment: 'Growth',
  region: 'Global',
  lifecycle_status: 'Onboarding',
  risk_status: 'warning',
  commercial_value: 0,
  currency: 'USD',
  health: { overall: 45, relationship: 45, usage: 45, delivery: 45, commercial: 45 },
  next_governance_at: null,
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
  primary_owner: { id: 'owner-1', user_id: 'usr-am', user_name: 'Account Manager KAM', ownership_role: 'primary_am' },
  owners: [],
  governance_completeness: { accountable_am: true, current_kyc: false, engagement_records: true, next_governance: false },
}

const customFields = [
  {
    id: 'field-1',
    module: 'account_overview',
    field_key: 'customer_tier',
    label: 'Customer Tier',
    description: 'Tier from Admin Field Builder.',
    field_type: 'single_select',
    placeholder: null,
    help_text: null,
    options: ['Gold', 'Silver'],
    is_required: true,
    is_sensitive: false,
    show_in_list: true,
    show_in_detail: true,
    sort_order: 1,
  },
]

async function fillForm() {
  await userEvent.click(screen.getByRole('button', { name: /create account/i }))
  await userEvent.type(screen.getByLabelText(/name of account/i), 'Acme Corp')
  await userEvent.type(screen.getByLabelText(/name of project/i), 'Customer intelligence')
  await userEvent.type(screen.getByLabelText(/company url/i), 'https://acme.example.com')
}

describe('CreateAccountDialog', () => {
  it('creates and approves an onboarding draft before navigating to the account', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
      if (url.endsWith('/api/onboarding/drafts') && method === 'POST') return jsonResponse(apiDraft())
      if (url.endsWith('/api/onboarding/drafts/draft-1/approve') && method === 'POST') return jsonResponse(apiDraft('approved'))
      if (url.endsWith('/api/accounts/acct-1') && method === 'GET') return jsonResponse(apiAccount)
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<CreateAccountDialog />} />
          <Route path="/accounts/:id" element={<div>Account page loaded</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await fillForm()
    await userEvent.click(screen.getAllByRole('button', { name: /create account/i }).at(-1)!)

    expect(await screen.findByText('Account page loaded')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/drafts/draft-1/approve'))).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Account created. Complete KYC in Account Overview.')
  })

  it('shows backend validation errors at matching account fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
        return jsonResponse(
          {
            detail: {
              message: 'Draft approval validation failed',
              errors: [
                { field: 'account_name', message: 'Account name is already in review.' },
                { field: 'project_name', message: 'Project name needs source evidence.' },
              ],
            },
          },
          422,
        )
      }),
    )

    render(
      <MemoryRouter>
        <CreateAccountDialog />
      </MemoryRouter>,
    )

    await fillForm()
    await userEvent.click(screen.getAllByRole('button', { name: /create account/i }).at(-1)!)

    expect(await screen.findByText('Account name is already in review.')).toBeInTheDocument()
    expect(screen.getByText('Project name needs source evidence.')).toBeInTheDocument()
  })

  it('renders Field Builder fields and submits their values with account creation', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse(customFields)
      if (url.endsWith('/api/onboarding/drafts') && method === 'POST') return jsonResponse(apiDraft())
      if (url.endsWith('/api/onboarding/drafts/draft-1/approve') && method === 'POST') return jsonResponse(apiDraft('approved'))
      if (url.endsWith('/api/accounts/acct-1') && method === 'GET') return jsonResponse(apiAccount)
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<CreateAccountDialog />} />
          <Route path="/accounts/:id" element={<div>Account page loaded</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await fillForm()
    expect(await screen.findByLabelText(/customer tier/i)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/customer tier/i), 'Gold')
    await userEvent.click(screen.getAllByRole('button', { name: /create account/i }).at(-1)!)

    await screen.findByText('Account page loaded')
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/onboarding/drafts') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.custom_field_values?.customer_tier === 'Gold'
    })).toBe(true)
  })
})
