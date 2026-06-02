import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Account360 } from '@/components/account/Account360'
import type { AccountOverviewView } from '@/services/accountWorkspace'
import { getAccountScore, recalculateAccountScore } from '@/services/scoring'
import { useAccountStore } from '@/stores/accountStore'
import type { Account } from '@/types/account'
import type { User } from '@/types/user'

let mockUser: User

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: mockUser,
  }),
}))

vi.mock('@/hooks/useRole', () => ({
  useRole: () => mockUser,
}))

vi.mock('@/services/scoring', () => ({
  getAccountScore: vi.fn(),
  recalculateAccountScore: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/components/account/KYCAgentOverview', () => ({
  KYCAgentOverview: ({ canManage }: { canManage?: boolean }) => (
    <section>
      {canManage ? (
        <>
          <button type="button">Refresh AI data</button>
          <button type="button">Review data</button>
        </>
      ) : (
        <p>KYC read-only</p>
      )}
    </section>
  ),
}))

vi.mock('@/components/ai/AIBriefCard', () => ({
  AIBriefCard: () => <div>AI brief</div>,
}))

vi.mock('@/components/account/KYCAssistedReview', () => ({
  KYCAssistedReview: () => <div>KYC review</div>,
}))

vi.mock('@/components/account/EngagementsPanel', () => ({
  EngagementsPanel: () => <div>Engagements panel</div>,
}))

vi.mock('@/components/account/StakeholderTab', () => ({
  StakeholderTab: () => <div>Stakeholders panel</div>,
}))

vi.mock('@/components/account/ScoreHistoryPanel', () => ({
  ScoreHistoryPanel: ({ accountId }: { accountId: string }) => <div data-testid="score-history">Score history for {accountId}</div>,
}))

vi.mock('@/components/account/ScoreCalculators', () => ({
  ScoreCalculators: ({ saving }: { saving: boolean }) => <div data-testid="score-calculators">{saving ? 'Saving calculators' : 'Score calculators ready'}</div>,
}))

vi.mock('@/components/opportunities/OpportunityBoard', () => ({
  OpportunityBoard: () => <div>Opportunity board</div>,
}))

vi.mock('@/pages/Opportunities', () => ({
  AddOpportunityDialog: () => <button type="button">Add opportunity</button>,
  OpportunityDetailDialog: () => null,
}))

vi.mock('@/components/account/AccountWorkspacePanel', () => ({
  AccountWorkspacePanel: ({ tab }: { tab: string }) => <div>{tab} panel</div>,
}))

vi.mock('@/components/timeline/TimelineFeed', () => ({
  TimelineFeed: () => <div>Timeline feed</div>,
}))

vi.mock('@/components/timeline/HandoverSummary', () => ({
  HandoverSummary: () => null,
}))

const account: Account = {
  id: 'acct-1',
  name: 'Northwind Overview',
  projectName: 'Customer intelligence modernization',
  companyUrl: 'https://northwind.example.com',
  segment: 'Enterprise',
  tags: ['Enterprise', 'North America'],
  ownerId: 'usr-1',
  ownerName: 'Account Manager KAM',
  ownerEmail: 'account.manager.user@tkxel.com',
  stage: 'Active',
  riskStatus: 'healthy',
  arr: 100,
  nextQbr: '2026-07-01T10:00:00Z',
  health: { overall: 55, relationship: 55, usage: 55, delivery: 55, commercial: 55 },
  stakeholders: [],
  risks: [],
}

const overview: AccountOverviewView = {
  account,
  summaryCards: {
    commercialValue: 987654,
    currency: 'USD',
    lifecycleStatus: 'Renewal Focus',
    riskStatus: 'critical',
    healthOverall: 77,
    openSignals: 4,
    overdueActivities: 3,
    nextGovernanceAt: '2026-06-30T10:00:00Z',
    openOpportunities: 6,
    activeEscalations: 2,
  },
  permissions: {
    canView: true,
    canUpdate: true,
    canDelete: false,
    canApprove: false,
    canAssign: true,
    canManageAttachments: true,
    readOnly: false,
  },
  engagements: { items: [], total: 0, page: 1, pageSize: 10, pages: 0 },
  attachments: { items: [], total: 0, page: 1, pageSize: 10, pages: 0 },
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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.search}</div>
}

function renderAccount360(nextOverview: AccountOverviewView = overview, initialEntry = '/accounts/acct-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Account360 account={account} overview={nextOverview} />
    </MemoryRouter>,
  )
}

describe('Account360 merged overview and health behavior', () => {
  beforeEach(() => {
    mockUser = {
      id: 'usr-1',
      name: 'Account Manager KAM',
      email: 'account.manager.user@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    }
    vi.clearAllMocks()
    vi.mocked(getAccountScore).mockResolvedValue(score(77) as never)
    vi.mocked(recalculateAccountScore).mockResolvedValue(score(79, { is_dirty: false, reason_codes: [] }) as never)
    useAccountStore.setState({ accounts: [account] })
  })

  it('renders Overview tab summary cards from overview.summaryCards', async () => {
    renderAccount360()

    expect(await screen.findByText('$987,654')).toBeInTheDocument()
    expect(screen.getByText('Renewal Focus')).toBeInTheDocument()
    expect(screen.getAllByText('77/100').length).toBeGreaterThan(0)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Jun 30, 2026')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('navigates summary card clicks through the existing tab search-param behavior', async () => {
    renderAccount360()

    await userEvent.click(await screen.findByRole('button', { name: 'Open opportunities: open Opportunities section' }))

    expect(screen.getByTestId('location')).toHaveTextContent('?tab=opportunities')
    expect(screen.getByText('Opportunity board')).toBeInTheDocument()
  })

  it('loads account-scoped score, shows dirty reasons, and recalculates from the Health tab', async () => {
    vi.mocked(getAccountScore).mockResolvedValue(score(63) as never)
    vi.mocked(recalculateAccountScore).mockResolvedValue(score(79, { is_dirty: false, reason_codes: [] }) as never)

    renderAccount360(overview, `/accounts/${account.id}?tab=health`)

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

    renderAccount360(overview, `/accounts/${account.id}?tab=health`)

    expect(await screen.findByText('Account score API failed')).toBeInTheDocument()
  })

  it('hides edit and create controls for read-only leadership viewers', async () => {
    mockUser = {
      id: 'usr-leader',
      name: 'Leadership Viewer',
      email: 'leader@tkxel.com',
      role: 'leadership_viewer',
      avatarInitials: 'LV',
    }
    const readOnlyOverview: AccountOverviewView = {
      ...overview,
      permissions: {
        ...overview.permissions,
        canUpdate: false,
        canAssign: false,
        canManageAttachments: false,
        readOnly: true,
      },
    }

    renderAccount360(readOnlyOverview)

    expect(await screen.findByText('$987,654')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate handover/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh ai data/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review data/i })).not.toBeInTheDocument()
    expect(screen.getByText('KYC read-only')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open opportunities: open Opportunities section' }))
    expect(screen.queryByRole('button', { name: /add opportunity/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Stage' }))
    expect(screen.queryByRole('button', { name: /apply stage review/i })).not.toBeInTheDocument()
  })
})
