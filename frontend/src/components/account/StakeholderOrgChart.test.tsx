import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StakeholderOrgChart } from '@/components/account/StakeholderOrgChart'

const mockRefetch = vi.hoisted(() => vi.fn(async () => null))

vi.mock('@/hooks/useStakeholders', () => ({
  useStakeholderOrgChart: () => ({
    nodes: [
      {
        id: 'sponsor-1',
        name: 'Jane Sponsor',
        title: 'Chief Operating Officer',
        linkedinUrl: 'https://www.linkedin.com/in/jane-sponsor',
        role: 'executive_sponsor',
        influenceLevel: 'high',
        relationshipStrength: 'strong',
        sentiment: 'positive',
        parentId: null,
        sensitiveFieldsRedacted: false,
      },
      {
        id: 'private-1',
        name: 'Sensitive Stakeholder',
        title: null,
        linkedinUrl: null,
        role: 'economic_buyer',
        influenceLevel: 'medium',
        relationshipStrength: 'developing',
        sentiment: 'neutral',
        parentId: null,
        sensitiveFieldsRedacted: true,
      },
    ],
    edges: [],
    orgChart: null,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
}))

describe('StakeholderOrgChart', () => {
  it('shows LinkedIn links in the hierarchy when available', () => {
    render(<StakeholderOrgChart accountId="account-1" onSelectStakeholder={vi.fn()} />)

    const link = screen.getByRole('link', { name: /linkedin/i })
    expect(link).toHaveAttribute('href', 'https://www.linkedin.com/in/jane-sponsor')
    expect(screen.getByText('Sensitive Stakeholder')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /linkedin/i })).toHaveLength(1)
  })
})
