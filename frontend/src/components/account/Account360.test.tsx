import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Account360, accountDetailTabs, resolveAccountDetailTab, resolveStageWorkspaceTab } from '@/components/account/Account360'
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

function renderAccount360(entry = '/accounts/account-stage') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/accounts/:id" element={<Account360 account={account} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Account360 account detail tabs', () => {
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
})
