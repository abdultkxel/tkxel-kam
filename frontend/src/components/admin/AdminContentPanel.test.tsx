import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminContentPanel } from '@/components/admin/AdminContentPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AdminContentPanel', () => {
  it('uploads file-backed content with runtime Field Builder values', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) {
        return jsonResponse([
          {
            id: 'field-1',
            module: 'client_education_content',
            field_key: 'client_segment_note',
            label: 'Client Segment Note',
            field_type: 'text',
            options: [],
            validation_rules: {},
            is_required: true,
            is_sensitive: false,
            is_active: true,
            show_in_list: false,
            show_in_detail: true,
            sort_order: 1,
          },
        ])
      }
      if (url.endsWith('/api/content/upload')) {
        const form = init?.body as FormData
        expect(form.get('custom_field_values')).toBe(JSON.stringify({ client_segment_note: 'Executive rollout' }))
        expect(form.get('file')).toBeInstanceOf(File)
        return jsonResponse({
          id: 'content-1',
          title: form.get('title'),
          content_type: 'Deck',
          category: 'Governance',
          tags: ['Governance'],
          service_lines: [],
          account_stages: ['Expansion Focus'],
          source_kind: 'file',
          is_active: true,
          popularity_count: 0,
          custom_field_values: { client_segment_note: 'Executive rollout' },
          created_at: '2026-05-31T00:00:00Z',
          updated_at: '2026-05-31T00:00:00Z',
        }, 201)
      }
      if (url.includes('/api/content')) return jsonResponse({ items: [], total: 0, page: 1, page_size: 6, pages: 0 })
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminContentPanel />)

    expect(await screen.findByText(/No content found/i)).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/Executive governance guide/i), 'Cafe Zupas deck')
    await userEvent.selectOptions(screen.getByDisplayValue('Guide'), 'Deck')
    await userEvent.selectOptions(screen.getByDisplayValue('URL'), 'file')
    await userEvent.upload(screen.getByLabelText(/^File$/i), new File(['deck'], 'deck.txt', { type: 'text/plain' }))
    await userEvent.type(await screen.findByLabelText(/Client Segment Note/i), 'Executive rollout')
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/content/upload'))).toBe(true))
    expect(await screen.findByText('Cafe Zupas deck')).toBeInTheDocument()
  })
})
