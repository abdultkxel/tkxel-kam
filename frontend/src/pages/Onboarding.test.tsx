import { render, screen, waitFor, within } from '@testing-library/react'
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
  company_url: null,
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
  missing_fields: ['Company website was not found in the uploaded source text.'],
  conflicts: [],
  source_citation: 'Uploaded SOW p1: source-backed intake.',
  created_by_name: 'Account Manager KAM',
  approved_account_id: null,
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
  source_documents: [
    {
      id: 'source-original',
      account_id: null,
      engagement_id: null,
      draft_id: 'draft-am-owned',
      title: 'Original SOW',
      source_type: 'sow',
      file_name: 'original-sow.pdf',
      file_url: null,
      link_url: null,
      storage_backend: 'local',
      mime_type: 'application/pdf',
      size_bytes: 256,
      checksum_sha256: 'original-checksum',
      extracted_text_checksum: 'original-text-checksum',
      extracted_text: 'Original uploaded SOW content.',
      extraction_started_at: null,
      extraction_completed_at: '2026-05-30T00:00:00Z',
      extraction_error: null,
      ocr_status: null,
      ocr_engine: null,
      uploaded_by_name: 'Account Manager KAM',
      extraction_status: 'completed',
      confidence: 82,
      pages: 2,
      created_at: '2026-05-30T00:00:00Z',
      citations: [
        {
          id: 'citation-original',
          source_document_id: 'source-original',
          label: 'Original SOW: Account name',
          page_number: 1,
          excerpt: 'AM Created Draft',
          field_key: 'account_name',
          confidence: 82,
        },
      ],
    },
  ],
  engagement_drafts: [
    {
      id: 'engagement-draft-1',
      draft_id: 'draft-am-owned',
      name: 'Project validation baseline',
      owner_id: 'usr-am',
      owner_name: 'Account Manager KAM',
      ops_lead_id: null,
      ops_lead_name: 'Unassigned',
      service_lines: ['Account onboarding'],
      value: 0,
      currency: 'USD',
      delivery_status: 'active',
      start_date: '2026-05-30T00:00:00Z',
      end_date: '2026-06-15T00:00:00Z',
      renewal_date: '2026-06-15T00:00:00Z',
      notice_deadline: '2026-06-15T00:00:00Z',
      notice_period_days: 0,
      auto_renewal: false,
      commercial_context: 'Project validation baseline.',
      resource_dependency: null,
      risks: [],
      source_citation: 'Cafe_Zupas_SOW.xlsx p1: Service scope inferred from extracted source text.',
      confidence: 71,
    },
  ],
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
      if (url.pathname.endsWith('/api/service-catalog')) {
        return jsonResponse({
          items: [
            {
              id: 'svc-account-onboarding',
              slug: 'account_onboarding',
              name: 'Account onboarding',
              category: 'Strategy',
              description: null,
              tags: [],
              is_active: true,
              display_order: 1,
              in_use_count: 0,
            },
            {
              id: 'svc-development',
              slug: 'development',
              name: 'Development',
              category: 'Engineering',
              description: null,
              tags: [],
              is_active: true,
              display_order: 2,
              in_use_count: 0,
            },
          ],
          total: 2,
          page: 1,
          page_size: 100,
          pages: 1,
        })
      }
      if (url.pathname.endsWith('/api/onboarding/drafts/draft-am-owned') && method === 'PATCH') {
        const payload = JSON.parse(String(init?.body ?? '{}'))
        return jsonResponse({
          ...onboardingDraft,
          account_name: payload.account_name ?? onboardingDraft.account_name,
          company_url: payload.company_url ?? onboardingDraft.company_url,
          updated_at: '2026-05-31T00:00:00Z',
          missing_fields: payload.company_url ? [] : onboardingDraft.missing_fields,
          engagement_drafts: onboardingDraft.engagement_drafts.map(engagement => {
            const update = payload.engagement_drafts?.find((item: { id: string }) => item.id === engagement.id)
            return update
              ? {
                  ...engagement,
                  name: update.name,
                  service_lines: update.service_lines,
                  value: update.value,
                  delivery_status: update.delivery_status,
                  start_date: update.start_date,
                  end_date: update.end_date,
                  renewal_date: update.renewal_date,
                  notice_deadline: update.notice_deadline,
                  auto_renewal: update.auto_renewal,
                  confidence: update.confidence,
                  ops_lead_name: update.ops_lead_name,
                  source_citation: update.source_citation,
                }
              : engagement
          }),
        })
      }
      if (url.pathname.endsWith('/api/onboarding/drafts/draft-am-owned/reject') && method === 'POST') {
        return jsonResponse({ ...onboardingDraft, account_name: 'AM Edited Draft', status: 'rejected' })
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
    const uploadSection = screen.getByRole('heading', { name: /upload new charter/i }).closest('section') as HTMLElement
    expect(uploadSection).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /upload project charter/i })).not.toBeInTheDocument()
    expect(within(uploadSection).getByText('original-sow.pdf')).toBeInTheDocument()
    expect(within(uploadSection).getByRole('button', { name: /download existing charter/i })).toBeInTheDocument()
    expect(within(uploadSection).queryByText(/download and verify this file before uploading another charter/i)).not.toBeInTheDocument()
    expect(within(uploadSection).queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /draft queue/i })).toBeInTheDocument()
    expect(screen.queryByText('ARR Draft')).not.toBeInTheDocument()
    expect(screen.getByText('Engagements')).toBeInTheDocument()
    expect(screen.getByText('Missing fields')).toBeInTheDocument()
    expect(screen.getByText('Company website was not found in the uploaded source text.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /source citations/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sow \/ charter source/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('original-sow.pdf').length).toBeGreaterThan(0)
    const contextSection = screen.getByRole('heading', { name: /source-backed account context/i }).closest('section') as HTMLElement
    expect(within(contextSection).getByText('Created by')).toBeInTheDocument()
    expect(within(contextSection).getByText('Account Manager KAM')).toBeInTheDocument()
    expect(within(contextSection).getByText('Created at')).toBeInTheDocument()
    expect(within(contextSection).getByText('Last updated at')).toBeInTheDocument()
    expect(within(contextSection).getAllByText('May 30, 2026')).toHaveLength(2)
    expect(within(contextSection).queryByText('Project')).not.toBeInTheDocument()
    expect(within(contextSection).queryByText('Company URL')).not.toBeInTheDocument()
    expect(within(contextSection).queryByText('LinkedIn URL')).not.toBeInTheDocument()
    expect(within(contextSection).queryByText('Evidence')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /^approve$/i })).not.toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    expect(screen.getByRole('dialog', { name: /reject this draft/i })).toBeInTheDocument()
    expect(screen.getByText(/move it out of active review/i)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/drafts/draft-am-owned/reject'))).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /reject this draft/i })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Account Manager KAM - account.manager.user@tkxel.com' }).length).toBeGreaterThan(0))
    expect(screen.getByLabelText(/assigned account manager/i)).toHaveValue('usr-am')
    await userEvent.clear(screen.getByLabelText(/account name/i))
    await userEvent.type(screen.getByLabelText(/account name/i), 'AM Edited Draft')
    await userEvent.type(screen.getByLabelText(/company url/i), 'https://am-edited.example.com')
    expect(screen.getByLabelText('Account onboarding')).toBeChecked()
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2026-05-30')
    expect(screen.getByLabelText(/delivery status/i)).toHaveValue('active')
    await userEvent.clear(screen.getByLabelText(/engagement name/i))
    await userEvent.type(screen.getByLabelText(/engagement name/i), 'Edited project validation baseline')
    await userEvent.clear(screen.getByLabelText(/^value$/i))
    await userEvent.type(screen.getByLabelText(/^value$/i), '25000')
    await userEvent.clear(screen.getByLabelText(/sow end/i))
    await userEvent.type(screen.getByLabelText(/sow end/i), '2026-09-30')
    await userEvent.clear(screen.getByLabelText(/notice deadline/i))
    await userEvent.type(screen.getByLabelText(/notice deadline/i), '2026-08-31')
    await userEvent.selectOptions(screen.getByLabelText(/auto-renewal/i), 'true')
    await userEvent.clear(screen.getByLabelText(/confidence/i))
    await userEvent.type(screen.getByLabelText(/confidence/i), '88')
    await userEvent.clear(screen.getByLabelText(/ops lead/i))
    await userEvent.type(screen.getByLabelText(/ops lead/i), 'Delivery Lead')
    await userEvent.clear(screen.getByLabelText(/source note/i))
    await userEvent.type(screen.getByLabelText(/source note/i), 'Reviewed SOW baseline note.')
    await userEvent.click(screen.getByRole('button', { name: /save baseline changes/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'AM Edited Draft' })).toBeInTheDocument())
    expect(await screen.findByDisplayValue('Edited project validation baseline')).toBeInTheDocument()
    expect(screen.queryByText('Company website was not found in the uploaded source text.')).not.toBeInTheDocument()
    expect(screen.getByText('No review blockers.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/onboarding/drafts/draft-am-owned') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      const engagement = payload.engagement_drafts?.[0]
      return payload.account_name === 'AM Edited Draft'
        && payload.company_url === 'https://am-edited.example.com'
        && payload.primary_owner_id === 'usr-am'
        && engagement?.id === 'engagement-draft-1'
        && engagement?.name === 'Edited project validation baseline'
        && engagement?.service_lines?.[0] === 'Account onboarding'
        && engagement?.value === 25000
        && engagement?.delivery_status === 'active'
        && engagement?.start_date === '2026-05-30T00:00:00.000Z'
        && engagement?.end_date === '2026-09-30T00:00:00.000Z'
        && engagement?.notice_deadline === '2026-08-31T00:00:00.000Z'
        && engagement?.auto_renewal === true
        && engagement?.confidence === 88
        && engagement?.ops_lead_name === 'Delivery Lead'
        && engagement?.source_citation === 'Reviewed SOW baseline note.'
    })).toBe(true)
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/onboarding/drafts'))).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /^reject$/i }))
    await userEvent.click(screen.getByRole('button', { name: /reject draft/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      return String(url).endsWith('/api/onboarding/drafts/draft-am-owned/reject') && init?.method === 'POST'
    })).toBe(true))
  })
})
