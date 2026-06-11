import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Opportunities } from '@/pages/Opportunities'
import {
  listOpportunities,
  listOpportunityStages,
  listOpportunityTypes,
} from '@/services/opportunities'
import { useAccountStore } from '@/stores/accountStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import type { Account } from '@/types/account'
import type { Opportunity, OpportunityPipelineTotals, OpportunityStageDefinition, OpportunityTypeRecord } from '@/types/opportunity'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'am@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    },
  }),
}))

vi.mock('@/components/opportunities/OpportunityBoard', () => ({
  OpportunityBoard: () => <section>Pipeline board</section>,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/services/opportunities', () => ({
  addOpportunityActionItem: vi.fn(),
  addOpportunityDecision: vi.fn(),
  archiveOpportunity: vi.fn(),
  createOpportunity: vi.fn(),
  listOpportunities: vi.fn(),
  listOpportunityStages: vi.fn(),
  listOpportunityTypes: vi.fn(),
  moveOpportunityStage: vi.fn(),
  restoreOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  updateOpportunityActionItem: vi.fn(),
}))

const account: Account = {
  id: 'acct-1',
  name: 'Fintua',
  segment: 'Enterprise',
  tags: ['Enterprise'],
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  ownerEmail: 'am@tkxel.com',
  stage: 'Expansion',
  riskStatus: 'healthy',
  arr: 650000,
  nextQbr: '2026-06-30T00:00:00Z',
  health: { overall: 78, relationship: 80, usage: 74, delivery: 82, commercial: 76 },
  stakeholders: [],
  risks: [],
}

const opportunity: Opportunity = {
  id: 'opp-1',
  accountId: account.id,
  accountName: account.name,
  typeId: 'type-expansion',
  typeName: 'Expansion',
  typeSlug: 'expansion',
  serviceLine: 'Data Analytics',
  name: 'Fintua analytics expansion',
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  ownerEmail: 'am@tkxel.com',
  estimatedValue: 220000,
  value: 220000,
  currency: 'USD',
  closeDate: '2026-07-15T12:00:00Z',
  targetDate: '2026-07-15T12:00:00Z',
  stage: 'Qualified',
  nextStep: 'Confirm sponsor priority.',
  sourceContext: 'manual',
  stageHistory: [],
  decisions: [],
  actionItems: [],
}

const typeRecord: OpportunityTypeRecord = {
  id: 'type-expansion',
  slug: 'expansion',
  name: 'Expansion',
  description: null,
  isActive: true,
  displayOrder: 1,
  inUseCount: 1,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
}

const stages: OpportunityStageDefinition[] = ['Identified', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'].map((name, index) => ({
  id: `stage-${index}`,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  isTerminal: name === 'Won' || name === 'Lost',
  isActive: true,
  displayOrder: index + 1,
}))

const totals: OpportunityPipelineTotals = {
  openCount: 1,
  openValue: opportunity.estimatedValue,
  wonValue: 0,
  totalCount: 1,
  totalValue: opportunity.estimatedValue,
  averageValue: opportunity.estimatedValue,
  stageCounts: { Qualified: 1 },
  stageValues: { Qualified: opportunity.estimatedValue },
}

function opportunityPage(items: Opportunity[] = [opportunity]) {
  return { items, totals, total: items.length, page: 1, page_size: 500, pages: items.length ? 1 : 0 }
}

function typePage(items: OpportunityTypeRecord[] = [typeRecord]) {
  return { items, total: items.length, page: 1, page_size: 100, pages: items.length ? 1 : 0 }
}

function renderOpportunities(entry = '/opportunities') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/opportunities" element={<Opportunities />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Opportunities filters', () => {
  beforeEach(() => {
    vi.mocked(listOpportunities).mockResolvedValue(opportunityPage())
    vi.mocked(listOpportunityTypes).mockResolvedValue(typePage())
    vi.mocked(listOpportunityStages).mockResolvedValue(stages)
    useAccountStore.setState({ accounts: [account] })
    useOpportunityStore.setState({
      opportunities: [],
      types: [],
      stages: [],
      totals: {
        openCount: 0,
        openValue: 0,
        wonValue: 0,
        totalCount: 0,
        totalValue: 0,
        averageValue: 0,
        stageCounts: {},
        stageValues: {},
      },
      loading: false,
      error: '',
      loaded: false,
      total: 0,
      page: 1,
      pageSize: 25,
      pages: 0,
      movingIds: [],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders modern filter chips and sends selected query filters', async () => {
    renderOpportunities('/opportunities?stage=Qualified&openOnly=true&search=Fintua')

    expect(await screen.findByText('Pipeline board')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search account, opportunity, or next step')).toHaveValue('Fintua')
    expect(screen.getByRole('button', { name: 'Qualified' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Search: Fintua')).toBeInTheDocument()
    expect(screen.getByText('Stage: Qualified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Open only' })).toBeInTheDocument()

    await waitFor(() => {
      expect(listOpportunities).toHaveBeenLastCalledWith(
        'test-token',
        expect.objectContaining({
          search: 'Fintua',
          stage: 'Qualified',
          openOnly: true,
          pageSize: 500,
        }),
      )
    })
  })

  it('keeps advanced filters compact and exposes removable active chips', async () => {
    const user = userEvent.setup()
    renderOpportunities()

    expect(await screen.findByText('Pipeline board')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /filters/i }))
    await user.selectOptions(screen.getByLabelText('Account'), account.id)

    expect(await screen.findByText('Account: Fintua')).toBeInTheDocument()
    await waitFor(() => {
      expect(listOpportunities).toHaveBeenLastCalledWith(
        'test-token',
        expect.objectContaining({ accountId: account.id }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Remove Account: Fintua' }))

    await waitFor(() => {
      const lastCall = vi.mocked(listOpportunities).mock.calls.at(-1)
      expect(lastCall?.[1]?.accountId).toBe('')
    })
  })
})
