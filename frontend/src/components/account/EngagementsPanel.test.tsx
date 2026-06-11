import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EngagementsPanel } from '@/components/account/EngagementsPanel'
import type { Account } from '@/types/account'
import type { EngagementRecord } from '@/types/v3'

const hookState = vi.hoisted(() => ({
  engagements: [] as EngagementRecord[],
}))

vi.mock('@/hooks/useEngagements', () => ({
  useEngagements: () => ({
    engagements: hookState.engagements,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useArchiveEngagement: () => ({
    archiveEngagement: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useCreateEngagement: () => ({
    createEngagement: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useCreateEngagementFromCharter: () => ({
    createEngagementFromCharter: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useUpdateEngagement: () => ({
    updateEngagement: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

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

const account = {
  id: 'acc-1',
  name: 'Fintua',
  segment: 'Enterprise',
  tags: ['Enterprise'],
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  ownerEmail: 'am@tkxel.com',
  stage: 'Expansion',
  riskStatus: 'warning',
  arr: 450000,
  nextQbr: '2026-06-30T00:00:00Z',
  health: { overall: 76, relationship: 78, usage: 75, delivery: 74, commercial: 77 },
  stakeholders: [],
  risks: [],
} satisfies Account

function urgentEngagement(): EngagementRecord {
  return {
    id: 'eng-1',
    accountId: account.id,
    accountName: account.name,
    name: 'Critical renewal',
    status: 'active',
    ownerId: 'usr-am',
    ownerName: 'Account Manager',
    opsLeadId: 'usr-ops',
    opsLeadName: 'Delivery Lead',
    serviceLines: ['Managed services'],
    value: 300000,
    contractValue: 300000,
    currency: 'USD',
    deliveryStatus: 'on_track',
    commercialStatus: 'stable',
    deliveryHealth: 80,
    healthScore: 80,
    healthStatus: 'amber',
    renewalRisk: 'high',
    renewalStatus: 'renewal_due',
    resourceDependency: 'none',
    commercialContext: 'Renewal decision due this month.',
    risks: [],
    sourceDocumentIds: [],
    sourceLinks: [],
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    renewalTerms: {
      startDate: '2025-07-01T00:00:00Z',
      endDate: '2026-06-30T00:00:00Z',
      renewalDate: '2026-06-30T00:00:00Z',
      noticeDeadline: '2026-06-15T00:00:00Z',
      noticePeriodDays: 15,
      autoRenewal: false,
      renewalStatus: 'renewal_due',
      daysToExpiry: 20,
    },
  }
}

function renderPanel() {
  render(
    <MemoryRouter>
      <EngagementsPanel account={account} />
    </MemoryRouter>,
  )
}

describe('EngagementsPanel', () => {
  it('uses a subtle full-row urgent renewal treatment instead of a side-tab border', () => {
    hookState.engagements = [urgentEngagement()]

    renderPanel()

    const urgentShell = screen.getByText('Critical renewal').closest('div')
    expect(urgentShell).toHaveClass('bg-brand-orange/10')
    expect(urgentShell).toHaveClass('ring-1')
    expect(urgentShell?.className).not.toContain(['border', 'l', '4'].join('-'))
  })
})
