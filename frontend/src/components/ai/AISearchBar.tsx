import { FormEvent, useState } from 'react'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'

export function AISearchBar({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    navigate(trimmed ? `/accounts?q=${encodeURIComponent(trimmed)}` : '/accounts')
  }

  return (
    <form onSubmit={submit} className={cn('relative w-full', compact ? '' : 'tk-card p-2')}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={compact ? 'Search accounts, projects, tasks' : 'Search accounts, projects, tasks, notes'}
        className={cn('tk-input rounded-full pl-10', compact ? 'bg-surface-secondary pr-24' : 'pr-32')}
      />
      <button
        type="submit"
        className="absolute right-1 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center gap-1 rounded-full bg-brand-blue px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-blue-dark"
      >
        Search
      </button>
    </form>
  )
}
