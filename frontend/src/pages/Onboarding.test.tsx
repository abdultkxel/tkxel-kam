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
  engagement_drafts: [],
}

const reuploadedDraft = {
  ...onboardingDraft,
  account_name: 'Reuploaded Draft',
  project_name: 'Replacement SOW Review',
  source_documents: [
    {
      ...onboardingDraft.source_documents[0],
      id: 'source-replacement',
      title: 'Replacement SOW',
      file_name: 'replacement-sow.pdf',
      checksum_sha256: 'replacement-checksum',
      extracted_text: 'Replacement uploaded SOW content.',
      citations: [
        {
          id: 'citation-replacement',
          source_document_id: 'source-replacement',
          label: 'Replacement SOW: Account name',
          page_number: 1,
          excerpt: 'Reuploaded Draft',
          field_key: 'account_name',
          confidence: 84,
        },
      ],
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
      if (url.pathname.endsWith('/api/onboarding/drafts/draft-am-owned') && method === 'PATCH') {
        return jsonResponse({ ...onboardingDraft, account_name: 'AM Edited Draft' })
      }
      if (url.pathname.endsWith('/api/onboarding/drafts/draft-am-owned/documents/upload') && method === 'POST') {
        return jsonResponse(reuploadedDraft)
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
    expect(screen.queryByRole('heading', { name: /draft queue/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sow \/ charter source/i })).toBeInTheDocument()
    expect(screen.getByText('Original SOW')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download source document/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/upload replacement sow or charter/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /approve draft/i })).not.toBeDisabled()
    expect(await screen.findByRole('option', { name: 'Account Manager KAM - account.manager.user@tkxel.com' })).toBeInTheDocument()
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

    await userEvent.upload(screen.getByLabelText(/upload replacement sow or charter/i), new File(['replacement'], 'replacement-sow.pdf', { type: 'application/pdf' }))
    expect(screen.getByText('replacement-sow.pdf')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /re-upload source/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reuploaded Draft' })).toBeInTheDocument())
    expect(screen.getByText('Replacement SOW')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      return String(url).endsWith('/api/onboarding/drafts/draft-am-owned/documents/upload') && init?.method === 'POST' && init.body instanceof FormData
    })).toBe(true)
  })
})
