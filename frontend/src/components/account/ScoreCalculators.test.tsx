import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScoreCalculators } from '@/components/account/ScoreCalculators'
import type { Account } from '@/types/account'

vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({
    id: 'usr-am',
    name: 'Account Manager',
    email: 'am@tkxel.com',
    role: 'account_manager',
    avatarInitials: 'AM',
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}))

const account = {
  id: 'acc-health',
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

describe('ScoreCalculators', () => {
  it('collapses health calculator fields by default and opens them on demand', async () => {
    const user = userEvent.setup()
    render(<ScoreCalculators account={account} saving={false} onApply={vi.fn()} />)

    const relationshipToggle = screen.getByText('Relationship Health').closest('button')
    expect(relationshipToggle).not.toBeNull()

    expect(relationshipToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('CEO Engagement')).not.toBeInTheDocument()

    await user.click(relationshipToggle!)

    expect(relationshipToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('CEO Engagement')).toBeInTheDocument()
  })

  it('collapses service line mapping by default and opens it on demand', async () => {
    const user = userEvent.setup()
    render(<ScoreCalculators account={account} saving={false} onApply={vi.fn()} />)

    const serviceLineToggle = screen.getByRole('button', { name: /Service line mapping/i })

    expect(serviceLineToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Assessment & Strategy')).not.toBeInTheDocument()
    expect(screen.queryByText('Select all')).not.toBeInTheDocument()

    await user.click(serviceLineToggle)

    expect(serviceLineToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Assessment & Strategy')).toBeInTheDocument()
    expect(screen.getByText('Select all')).toBeInTheDocument()
  })

  it('reseeds calculator projection when persisted account health changes', async () => {
    const { rerender } = render(<ScoreCalculators account={account} saving={false} onApply={vi.fn()} />)
    const projection = screen.getByText('Projected health').parentElement
    expect(projection).not.toBeNull()
    const initialProjection = projection?.textContent

    rerender(
      <ScoreCalculators
        account={{ ...account, riskStatus: 'critical', health: { overall: 40, relationship: 40, usage: 40, delivery: 40, commercial: 40 } }}
        saving={false}
        onApply={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Projected health').parentElement?.textContent).not.toBe(initialProjection)
    })
  })
})
