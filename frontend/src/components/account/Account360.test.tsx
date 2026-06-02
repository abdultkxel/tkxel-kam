import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Account360 } from '@/components/account/Account360'
import { getAccountScore, recalculateAccountScore } from '@/services/scoring'
import { useAccountStore } from '@/stores/accountStore'
import { Account } from '@/types/account'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'account.manager.user@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    },
  }),
}))

vi.mock('@/services/scoring', () => ({
  getAccountScore: vi.fn(),
  recalculateAccountScore: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/account/ScoreCalculators', () => ({
  ScoreCalculators: ({ saving }: { saving: boolean }) => <div data-testid="score-calculators">{saving ? 'Saving calculators' : 'Score calculators ready'}</div>,
}))

vi.mock('@/components/account/ScoreHistoryPanel', () => ({
  ScoreHistoryPanel: ({ accountId }: { accountId: string }) => <div data-testid="score-history">Score history for {accountId}</div>,
}))

const account: Account = {
  id: 'acct-health',
  name: 'Atlas Health Platform',
  segment: 'Growth',
  tags: [],
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  ownerEmail: 'account.manager.user@tkxel.com',
  stage: 'Active',
  riskStatus: 'warning',
  arr: 640000,
  nextQbr: '2026-06-30T00:00:00Z',
  health: { overall: 54, relationship: 48, usage: 64, delivery: 56, commercial: 61 },
  stakeholders: [],
  risks: [],
}

function score(overall: number, overrides: Record<string, unknown> = {}) {
  return {
    account_id: account.id,
    engagement_id: null,
    scope: 'account',
    overall,
    rag_status: overall >= 75 ? 'green' : overall >= 60 ? 'amber' : 'red',
    drivers: [
      { key: 'relationship', label: 'Relationship Health', score: overall - 5, weight: 30, status: 'amber' },
      { key: 'resource', label: 'Resource Health', score: overall + 4, weight: 20, status: 'green' },
      { key: 'contract', label: 'Contract Health', score: overall, weight: 20, status: 'amber' },
      { key: 'csat', label: 'CSAT Score', score: overall + 2, weight: 30, status: 'amber' },
    ],
    reason_codes: [{ code: 'missing_input_relationship_ceo', label: 'CEO engagement is using fallback evidence' }],
    metric_version: 'account-scoring-v2',
    freshness_status: 'stale',
    is_dirty: true,
    trend: 7,
    status: 'incomplete',
    latest_snapshot: {
      id: `snap-${overall}`,
      account_id: account.id,
      engagement_id: null,
      scope: 'account',
      overall,
      rag_status: overall >= 75 ? 'green' : overall >= 60 ? 'amber' : 'red',
      drivers: [],
      reason_codes: [],
      metric_version: 'account-scoring-v2',
      freshness_status: 'fresh',
      is_dirty: false,
      trend: 7,
      status: 'complete',
      source_context: {},
      calculated_by_name: 'Account Manager',
      calculated_at: '2026-06-02T10:00:00Z',
      created_at: '2026-06-02T10:00:00Z',
      metric_snapshots: [],
    },
    ...overrides,
  }
}

describe('Account360 health scoring', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads account-scoped score, shows dirty reasons, and recalculates from the Health tab', async () => {
    vi.mocked(getAccountScore).mockResolvedValue(score(63) as never)
    vi.mocked(recalculateAccountScore).mockResolvedValue(score(79, { is_dirty: false, reason_codes: [] }) as never)
    useAccountStore.setState({ accounts: [account] })

    render(
      <MemoryRouter initialEntries={[`/accounts/${account.id}?tab=health`]}>
        <Account360 account={account} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('img', { name: /health score 63 out of 100/i })).toBeInTheDocument()
    expect(screen.getByText('Score is incomplete because some Health-tab inputs are using fallback evidence.')).toBeInTheDocument()
    expect(screen.getByText('CEO engagement is using fallback evidence')).toBeInTheDocument()
    expect(screen.getByTestId('score-history')).toHaveTextContent(account.id)

    await userEvent.click(screen.getByRole('button', { name: /recalculate/i }))

    await waitFor(() =>
      expect(recalculateAccountScore).toHaveBeenCalledWith(
        'test-token',
        account.id,
        expect.objectContaining({ trigger_source: 'account_health_tab', include_signal_evaluation: true }),
      ),
    )
    expect(await screen.findByRole('img', { name: /health score 79 out of 100/i })).toBeInTheDocument()
  })

  it('shows the account score error state', async () => {
    vi.mocked(getAccountScore).mockRejectedValue(new Error('Account score API failed'))
    useAccountStore.setState({ accounts: [account] })

    render(
      <MemoryRouter initialEntries={[`/accounts/${account.id}?tab=health`]}>
        <Account360 account={account} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Account score API failed')).toBeInTheDocument()
  })
})
