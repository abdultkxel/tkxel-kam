import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StakeholderDetailPanel } from '@/components/account/StakeholderDetailPanel'
import { StakeholderFormDrawer } from '@/components/account/StakeholderFormDrawer'
import { StakeholderTab } from '@/components/account/StakeholderTab'
import type { Account } from '@/types/account'
import type { Stakeholder } from '@/types/stakeholder'

const mockRefetch = vi.hoisted(() => vi.fn(async () => null))
const mockCapabilities = vi.hoisted(() => ({
  permission_keys: ['stakeholders:update'],
  can_update_assigned_accounts: true,
  can_update_portfolio_accounts: false,
}))
const configuredRoleOptions = vi.hoisted(() => [
  { value: 'innovation_sponsor', label: 'Innovation Sponsor' },
  { value: 'technical_advisor', label: 'Technical Advisor' },
])

const stakeholder = vi.hoisted<Stakeholder>(() => ({
  id: 'stakeholder-1',
  accountId: 'account-1',
  engagementId: null,
  reportsToStakeholderId: null,
  name: 'Jane Sponsor',
  title: 'Chief Operating Officer',
  company: 'Acme Corp',
  email: 'jane@example.com',
  phone: null,
  linkedinUrl: 'https://www.linkedin.com/in/jane-sponsor',
  role: 'executive_sponsor',
  influence: 'high',
  relationshipStrength: 'strong',
  sentiment: 'positive',
  politicalRisk: 'high',
  status: 'active',
  notes: 'Executive sponsor for the account.',
  lastInteractionAt: '2026-06-01T10:00:00Z',
  isSensitive: false,
  sensitiveFieldsRedacted: false,
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-06-01T10:00:00Z',
}))

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ role: 'account_manager' }),
}))

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    capabilities: mockCapabilities,
    hasPermission: (permissionKey: string) => mockCapabilities.permission_keys.includes(permissionKey),
    hasAnyPermission: (permissionKeys: string[]) => permissionKeys.some(permissionKey => mockCapabilities.permission_keys.includes(permissionKey)),
  }),
}))

vi.mock('@/hooks/useEngagements', () => ({
  useEngagements: () => ({ engagements: [] }),
}))

vi.mock('@/hooks/useStakeholders', () => ({
  useStakeholders: () => ({
    stakeholders: [stakeholder],
    data: { items: [stakeholder], total: 1, page: 1, page_size: 100, pages: 1 },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useStakeholderCoverageGaps: () => ({
    coverageGaps: [],
    data: { items: [], total: 0, page: 1, page_size: 100, pages: 0 },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useStakeholderRoleOptions: () => ({
    roleOptions: configuredRoleOptions,
    data: configuredRoleOptions,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useRecalculateStakeholderCoverageGaps: () => ({
    recalculateStakeholderCoverageGaps: vi.fn(async () => undefined),
    isLoading: false,
  }),
  useArchiveStakeholder: () => ({
    archiveStakeholder: vi.fn(async () => undefined),
    isLoading: false,
  }),
  useCreateStakeholder: () => ({
    createStakeholder: vi.fn(async () => stakeholder),
    isLoading: false,
    error: null,
  }),
  useUpdateStakeholder: () => ({
    updateStakeholder: vi.fn(async () => stakeholder),
    isLoading: false,
    error: null,
  }),
  useStakeholderInteractions: () => ({
    interactions: [],
    data: { items: [], total: 0, page: 1, page_size: 100, pages: 0 },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useCreateStakeholderInteraction: () => ({
    createStakeholderInteraction: vi.fn(async () => undefined),
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/components/account/StakeholderOrgChart', () => ({
  StakeholderOrgChart: () => <section>Stakeholder hierarchy</section>,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const account = {
  id: 'account-1',
  name: 'Acme Corp',
  segment: 'Enterprise',
  tags: ['Enterprise'],
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  ownerEmail: 'am@tkxel.com',
  stage: 'Expansion',
  riskStatus: 'healthy',
  arr: 650000,
  health: { overall: 78, relationship: 80, usage: 74, delivery: 82, commercial: 76 },
  stakeholders: [],
  risks: [],
} as Account

describe('StakeholderTab political risk field', () => {
  it('does not render political risk in the stakeholder tab list or filters', () => {
    render(<StakeholderTab account={account} />)

    expect(screen.queryByText(/political risk/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Risk$/)).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /stakeholder/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /sentiment/i })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /political risk/i })).not.toBeInTheDocument()
  })

  it('does not render political risk in the stakeholder form drawer', () => {
    render(
      <StakeholderFormDrawer
        account={account}
        stakeholder={stakeholder}
        stakeholders={[stakeholder]}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.queryByText(/political risk/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/linkedin url/i)).toBeInTheDocument()
  })

  it('does not render political risk in the stakeholder detail drawer', () => {
    render(
      <StakeholderDetailPanel
        account={account}
        stakeholder={stakeholder}
        open
        canManage
        onOpenChange={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    expect(screen.queryByText(/political risk/i)).not.toBeInTheDocument()
    expect(screen.getByText('https://www.linkedin.com/in/jane-sponsor')).toBeInTheDocument()
  })

  it('uses configured stakeholder roles in account filters and the add drawer', () => {
    const { unmount } = render(<StakeholderTab account={account} />)

    expect(within(screen.getByLabelText(/^role$/i)).getByRole('option', { name: 'Innovation Sponsor' })).toBeInTheDocument()
    expect(within(screen.getByLabelText(/^role$/i)).getByRole('option', { name: 'Executive Sponsor' })).toBeInTheDocument()

    unmount()

    render(
      <StakeholderFormDrawer
        account={account}
        stakeholder={null}
        stakeholders={[stakeholder]}
        roleOptions={configuredRoleOptions}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/^role/i)).toHaveDisplayValue('Innovation Sponsor')
    expect(screen.getByRole('option', { name: 'Technical Advisor' })).toBeInTheDocument()
  })
})
