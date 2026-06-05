import { afterEach, describe, expect, it, vi } from 'vitest'
import { runKamAiForecast } from '@/services/aiAssistance'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ai assistance service forecast', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts account-scoped forecast requests and maps the shared response shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      title: '6-Month Revenue Forecast',
      summary: 'Forecast summary',
      points: [
        {
          month: 'Jul 2026',
          baseline_revenue: 10000,
          weighted_opportunity: 2500,
          growth_adjustment: 500,
          risk_adjustment: 750,
          forecast_revenue: 12250,
          commercial_value: 12250,
          health: 72,
          open_opportunities: 1,
        },
      ],
      months: 6,
      scope: 'account',
      forecast_type: 'monthly_revenue',
      confidence: 'high',
      trend_label: 'positive',
      totals: {
        account_count: 1,
        active_sow_count: 1,
        open_opportunities: 1,
        at_risk_accounts: 1,
        contracted_baseline: 60000,
        baseline_revenue: 60000,
        pipeline_value: 100000,
        weighted_opportunity: 35000,
        growth_adjustment: 17500,
        risk_adjustment: 4500,
        forecast_revenue: 108000,
      },
      waterfall: [{ label: 'Forecast revenue', value: 108000, kind: 'forecast' }],
      basis: ['Active SOWs/engagements provide the contracted baseline.'],
      assumptions: ['Month 1 starts on the first day of the next calendar month.'],
      missing_data: [],
      recommended_actions: ['Review opportunity target dates and stages.'],
      highlights: ['Baseline exists.'],
      citations: [{ type: 'account', id: 'acc-1', label: 'Acme' }],
      disclaimer: 'Advisory only.',
      run_id: 'run-1',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const forecast = await runKamAiForecast('token-1', { accountId: 'acc-1', months: 6 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/ai/forecast')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token-1' })
    expect(JSON.parse(String(init?.body))).toEqual({ account_id: 'acc-1', months: 6 })
    expect(forecast.points[0].forecastRevenue).toBe(12250)
    expect(forecast.totals.weightedOpportunity).toBe(35000)
    expect(forecast.confidence).toBe('high')
    expect(forecast.runId).toBe('run-1')
  })
})
