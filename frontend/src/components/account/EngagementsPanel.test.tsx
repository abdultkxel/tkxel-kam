import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EngagementsPanel } from '@/components/account/EngagementsPanel'
import type { EngagementImportDraftRecord } from '@/services/accountWorkspace'
import type { Account } from '@/types/account'
import type { EngagementRecord } from '@/types/v3'

const hookState = vi.hoisted(() => ({
  engagements: [] as EngagementRecord[],
  drafts: [] as EngagementImportDraftRecord[],
}))

vi.mock('@/hooks/useEngagements', () => ({
  useEngagements: () => ({
    engagements: hookState.engagements,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEngagementImportDrafts: () => ({
    drafts: hookState.drafts,
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
  useUpdateEngagementImportDraft: () => ({
    updateEngagementImportDraft: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useApproveEngagementImportDraft: () => ({
    approveEngagementImportDraft: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useRejectEngagementImportDraft: () => ({
    rejectEngagementImportDraft: vi.fn(),
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

function importedDraft(): EngagementImportDraftRecord {
  return {
    id: 'draft-1',
    accountId: account.id,
    accountName: account.name,
    name: 'Imported charter program',
    description: 'Mapped from charter',
    status: 'draft',
    ownerId: 'usr-am',
    ownerName: 'Account Manager',
    opsLeadId: '',
    opsLeadName: 'Unassigned',
    serviceLines: ['Product Engineering'],
    value: 125000,
    contractValue: 125000,
    currency: 'USD',
    deliveryStatus: 'active',
    commercialStatus: 'watch',
    deliveryHealth: 78,
    healthScore: 78,
    healthStatus: 'unknown',
    renewalRisk: 'unknown',
    renewalStatus: 'not_due',
    resourceDependency: 'Platform access',
    commercialContext: 'Mapped commercial context',
    risks: ['POS integration'],
    sourceDocumentIds: ['doc-1'],
    sourceLinks: [],
    sourceCitation: 'charter.txt',
    createdById: 'usr-am',
    updatedById: 'usr-am',
    createdBy: 'Account Manager',
    updatedBy: 'Account Manager',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    renewalTerms: {
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-12-31T00:00:00Z',
      renewalDate: '2026-12-31T00:00:00Z',
      noticeDeadline: '2026-11-30T00:00:00Z',
      noticePeriodDays: 31,
      autoRenewal: false,
      commercialExposure: 125000,
      daysToExpiry: 200,
      renewalStatus: 'not_due',
      riskStatus: 'healthy',
      confidence: 78,
      sourceDocumentId: 'doc-1',
      sourceCitation: 'charter.txt',
    },
    draftStatus: 'ready_for_review',
    confidence: 78,
    missingFields: [],
    sourceDocuments: [
      {
        id: 'doc-1',
        accountId: account.id,
        name: 'charter',
        type: 'project_charter',
        uploadedAt: '2026-06-01T00:00:00Z',
        uploadedByName: 'Account Manager',
        confidence: 78,
        pages: 1,
        status: 'parsed',
        fileName: 'charter.txt',
        citations: [],
      },
    ],
    stakeholderDrafts: [{ name: 'Jane Sponsor', title: 'VP Digital', email: null }],
    createdByName: 'Account Manager',
    approvedEngagementId: null,
    rejectionReason: null,
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
    hookState.drafts = []

    renderPanel()

    const urgentShell = screen.getByText('Critical renewal').closest('div')
    expect(urgentShell).toHaveClass('bg-brand-orange/10')
    expect(urgentShell).toHaveClass('ring-1')
    expect(urgentShell?.className).not.toContain(['border', 'l', '4'].join('-'))
  })

  it('shows imported charter drafts with editable review actions', () => {
    hookState.engagements = []
    hookState.drafts = [importedDraft()]

    renderPanel()

    expect(screen.getByText('Imported charter drafts')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Imported charter program')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save draft changes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve draft/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject draft/i })).toBeInTheDocument()
  })
})
