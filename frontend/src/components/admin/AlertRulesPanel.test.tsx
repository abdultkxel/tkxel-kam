import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertRulesPanel } from '@/components/admin/AlertRulesPanel'
import { ApiError } from '@/services/api'
import { getAlertRules, previewAlertRule, updateAlertRule, type AlertRule } from '@/services/alerts'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('@/services/alerts', () => ({
  getAlertRules: vi.fn(),
  previewAlertRule: vi.fn(),
  updateAlertRule: vi.fn(),
}))

const lowHealthRule: AlertRule = {
  id: 'rule-low-health',
  rule_key: 'low_overall_health',
  name: 'Low overall health',
  description: 'Creates an alert when health is low.',
  alert_type: 'health_risk',
  source_type: 'account',
  threshold_value: 60,
  threshold_unit: 'score',
  severity: 'high',
  snooze_days: 7,
  recipient_policy: 'source_owner_first',
  escalation_enabled: true,
  is_active: true,
  sort_order: 10,
  created_at: '2026-06-13T00:00:00Z',
  updated_at: '2026-06-13T00:00:00Z',
}

describe('AlertRulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAlertRules).mockResolvedValue([lowHealthRule])
    vi.mocked(previewAlertRule).mockResolvedValue({
      rule_id: lowHealthRule.id,
      rule_key: lowHealthRule.rule_key,
      total_matches: 2,
      sample: [
        {
          account_id: 'account-1',
          account_name: 'Acme',
          source_record_type: 'account',
          source_record_id: 'account-1',
          title: 'Acme is below the health floor',
          detail: 'Overall health is below threshold.',
          severity: 'high',
          evidence: [],
        },
      ],
    })
    vi.mocked(updateAlertRule).mockResolvedValue({ ...lowHealthRule, threshold_value: 55 })
  })

  it('loads rules, previews matches, and saves backend changes', async () => {
    render(<AlertRulesPanel />)

    expect(await screen.findByText('Low overall health')).toBeInTheDocument()
    const thresholdInput = screen.getByDisplayValue('60')
    await userEvent.clear(thresholdInput)
    await userEvent.type(thresholdInput, '55')
    await userEvent.click(screen.getByRole('button', { name: /preview/i }))

    expect(await screen.findByText('2 preview matches')).toBeInTheDocument()
    expect(previewAlertRule).toHaveBeenCalledWith('test-token', lowHealthRule.id)

    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(updateAlertRule).toHaveBeenCalledWith('test-token', lowHealthRule.id, expect.objectContaining({ threshold_value: 55 })))
  })

  it('renders backend field errors beside the matching input', async () => {
    vi.mocked(updateAlertRule).mockRejectedValue(
      new ApiError('Validation failed', 422, {
        errors: [{ field: 'threshold_value', message: 'Threshold must be zero or greater.' }],
      }),
    )

    render(<AlertRulesPanel />)

    expect(await screen.findByText('Low overall health')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Threshold must be zero or greater.')).toBeInTheDocument()
  })
})
