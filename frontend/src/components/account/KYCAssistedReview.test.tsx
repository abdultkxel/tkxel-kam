import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KYCAssistedReview } from '@/components/account/KYCAssistedReview'
import { ApiError } from '@/services/api'
import {
  approveKycDraft,
  createKycDraft,
  getKycFreshness,
  listKycAgentRuns,
  listKycDrafts,
  listKycSnapshots,
  rejectKycDraft,
  runPendingKycJobs,
  restoreKycSnapshot,
  updateKycDraft,
} from '@/services/kyc'
import { Account } from '@/types/account'
import { KycDraft, KycFreshness, KycSnapshot } from '@/types/kyc'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/services/kyc', () => ({
  approveKycDraft: vi.fn(),
  createKycDraft: vi.fn(),
  getKycFreshness: vi.fn(),
  listKycAgentRuns: vi.fn(),
  listKycDrafts: vi.fn(),
  listKycSnapshots: vi.fn(),
  rejectKycDraft: vi.fn(),
  runPendingKycJobs: vi.fn(),
  restoreKycSnapshot: vi.fn(),
  updateKycDraft: vi.fn(),
}))

const account: Account = {
  id: 'acct-1',
  name: 'Acme Corp',
  segment: 'Enterprise',
  tags: ['Retail'],
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  stage: 'Active',
  riskStatus: 'warning',
  arr: 1200000,
  nextQbr: '2026-07-01T00:00:00Z',
  health: { overall: 70, relationship: 70, usage: 70, delivery: 70, commercial: 70 },
  stakeholders: ['Jane Sponsor'],
  risks: [],
}

function draft(overrides: Partial<KycDraft> = {}): KycDraft {
  return {
    id: 'draft-1',
    account_id: account.id,
    status: 'ready_for_review',
    trigger_source: 'kyc_page',
    agent_run_id: 'run-1',
    previous_snapshot_id: null,
    approved_snapshot_id: null,
    source_document_ids: ['doc-1'],
    research_sources: ['Trivoly', 'ZoomInfo'],
    fields: [
      {
        key: 'company_snapshot',
        label: 'Company snapshot',
        workstream_key: 'client_research',
        workstream_title: 'Client Research',
        value: 'Acme is a strategic enterprise account.',
        confidence: 86,
        is_required: true,
        is_sensitive: false,
        reviewed: false,
        missing: false,
        conflict: false,
        previous_value: null,
        citations: [{ source_document_id: 'doc-1', label: 'Charter p1', page_number: 1, excerpt: 'Acme account context.', field_key: 'company_snapshot', restricted: false }],
      },
      {
        key: 'gross_margins',
        label: 'Gross margins',
        workstream_key: 'financial_landscape',
        workstream_title: 'Financial Landscape',
        value: 'Restricted KYC field',
        confidence: 64,
        is_required: true,
        is_sensitive: true,
        reviewed: false,
        missing: false,
        conflict: false,
        previous_value: null,
        citations: [],
      },
    ],
    citations: [],
    missing_fields: [],
    conflicts: ['Commercial details need finance acknowledgement.'],
    difference_summary: ['Initial approved snapshot will be created from this draft.'],
    source_context: {},
    confidence: 75,
    completeness: 95,
    source_coverage: 80,
    freshness_status: 'fresh',
    low_confidence_acknowledged: false,
    conflicts_acknowledged: false,
    override_reason: null,
    review_notes: null,
    created_by_name: 'KAM Head',
    reviewed_by_name: null,
    approved_by_name: null,
    rejected_by_name: null,
    rejection_reason: null,
    created_at: '2026-06-01T07:00:00Z',
    updated_at: '2026-06-01T07:00:00Z',
    decided_at: null,
    ai_disclaimer: 'AI-assisted output generated from recorded platform data. Verify before use in client communication.',
    ...overrides,
  }
}

function snapshot(overrides: Partial<KycSnapshot> = {}): KycSnapshot {
  const item = draft()
  return {
    id: 'snapshot-1',
    account_id: account.id,
    version: 1,
    source_draft_id: item.id,
    extraction_run_id: item.agent_run_id,
    approved_by_name: 'KAM Head',
    approved_at: '2026-06-01T08:00:00Z',
    fields: item.fields,
    citations: [],
    source_context: {},
    source_document_ids: item.source_document_ids,
    research_sources: item.research_sources,
    confidence: item.confidence,
    completeness: item.completeness,
    source_coverage: item.source_coverage,
    freshness_status: 'fresh',
    missing_fields: [],
    conflicts: [],
    change_summary: ['Initial snapshot approved.'],
    created_at: '2026-06-01T08:00:00Z',
    ai_disclaimer: item.ai_disclaimer,
    ...overrides,
  }
}

const freshness: KycFreshness = {
  account_id: account.id,
  has_approved_snapshot: true,
  snapshot_id: 'snapshot-1',
  snapshot_version: 1,
  completeness: 95,
  confidence: 75,
  source_coverage: 80,
  freshness_status: 'fresh',
  stale: false,
  freshness_threshold_days: 180,
  last_approved_at: '2026-06-01T08:00:00Z',
  stale_after: '2026-11-28T08:00:00Z',
  missing_fields: [],
  required_fields_total: 19,
  required_fields_completed: 19,
}

