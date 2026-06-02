import { describe, expect, it, vi } from 'vitest'
import { ApiAccountOverview, getAccountOverview, mapAccountOverview } from '@/services/accountWorkspace'

const apiOverview: ApiAccountOverview = {
  account: {
    id: 'acct-1',
    name: 'Northwind Workspace',
    project_name: 'Customer intelligence modernization',
    company_url: 'https://northwind.example.com',
    segment: 'Enterprise',
    region: 'North America',
    lifecycle_status: 'Active',
    risk_status: 'warning',
    commercial_value: 1250000,
    currency: 'USD',
    health: {
      overall: 72,
      relationship: 76,
      usage: 68,
      delivery: 74,
      commercial: 70,
    },
    next_governance_at: '2026-06-30T10:00:00Z',
    updated_at: '2026-06-02T10:00:00Z',
    primary_owner: {
      id: 'owner-1',
      user_id: 'usr-1',
      user_name: 'Account Manager KAM',
      user_email: 'account.manager.user@tkxel.com',
      ownership_role: 'primary_am',
      is_primary: true,
      is_active: true,
    },
    owners: [
      {
        id: 'owner-1',
        user_id: 'usr-1',
        user_name: 'Account Manager KAM',
        user_email: 'account.manager.user@tkxel.com',
        ownership_role: 'primary_am',
        is_primary: true,
        is_active: true,
      },
    ],
    governance_completeness: {
      accountable_am: true,
      current_kyc: false,
      engagement_records: true,
      next_governance: true,
    },
  },
  summary_cards: {
    commercial_value: 1250000,
    currency: 'USD',
    lifecycle_status: 'Active',
    risk_status: 'warning',
    health_overall: 72,
    open_signals: 3,
    overdue_activities: 2,
    next_governance_at: '2026-06-30T10:00:00Z',
    open_opportunities: 4,
    active_escalations: 1,
  },
  permissions: {
    can_view: true,
    can_update: true,
    can_delete: false,
    can_approve: false,
    can_assign: true,
    can_manage_attachments: true,
    read_only: false,
  },
  engagements: {
    items: [
      {
        id: 'eng-1',
        account_id: 'acct-1',
        name: 'Customer intelligence modernization',
        description: 'Modernize customer success reporting.',
        status: 'active',
        owner_id: 'usr-1',
        owner_name: 'Account Manager KAM',
        ops_lead_id: 'usr-ops',
        ops_lead_name: 'Ops Lead',
        service_lines: ['Engineering', 'Customer Success'],
        source_document_ids: ['doc-1'],
        source_links: [{ title: 'SOW', url: 'https://northwind.example.com/sow' }],
        value: 250000,
        contract_value: 250000,
        currency: 'USD',
        delivery_status: 'active',
        commercial_status: 'healthy',
        delivery_health: 81,
        health_score: 81,
        health_status: 'green',
        renewal_risk: 'medium',
        start_date: '2026-01-01T00:00:00Z',
        end_date: '2026-12-31T00:00:00Z',
        renewal_date: '2026-11-30T00:00:00Z',
        notice_deadline: '2026-10-31T00:00:00Z',
        notice_period_days: 60,
        days_to_expiry: 212,
        renewal_status: 'not_due',
        auto_renewal: false,
        commercial_context: 'Annual SOW renewal.',
        resource_dependency: 'Data platform team.',
        resource_dependency_notes: 'Data platform team.',
        risks: ['Customer data access dependency'],
        source_citation: 'SOW p3 renewal section.',
        created_by_id: 'usr-1',
        updated_by_id: 'usr-1',
        created_by: 'Account Manager KAM',
        updated_by: 'Account Manager KAM',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-06-02T10:00:00Z',
        source_documents: [],
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    pages: 1,
  },
  attachments: {
    items: [
      {
        id: 'doc-1',
        account_id: 'acct-1',
        engagement_id: null,
        draft_id: null,
        title: 'Northwind SOW',
        source_type: 'sow',
        uploaded_by_name: 'Account Manager KAM',
        extraction_status: 'completed',
        confidence: 88,
        pages: 12,
        created_at: '2026-05-30T10:00:00Z',
        citations: [
          {
            id: 'cite-1',
            source_document_id: 'doc-1',
            label: 'SOW p3',
            page_number: 3,
            excerpt: 'Renewal terms and commercial value.',
          },
        ],
      },
    ],
    total: 1,
    page: 1,
    page_size: 10,
    pages: 1,
  },
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('account overview service mapping', () => {
  it('maps the unified overview payload into camelCase frontend fields', () => {
    const overview = mapAccountOverview(apiOverview)

    expect(overview.account.name).toBe('Northwind Workspace')
    expect(overview.account.ownerName).toBe('Account Manager KAM')
    expect(overview.summaryCards).toMatchObject({
      commercialValue: 1250000,
      lifecycleStatus: 'Active',
      healthOverall: 72,
      openSignals: 3,
      overdueActivities: 2,
      openOpportunities: 4,
      activeEscalations: 1,
    })
    expect(overview.summaryCards.nextGovernanceAt).toBe('2026-06-30T10:00:00Z')
    expect(overview.permissions).toMatchObject({
      canView: true,
      canUpdate: true,
      canManageAttachments: true,
      readOnly: false,
    })
    expect(overview.engagements.pageSize).toBe(10)
    expect(overview.engagements.items[0]).toMatchObject({
      accountName: 'Northwind Workspace',
      contractValue: 250000,
      sourceDocumentIds: ['doc-1'],
    })
    expect(overview.attachments.pageSize).toBe(10)
    expect(overview.attachments.items[0]).toMatchObject({
      accountId: 'acct-1',
      name: 'Northwind SOW',
      type: 'sow',
    })
    expect(overview.attachments.items[0].citations[0]).toMatchObject({
      documentId: 'doc-1',
      page: 3,
    })
  })

  it('loads account overview from the backend overview endpoint with bearer auth', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(apiOverview))
    vi.stubGlobal('fetch', fetchMock)

    const overview = await getAccountOverview('test-token', 'acct-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://127.0.0.1:8001/api/accounts/acct-1/overview')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-token' })
    expect(overview.summaryCards.commercialValue).toBe(1250000)
    expect(overview.permissions.canAssign).toBe(true)
  })
})
