import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KYCAgentOverview } from '@/components/account/KYCAgentOverview'
import { createKycAgentRun, getKycFreshness, listKycAgentRuns, refreshKycAgentRun } from '@/services/kyc'
import { KycAgentRun, KycFreshness } from '@/types/kyc'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

vi.mock('@/services/kyc', () => ({
  createKycAgentRun: vi.fn(),
  getKycFreshness: vi.fn(),
  listKycAgentRuns: vi.fn(),
  refreshKycAgentRun: vi.fn(),
}))

const freshness: KycFreshness = {
  account_id: 'acct-1',
  has_approved_snapshot: true,
  snapshot_id: 'snap-1',
  snapshot_version: 1,
  completeness: 90,
  confidence: 82,
  source_coverage: 75,
  freshness_status: 'fresh',
  stale: false,
  freshness_threshold_days: 180,
  missing_fields: [],
  required_fields_total: 19,
  required_fields_completed: 18,
}

function run(): KycAgentRun {
  return {
    id: 'run-1',
    account_id: 'acct-1',
    status: 'complete',
    trigger_source: 'kyc_page',
    previous_run_id: null,
    source_document_ids: ['doc-1'],
    research_sources: ['Trivoly'],
    triggered_by_name: 'KAM Head',
    error_message: null,
    started_at: '2026-06-01T07:00:00Z',
    completed_at: '2026-06-01T07:01:00Z',
    created_at: '2026-06-01T07:00:00Z',
    updated_at: '2026-06-01T07:01:00Z',
    ai_disclaimer: 'AI-assisted output generated from recorded platform data. Verify before use in client communication.',
    workstreams: [
      {
        id: 'ws-1',
        workstream_key: 'market_research',
        title: 'Market Research',
        status: 'complete',
        sort_order: 1,
        confidence: 86,
        output: {
          industry_overview: {
            value: 'Acme is tracked as an enterprise account in North America.',
            confidence: 86,
            citations: [],
          },
        },
        citations: [],
        missing_fields: [],
        error_message: null,
        started_at: '2026-06-01T07:00:00Z',
        completed_at: '2026-06-01T07:01:00Z',
      },
    ],
  }
}

describe('KYCAgentOverview', () => {
  beforeEach(() => {
    vi.mocked(listKycAgentRuns).mockResolvedValue({ items: [run()], total: 1, page: 1, page_size: 4, pages: 1 })
    vi.mocked(getKycFreshness).mockResolvedValue(freshness)
    vi.mocked(refreshKycAgentRun).mockResolvedValue(run())
    vi.mocked(createKycAgentRun).mockResolvedValue(run())
  })

  it('renders nested backend workstream values and refreshes the latest run', async () => {
    const user = userEvent.setup()
    const onReview = vi.fn()
    render(<KYCAgentOverview accountId="acct-1" onReview={onReview} />)

    expect(await screen.findByText('Market Research')).toBeInTheDocument()
    expect(screen.getByText('Acme is tracked as an enterprise account in North America.')).toBeInTheDocument()
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Refresh AI data/i }))
    await waitFor(() => expect(refreshKycAgentRun).toHaveBeenCalledWith('test-token', 'acct-1', 'run-1'))
  })

  it('creates the first run from the empty state', async () => {
    const user = userEvent.setup()
    vi.mocked(listKycAgentRuns).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 4, pages: 1 })

    render(<KYCAgentOverview accountId="acct-1" onReview={vi.fn()} />)

    expect(await screen.findByText('No KYC agent runs')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Start AI data refresh/i }))

    await waitFor(() => expect(createKycAgentRun).toHaveBeenCalledWith('test-token', 'acct-1', { trigger_source: 'kyc_page' }))
  })
})
