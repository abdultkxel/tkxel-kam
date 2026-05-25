import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, Loader2, Sparkles, X } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { runAISearch } from '@/services/aiSearch'
import { useAccountStore } from '@/stores/accountStore'
import { Message, useAIStore } from '@/stores/aiStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

const EMPTY_HISTORY: Message[] = []

export function KAMAIPanel() {
  const navigate = useNavigate()
  const open = useUIStore(state => state.aiOpen)
  const prefill = useUIStore(state => state.aiPrefill)
  const accountId = useUIStore(state => state.activeAccountId)
  const closeAI = useUIStore(state => state.closeAI)
  const [input, setInput] = useState(prefill)
  const [loading, setLoading] = useState(false)
  const user = useRole()
  const history = useAIStore(state => state.history[accountId] ?? EMPTY_HISTORY)
  const addMessage = useAIStore(state => state.addMessage)
  const accounts = useAccountStore(state => state.accounts)
  const opportunities = useOpportunityStore(state => state.opportunities)
  const timelineEntries = useTimelineStore(state => state.entries)

  useEffect(() => {
    setInput(prefill)
  }, [prefill])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    addMessage(accountId, { role: 'user', content: trimmed, timestamp: new Date().toISOString() })
    setLoading(true)
    const result = await runAISearch(
      {
        accountId,
        query: trimmed,
        scope: ['timeline', 'opportunities', 'escalations', 'governance', 'notes', 'kyc'],
        role: user.role,
        userId: user.id,
      },
      { timeline: timelineEntries, opportunities, accounts },
    )
    addMessage(accountId, {
      role: 'assistant',
      content: `${result.answer}\n\n${result.disclaimer ?? ''}`,
      timestamp: new Date().toISOString(),
    })
    setLoading(false)
    setInput('')
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => !value && closeAI()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content className="fixed bottom-4 right-4 z-50 flex h-[min(720px,calc(100vh-2rem))] w-[min(440px,calc(100vw-2rem))] flex-col rounded-2xl border border-surface-border bg-white shadow-ai">
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KAM AI</p>
              <Dialog.Title className="text-base font-semibold text-ink">Timeline and account assistant</Dialog.Title>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close AI panel">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {history.length === 0 ? (
              <div className="rounded-xl border border-surface-border bg-surface-tertiary p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Sparkles className="h-4 w-4 text-brand-blue" />
                  Ask about this account
                </div>
                {['Summarise this account', 'What changed in this account in the last 90 days?', 'Show the escalation history', 'Who approved the stage override?'].map(chip => (
                  <button
                    key={chip}
                    onClick={() => setInput(chip)}
                    className="mb-2 mr-2 rounded-full border border-surface-border bg-white px-3 py-2 text-xs text-ink-secondary transition-colors hover:bg-surface-tertiary"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}

            {history.map((message, index) => (
              <div key={`${message.timestamp}-${index}`} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[82%] rounded-2xl px-4 py-3 text-sm', message.role === 'user' ? 'bg-brand-blue text-white' : 'border border-surface-border bg-surface-tertiary text-ink')}>
                  {message.content}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={submit} className="border-t border-surface-border p-4">
            <div className="flex gap-2">
              <input value={input} onChange={event => setInput(event.target.value)} className="tk-input rounded-full" placeholder="Ask a question" />
              <button type="submit" disabled={loading} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-brand-blue text-white hover:bg-brand-blue-dark disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
            <button type="button" onClick={() => navigate('/accounts')} className="mt-3 text-xs font-semibold text-brand-blue hover:text-brand-blue-dark">
              Browse accounts
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
