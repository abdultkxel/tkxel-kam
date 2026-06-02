import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Account360 } from '@/components/account/Account360'
import type { AccountOverviewView } from '@/services/accountWorkspace'
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

vi.mock('@/components/account/HealthScoreRing', () => ({
  HealthScoreRing: ({ value }: { value: number }) => <div>Health ring {value}</div>,
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
  ScoreHistoryPanel: () => <div>Score history</div>,
}))

vi.mock('@/components/account/ScoreCalculators', () => ({
  ScoreCalculators: () => <button type="button">Save calculator scores</button>,
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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.search}</div>
}

function renderAccount360(nextOverview: AccountOverviewView = overview) {
  return render(
    <MemoryRouter initialEntries={['/accounts/acct-1']}>
      <LocationProbe />
      <Account360 account={account} overview={nextOverview} />
    </MemoryRouter>,
  )
}

describe('Account360 overview payload behavior', () => {
  beforeEach(() => {
    mockUser = {
      id: 'usr-1',
      name: 'Account Manager KAM',
      email: 'account.manager.user@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    }
  })

  it('renders Overview tab summary cards from overview.summaryCards', () => {
    renderAccount360()

    expect(screen.getByText('$987,654')).toBeInTheDocument()
    expect(screen.getByText('Renewal Focus')).toBeInTheDocument()
    expect(screen.getByText('77/100')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Jun 30, 2026')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('navigates summary card clicks through the existing tab search-param behavior', async () => {
    renderAccount360()

    await userEvent.click(screen.getByRole('button', { name: 'Open opportunities: open Opportunities section' }))

    expect(screen.getByTestId('location')).toHaveTextContent('?tab=opportunities')
    expect(screen.getByText('Opportunity board')).toBeInTheDocument()
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
