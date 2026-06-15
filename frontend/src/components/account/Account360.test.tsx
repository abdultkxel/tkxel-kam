import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account360, accountDetailTabs, resolveAccountDetailTab, resolveStageWorkspaceTab, scoreReadToAccountHealth } from '@/components/account/Account360'
import { getAlerts, updateAlertStatus, type AlertRecord } from '@/services/alerts'
import type { ScoreRead } from '@/services/scoringSignalsTasks'
import type { Account } from '@/types/account'

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

vi.mock('@/components/account/RelationshipsPlanningGrowthRetention', () => ({
  GrowthWhitespacePanel: ({ account }: { account: Account }) => <section>Growth section for {account.name}</section>,
  RetentionPlanPanel: ({ account }: { account: Account }) => <section>Retention section for {account.name}</section>,
}))

vi.mock('@/components/account/StakeholderTab', () => ({
  StakeholderTab: ({ account }: { account: Account }) => <section>Stakeholder section for {account.name}</section>,
}))

vi.mock('@/components/account/KYCAgentOverview', () => ({
  KYCAgentOverview: () => <section>KYC agent overview</section>,
}))

vi.mock('@/services/alerts', () => ({
  evaluateAlerts: vi.fn(),
  getAlerts: vi.fn(),
  updateAlertStatus: vi.fn(),
}))

