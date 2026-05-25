import { FormEvent, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'

export function AISearchBar({ compact = false, accountId }: { compact?: boolean; accountId?: string }) {
  const [query, setQuery] = useState('')
  const openAI = useUIStore(state => state.openAI)

  function submit(event: FormEvent) {
    event.preventDefault()
    openAI(query || 'What changed in this account in the last 90 days?', accountId)
  }

  return (
    <form onSubmit={submit} className={cn('relative w-full', compact ? '' : 'tk-card p-2')}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Ask about account history, escalations, approvals, or content shared"
        className={cn('tk-input rounded-full pl-10 pr-36', compact ? 'bg-surface-secondary' : '')}
      />
      <button type="submit" className="absolute right-1 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center gap-1 rounded-full bg-brand-blue px-3 text-xs font-semibold text-white hover:bg-brand-blue-dark">
        <Sparkles className="h-3.5 w-3.5" />
        Try
      </button>
    </form>
  )
}
