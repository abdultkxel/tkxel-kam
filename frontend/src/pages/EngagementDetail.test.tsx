import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { EngagementDetail } from '@/pages/EngagementDetail'
import type { EngagementRecord } from '@/types/v3'

const engagement: EngagementRecord = {
  id: 'eng-1',
  accountId: 'acc-1',
  accountName: 'Signal Account',
  name: 'Managed Delivery',
  status: 'active',
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  opsLeadId: '',
  opsLeadName: 'Unassigned',
  serviceLines: ['Development'],
  value: 100000,
  contractValue: 100000,
  currency: 'USD',
  deliveryStatus: 'active',
  commercialStatus: 'healthy',
  deliveryHealth: 80,
  healthScore: 80,
  healthStatus: 'green',
  renewalRisk: 'low',
  renewalStatus: 'not_due',
  resourceDependency: 'No dependency recorded.',
  resourceDependencyNotes: null,
  commercialContext: 'No commercial context recorded yet.',
  risks: [],
  sourceDocumentIds: [],
  sourceLinks: [],
  sourceCitation: null,
  renewalTerms: {
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T00:00:00Z',
    renewalDate: '2026-12-31T00:00:00Z',
    noticeDeadline: '2026-11-30T00:00:00Z',
    noticePeriodDays: 31,
    autoRenewal: false,
    daysToExpiry: 199,
    renewalStatus: 'not_due',
    riskStatus: 'healthy',
    confidence: 80,
    sourceDocumentId: '',
    sourceCitation: 'No source citation recorded.',
  },
}

vi.mock('@/hooks/useEngagements', () => ({
  useEngagement: () => ({
    data: engagement,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEngagementTimeline: () => ({
    events: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useArchiveEngagement: () => ({
    archiveEngagement: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useUpdateEngagement: () => ({
    updateEngagement: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useCreateEngagement: () => ({
    createEngagement: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/accounts/acc-1/engagements/eng-1']}>
      <Routes>
        <Route path="/accounts/:accountId/engagements/:engagementId" element={<EngagementDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EngagementDetail', () => {
  it('shows account name instead of account id in the profile tab', () => {
    renderDetail()

    expect(screen.getByText('Signal Account')).toBeInTheDocument()
    expect(screen.queryByText('acc-1')).not.toBeInTheDocument()
  })
})