const account: Account = {
  id: 'account-stage',
  name: 'Stage Customer',
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

const backendAlert: AlertRecord = {
  id: 'alert-1',
  rule_id: 'rule-low-health',
  rule_key: 'low_overall_health',
  alert_type: 'health_risk',
  title: 'Stage Customer is below the health floor',
  detail: 'Overall health is 52/100, below the configured threshold.',
  severity: 'high',
  status: 'open',
  owner_id: 'usr-am',
  owner_name: 'Account Manager',
  owner_email: 'am@tkxel.com',
  account_id: account.id,
  account_name: account.name,
  engagement_id: null,
  engagement_name: null,
  project_name: 'Stage Project',
  source_record_type: 'account',
  source_record_id: account.id,
  source_record_route: `/accounts/${account.id}?tab=overview&alert=alert-1`,
  source_evidence_json: [{ label: 'Overall health', value: 52 }],
  previous_value_json: null,
  new_value_json: { health_overall: 52 },
  recommended_action: 'Review score drivers and confirm owner follow-up.',
  deduplication_key: `low_overall_health:account:${account.id}`,
  first_triggered_at: '2026-06-13T00:00:00Z',
  last_triggered_at: '2026-06-13T00:00:00Z',
  snoozed_until: null,
  resolved_at: null,
  resolved_reason: null,
  created_at: '2026-06-13T00:00:00Z',
  updated_at: '2026-06-13T00:00:00Z',
  status_history: [],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAccount360(entry = '/accounts/account-stage', accountOverride: Account = account) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/accounts/:id" element={<Account360 account={accountOverride} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Account360 account detail tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAlerts).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25, pages: 0 })
    vi.mocked(updateAlertStatus).mockResolvedValue(backendAlert)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the approved account detail tab order with Stakeholders restored', () => {
    expect(accountDetailTabs).toEqual([
      'Overview',
      'Engagement',
      'Stakeholders',
      'KYC',
      'Health',
      'Stage',
      'Opportunities',
      'Governance',
      'Education',
      'Timeline',
      'Notes',
      'Documents',
    ])

    renderAccount360()

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(accountDetailTabs)
    expect(screen.queryByRole('tab', { name: 'Planning' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Growth' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Renewal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Retention' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Stakeholders' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Escalation' })).not.toBeInTheDocument()
  })

  it('does not show Timeline as an overview command center tile', () => {
    renderAccount360()

    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeInTheDocument()
    const commandCenter = screen.getByText('Account command center').closest('section')
    expect(commandCenter).not.toBeNull()
    expect(within(commandCenter as HTMLElement).getByText('ARR')).toBeInTheDocument()
    expect(within(commandCenter as HTMLElement).getByText('Open opportunities')).toBeInTheDocument()
    expect(within(commandCenter as HTMLElement).getByText('Next governance')).toBeInTheDocument()
    expect(within(commandCenter as HTMLElement).queryByText('Timeline')).not.toBeInTheDocument()
  })

  it('shows account Field Builder values on the overview', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/custom-fields') && url.includes('module=accounts')) {
        return jsonResponse([
          {
            id: 'field-1',
            module: 'accounts',
            field_key: 'customer_tier',
            label: 'Customer Tier',
            field_type: 'single_select',
            options: ['Gold', 'Silver'],
            validation_rules: {},
            is_required: false,
            is_sensitive: false,
            is_active: true,
            show_in_list: true,
            show_in_detail: true,
            sort_order: 1,
          },
        ])
      }
      return jsonResponse([])
    }))

    renderAccount360('/accounts/account-stage', { ...account, customFieldValues: { customer_tier: 'Gold' } })

    expect(await screen.findByText('Custom fields')).toBeInTheDocument()
    expect(screen.getByText('Customer Tier')).toBeInTheDocument()
    expect(screen.getByText('Gold')).toBeInTheDocument()
  })

  it('routes legacy growth, retention, renewal, and planning links into Stage', () => {
    expect(resolveAccountDetailTab('growth')).toBe('Stage')
    expect(resolveAccountDetailTab('retention')).toBe('Stage')
    expect(resolveAccountDetailTab('renewal')).toBe('Stage')
    expect(resolveAccountDetailTab('planning')).toBe('Stage')
    expect(resolveAccountDetailTab('engagements')).toBe('Engagement')
    expect(resolveAccountDetailTab('stakeholders')).toBe('Stakeholders')
    expect(resolveStageWorkspaceTab('growth')).toBe('Growth')
    expect(resolveStageWorkspaceTab('planning')).toBe('Growth')
    expect(resolveStageWorkspaceTab('retention')).toBe('Retention')
    expect(resolveStageWorkspaceTab('renewal')).toBe('Retention')
  })

  it('maps backend technical score drivers into current health dimensions', () => {
    const score = {
      overall: 61,
      drivers: [
        { key: 'relationship_score', label: 'Relationship Score', score: 55 },
        { key: 'service_line_score', label: 'Service Line Score', score: 64 },
        { key: 'resource_score', label: 'Resource Score', score: 42 },
        { key: 'contract_health_score', label: 'Contract Health Score', score: 70 },
        { key: 'account_risk_score', label: 'Account Risk Score', score: 50 },
      ],
    } as ScoreRead

    expect(scoreReadToAccountHealth(score, account.health)).toEqual({
      overall: 61,
      relationship: 55,
      usage: 64,
      delivery: 42,
      commercial: 60,
    })
  })

  it('shows Growth as a Stage workspace tab for old Growth links without the old stage control', () => {
    renderAccount360('/accounts/account-stage?tab=growth')

    expect(screen.getByRole('tab', { name: 'Stage' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Growth' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Retention' })).toHaveAttribute('data-state', 'inactive')
    expect(screen.queryByText('Stage control')).not.toBeInTheDocument()
    expect(screen.queryByText('Lifecycle path')).not.toBeInTheDocument()
    expect(screen.getByText('Growth section for Stage Customer')).toBeInTheDocument()
  })

  it('shows Retention as a Stage workspace tab for old Retention and Renewal links', () => {
    renderAccount360('/accounts/account-stage?tab=renewal')

    expect(screen.getByRole('tab', { name: 'Stage' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Growth' })).toHaveAttribute('data-state', 'inactive')
    expect(screen.getByRole('tab', { name: 'Retention' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Retention section for Stage Customer')).toBeInTheDocument()
  })

  it('opens notification-linked alert details and handles drawer status actions', async () => {
    vi.mocked(getAlerts).mockResolvedValue({ items: [backendAlert], total: 1, page: 1, page_size: 25, pages: 1 })

    renderAccount360('/accounts/account-stage?tab=overview&alert=alert-1')

    expect(await screen.findByRole('heading', { name: backendAlert.title })).toBeInTheDocument()
    expect(screen.getByText(backendAlert.recommended_action)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /acknowledge/i }))

    await waitFor(() => {
      expect(updateAlertStatus).toHaveBeenCalledWith('test-token', 'alert-1', expect.objectContaining({ status: 'acknowledged' }))
    })
  })
})
