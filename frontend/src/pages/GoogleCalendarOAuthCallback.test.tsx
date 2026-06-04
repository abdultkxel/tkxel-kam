import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GoogleCalendarOAuthCallback } from '@/pages/GoogleCalendarOAuthCallback'

describe('GoogleCalendarOAuthCallback', () => {
  it('shows the successful connection state and return action', () => {
    renderCallback('/admin/integrations/google-calendar/callback?status=success&message=Google+Calendar+connected+successfully.')

    expect(screen.getByRole('heading', { name: /connection complete/i })).toBeInTheDocument()
    expect(screen.getByText(/Google Calendar connected successfully/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /admin integrations/i })).toHaveAttribute('href', '/admin?section=integrations')
  })

  it('shows the failed connection state and retry action', () => {
    renderCallback('/admin/integrations/google-calendar/callback?status=error&message=Google+Calendar+OAuth+could+not+be+completed.')

    expect(screen.getByRole('heading', { name: /connection needs attention/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /retry connection/i })).toHaveAttribute('href', '/admin?section=integrations')
  })
})

function renderCallback(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/integrations/google-calendar/callback" element={<GoogleCalendarOAuthCallback />} />
      </Routes>
    </MemoryRouter>,
  )
}
