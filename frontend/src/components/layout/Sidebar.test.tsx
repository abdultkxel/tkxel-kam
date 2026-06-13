import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '@/components/layout/Sidebar'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'usr-admin', name: 'KAM Super Admin', role: 'super_admin', email: 'admin@tkxel.com', avatarInitials: 'KS' },
    capabilities: {
      permission_keys: [],
      can_access_admin: true,
      can_view_portfolio: true,
      can_update_assigned_accounts: true,
      can_update_portfolio_accounts: true,
      can_assign_account_owners: true,
      can_approve_onboarding: true,
      can_view_sensitive_sources: true,
      can_manage_sensitive_sources: true,
      can_approve_kyc: true,
      can_moderate_timeline: true,
      can_export_reports: true,
      can_configure_playbooks: true,
      can_manage_tasks_portfolio: true,
    },
  }),
}))

describe('Sidebar', () => {
  it('uses a fixed desktop sidebar with a matching layout spacer', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )

    const sidebar = screen.getByRole('complementary')
    const spacer = sidebar.previousElementSibling

    expect(sidebar).toHaveClass('fixed', 'inset-y-0', 'left-0', 'w-64')
    expect(sidebar).not.toHaveClass('sticky')
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
    expect(spacer).toHaveClass('w-64')
  })
})
