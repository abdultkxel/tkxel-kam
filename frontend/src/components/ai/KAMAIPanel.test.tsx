import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KAMAIPanel } from '@/components/ai/KAMAIPanel'
import { useAccountStore } from '@/stores/accountStore'
import { useAIStore } from '@/stores/aiStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'

const forecastMock = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'token-1',
    user: {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'am@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    },
  }),
}))

vi.mock('@/services/aiAssistance', async () => {
  const actual = await vi.importActual<typeof import('@/services/aiAssistance')>('@/services/aiAssistance')
  return {
    ...actual,
    runKamAiForecast: forecastMock,
    runKamAiSearch: vi.fn(),
  }
})

describe('KAMAIPanel forecast prompt', () => {
  beforeEach(() => {
    forecastMock.mockReset()
    forecastMock.mockResolvedValue({
      title: '6-Month Revenue Forecast',
      summary: 'Shared forecast summary',
      points: [
        {
          month: 'Jul 2026',
          baselineRevenue: 10000,
          weightedOpportunity: 2500,
          growthAdjustment: 500,
          riskAdjustment: 750,
          forecastRevenue: 12250,
          health: 72,
          openOpportunities: 1,
        },
        {
          month: 'Aug 2026',
          baselineRevenue: 10500,
          weightedOpportunity: 3000,
          growthAdjustment: 650,
          riskAdjustment: 700,
          forecastRevenue: 13450,
          health: 73,
          openOpportunities: 1,
        },
        {
          month: 'Sep 2026',
          baselineRevenue: 11000,
          weightedOpportunity: 3500,
          growthAdjustment: 800,
          riskAdjustment: 650,
          forecastRevenue: 14650,
          health: 74,
          openOpportunities: 1,
        },
        {
          month: 'Oct 2026',
          baselineRevenue: 11500,
          weightedOpportunity: 4000,
          growthAdjustment: 950,
          riskAdjustment: 600,
          forecastRevenue: 15850,
          health: 74,
          openOpportunities: 1,
        },
        {
          month: 'Nov 2026',
          baselineRevenue: 12000,
          weightedOpportunity: 4500,
          growthAdjustment: 1100,
          riskAdjustment: 550,
          forecastRevenue: 17050,
          health: 75,
          openOpportunities: 1,
        },
        {
          month: 'Dec 2026',
          baselineRevenue: 12500,
          weightedOpportunity: 5000,
          growthAdjustment: 1250,
          riskAdjustment: 500,
          forecastRevenue: 18250,
          health: 76,
          openOpportunities: 1,
        },
      ],
      months: 6,
      scope: 'portfolio',
      confidence: 'medium',
      trendLabel: 'positive',
      totals: {
        accountCount: 1,
        activeSowCount: 1,
        openOpportunities: 1,
        atRiskAccounts: 0,
        contractedBaseline: 60000,
        baselineRevenue: 60000,
        pipelineValue: 100000,
        weightedOpportunity: 35000,
        growthAdjustment: 17500,
        riskAdjustment: 4500,
        forecastRevenue: 108000,
      },
      waterfall: [],
      basis: [],
      assumptions: [],
      missingData: [],
      recommendedActions: [],
      highlights: ['Baseline exists.'],
      citations: [{ type: 'account', id: 'acc-1', label: 'Acme' }],
      disclaimer: 'Advisory only.',
      runId: 'run-1',
    })
    useUIStore.setState({ aiOpen: true, aiPrefill: '' })
    useAccountStore.setState({ accounts: [], accountsLoaded: true })
    useOpportunityStore.setState({ opportunities: [] })
    useTimelineStore.setState({ entries: [] })
    useAIStore.setState({ history: {}, queryRuns: {} })
  })

  it('calls backend forecast even when no accounts are loaded locally', async () => {
    render(
      <MemoryRouter>
        <KAMAIPanel />
      </MemoryRouter>,
    )

    expect(screen.getByText('0 accounts | 0 open and active opportunities | 0 timeline records')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Forecast next 6 months' }))

    await waitFor(() => expect(forecastMock).toHaveBeenCalledWith('token-1', { accountId: undefined, months: 6 }))
    expect((await screen.findAllByText('Shared forecast summary')).length).toBeGreaterThan(0)
    expect(screen.getByText('6-Month Revenue Forecast')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Six-month revenue forecast chart' })).toBeInTheDocument()
    expect(screen.getByText('Jul')).toBeInTheDocument()
    expect(screen.getByText('Dec')).toBeInTheDocument()
  })
})