describe('KYCAssistedReview', () => {
  beforeEach(() => {
    vi.mocked(listKycDrafts).mockResolvedValue({ items: [draft()], total: 6, page: 1, page_size: 5, pages: 2 })
    vi.mocked(listKycAgentRuns).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1, pages: 1 })
    vi.mocked(listKycSnapshots).mockResolvedValue({ items: [snapshot()], total: 1, page: 1, page_size: 3, pages: 1 })
    vi.mocked(getKycFreshness).mockResolvedValue(freshness)
    vi.mocked(updateKycDraft).mockResolvedValue(draft({ reviewed_by_name: 'KAM Head' }))
    vi.mocked(approveKycDraft).mockResolvedValue(draft({ status: 'approved' }))
    vi.mocked(rejectKycDraft).mockResolvedValue(draft({ status: 'rejected' }))
    vi.mocked(createKycDraft).mockResolvedValue(draft({ id: 'draft-2' }))
    vi.mocked(runPendingKycJobs).mockResolvedValue({ processed_count: 0, failed_count: 0, processed_runs: [], failures: [] })
    vi.mocked(restoreKycSnapshot).mockResolvedValue(snapshot({ id: 'snapshot-3', version: 3 }))
  })

  it('loads drafts, sends filters and pagination to the API, saves edits, and renders approval errors', async () => {
    const user = userEvent.setup()
    vi.mocked(approveKycDraft).mockRejectedValueOnce(
      new ApiError('KYC approval validation failed', 422, {
        detail: { errors: [{ field: 'override_reason', message: 'Required KYC fields are missing.' }] },
      }),
    )

    render(<KYCAssistedReview account={account} />)

    expect(screen.getByText(/Loading KYC workspace/i)).toBeInTheDocument()
    expect(await screen.findByText('Company snapshot')).toBeInTheDocument()
    expect(screen.getByText('Snapshot v1 is fresh.')).toBeInTheDocument()

    await user.click(screen.getAllByLabelText('Next page')[0])
    await waitFor(() => expect(listKycDrafts).toHaveBeenCalledWith('test-token', account.id, expect.objectContaining({ page: 2 })))

    await user.type(screen.getByPlaceholderText(/search drafts/i), 'renewal')
    await waitFor(() => expect(listKycDrafts).toHaveBeenCalledWith('test-token', account.id, expect.objectContaining({ search: 'renewal' })))

    await user.clear(screen.getByDisplayValue('Acme is a strategic enterprise account.'))
    await user.type(screen.getByLabelText(/Company snapshot/i), 'Acme has expanded into the strategic book.')
    await user.click(screen.getByRole('button', { name: /Save edits/i }))

    await waitFor(() => expect(updateKycDraft).toHaveBeenCalledWith(
      'test-token',
      account.id,
      'draft-1',
      expect.objectContaining({
        fields: expect.arrayContaining([expect.objectContaining({ key: 'company_snapshot', value: 'Acme has expanded into the strategic book.', reviewed: true })]),
      }),
    ))

    await user.click(screen.getByRole('button', { name: /Approve KYC/i }))
    expect(await screen.findByText('Required KYC fields are missing.')).toBeInTheDocument()
  })

  it('renders the empty state and creates a draft', async () => {
    const user = userEvent.setup()
    vi.mocked(listKycDrafts).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 5, pages: 1 })
    vi.mocked(listKycSnapshots).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 3, pages: 1 })
    vi.mocked(getKycFreshness).mockResolvedValue({ ...freshness, has_approved_snapshot: false, snapshot_id: null, snapshot_version: null, freshness_status: 'missing', stale: true })

    render(<KYCAssistedReview account={account} />)

    expect(await screen.findByText('No KYC drafts found')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Create KYC draft/i }))

    await waitFor(() => expect(createKycDraft).toHaveBeenCalledWith('test-token', account.id, expect.objectContaining({ trigger_source: 'kyc_page' })))
  })

  it('restores an older snapshot as the active KYC version', async () => {
    const user = userEvent.setup()
    vi.mocked(listKycSnapshots).mockResolvedValue({
      items: [
        snapshot({ id: 'snapshot-2', version: 2 }),
        snapshot({ id: 'snapshot-1', version: 1 }),
      ],
      total: 2,
      page: 1,
      page_size: 3,
      pages: 1,
    })
    vi.mocked(getKycFreshness).mockResolvedValue({ ...freshness, snapshot_id: 'snapshot-2', snapshot_version: 2 })

    render(<KYCAssistedReview account={account} />)

    expect(await screen.findByText('Version 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Restore as active/i }))
    expect(await screen.findByText(/Restore KYC version 1/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Restore reason/i), 'Previous version has the correct account context.')
    const restoreButtons = screen.getAllByRole('button', { name: /Restore as active/i })
    await user.click(restoreButtons[restoreButtons.length - 1])

    await waitFor(() => expect(restoreKycSnapshot).toHaveBeenCalledWith(
      'test-token',
      account.id,
      'snapshot-1',
      { reason: 'Previous version has the correct account context.' },
    ))
  })
})
