import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KAMAIPanel } from '@/components/ai/KAMAIPanel'
import { AISearchBar } from '@/components/ai/AISearchBar'
import { useUIStore } from '@/stores/uiStore'

const chatMocks = vi.hoisted(() => ({
  listKamAiChatSessions: vi.fn(),
  createKamAiChatSession: vi.fn(),
  getKamAiChatSession: vi.fn(),
  sendKamAiChatMessage: vi.fn(),
  updateKamAiChatSession: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'token-1',
    user: {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'am@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    },
  }),
}))

vi.mock('@/services/kamAiChat', () => chatMocks)

const emptySession = {
  id: 'session-1',
  user_id: 'usr-am',
  title: 'New KAM AI chat',
  account_id: null,
  account_name: null,
  scope_json: ['timeline', 'kyc', 'documents'],
  status: 'active',
  message_count: 0,
  last_message_preview: null,
  last_message_at: null,
  created_at: '2026-06-10T10:00:00.000Z',
  updated_at: '2026-06-10T10:00:00.000Z',
  archived_at: null,
  messages: [],
}

const answeredSession = {
  ...emptySession,
  title: 'Cafe Zupas risks',
  message_count: 2,
  last_message_preview: 'Cafe Zupas has one **source-backed delivery risk**.',
  last_message_at: '2026-06-10T10:01:00.000Z',
  messages: [
    {
      id: 'msg-user-1',
      session_id: 'session-1',
      role: 'user',
      content: 'Cafe Zupas risks',
      status: 'complete',
      token_usage_json: {},
      metadata_json: {},
      sources: [],
      created_at: '2026-06-10T10:01:00.000Z',
      completed_at: '2026-06-10T10:01:00.000Z',
    },
    {
      id: 'msg-assistant-1',
      session_id: 'session-1',
      role: 'assistant',
      content: 'Cafe Zupas has one **source-backed delivery risk**.',
      status: 'complete',
      intent: 'risk',
      confidence: 'medium',
      model_provider: 'deterministic_fallback',
      model_name: 'source-ranked',
      token_usage_json: {},
      metadata_json: {
        recommended_actions: ['Review delivery rollout plan.'],
        missing_evidence: [],
      },
      error_message: null,
      ai_gateway_run_id: 'run-1',
      sources: [
        {
          id: 'source-1',
          account_id: 'demo-project-cafe-zupas',
          account_name: 'Cafe Zupas',
          source_type: 'kyc',
          source_record_id: 'kyc-1',
          title: 'KYC snapshot v1',
          excerpt: 'Cafe Zupas demo account risk context.',
          source_route: '/accounts/demo-project-cafe-zupas?tab=kyc',
          relevance_score: 94,
          citation_index: 1,
          metadata_json: {},
        },
      ],
      created_at: '2026-06-10T10:01:00.000Z',
      completed_at: '2026-06-10T10:01:02.000Z',
    },
  ],
}

describe('KAM AI shared input', () => {
  beforeEach(() => {
    chatMocks.listKamAiChatSessions.mockReset()
    chatMocks.createKamAiChatSession.mockReset()
    chatMocks.getKamAiChatSession.mockReset()
    chatMocks.sendKamAiChatMessage.mockReset()
    chatMocks.updateKamAiChatSession.mockReset()
    chatMocks.listKamAiChatSessions.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50, pages: 0 })
    chatMocks.createKamAiChatSession.mockResolvedValue(emptySession)
    chatMocks.sendKamAiChatMessage.mockResolvedValue(answeredSession)
    useUIStore.setState({
      aiOpen: false,
      aiPrefill: '',
      activeAccountId: 'amd-001',
      mobileNavOpen: false,
      sidebarCollapsed: false,
      shortcutModalOpen: false,
      globalNoteOpen: false,
    })
  })

  it('opens KAM AI from the top search bar and keeps the composer in sync', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AISearchBar compact />
        <KAMAIPanel />
      </MemoryRouter>,
    )

    const topbarInput = screen.getByPlaceholderText(/Ask KAM AI across accounts/i)
    await user.type(topbarInput, 'Cafe Zupas risks')
    await user.click(screen.getByRole('button', { name: /KAM AI/i }))

    expect(useUIStore.getState().aiOpen).toBe(true)
    const composer = await screen.findByPlaceholderText(/Ask about risks/i)
    expect(composer).toHaveValue('Cafe Zupas risks')

    await user.clear(composer)
    await user.type(composer, 'Renewal risks')

    expect(topbarInput).toHaveValue('Renewal risks')
    expect(useUIStore.getState().aiPrefill).toBe('Renewal risks')
  })

  it('sends the shared KAM AI draft through the chat API and renders the answer with sources', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ aiOpen: true, aiPrefill: 'Cafe Zupas risks' })

    render(
      <MemoryRouter>
        <KAMAIPanel />
      </MemoryRouter>,
    )

    const composer = await screen.findByPlaceholderText(/Ask about risks/i)
    await user.click(screen.getByRole('button', { name: /Send KAM AI message/i }))

    await waitFor(() => {
      expect(chatMocks.sendKamAiChatMessage).toHaveBeenCalledWith(
        'token-1',
        'session-1',
        expect.objectContaining({
          content: 'Cafe Zupas risks',
          document_search: true,
        }),
      )
    })
    expect(composer).toHaveValue('')
    const boldText = await screen.findByText('source-backed delivery risk')
    expect(boldText.tagName.toLowerCase()).toBe('strong')
    expect(screen.getByText(/Sources \(1\)/i)).toBeInTheDocument()
  })
})
