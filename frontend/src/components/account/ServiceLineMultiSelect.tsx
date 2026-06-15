import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FieldError } from '@/components/form/FieldError'
import { cn } from '@/utils/cn'

interface ServiceLineMultiSelectProps {
  label: string
  selected: string[]
  options: string[]
  onChange: (selected: string[]) => void
  error?: string
  required?: boolean
  isLoading?: boolean
  catalogError?: string
  className?: string
}

export function ServiceLineMultiSelect({
  label,
  selected,
  options,
  onChange,
  error,
  required = false,
  isLoading = false,
  catalogError = '',
  className,
}: ServiceLineMultiSelectProps) {
  const [query, setQuery] = useState('')
  const normalizedSelected = useMemo(() => uniqueNames(selected), [selected])
  const mergedOptions = useMemo(() => uniqueNames([...normalizedSelected, ...options]), [normalizedSelected, options])
  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return mergedOptions
    return mergedOptions.filter(option => option.toLowerCase().includes(term))
  }, [mergedOptions, query])

  function toggle(option: string) {
    const exists = normalizedSelected.some(item => item.toLowerCase() === option.toLowerCase())
    const next = exists ? normalizedSelected.filter(item => item.toLowerCase() !== option.toLowerCase()) : [...normalizedSelected, option]
    onChange(next)
  }

  function remove(option: string) {
    onChange(normalizedSelected.filter(item => item.toLowerCase() !== option.toLowerCase()))
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={cn('tk-label', error && 'text-rag-red')}>
          {label} {required ? <span className="text-rag-red">*</span> : null}
        </span>
        <span className="text-[11px] font-semibold text-ink-secondary">{normalizedSelected.length} selected</span>
      </div>

      {normalizedSelected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {normalizedSelected.map(option => (
            <span key={option} className="inline-flex max-w-full items-center gap-1 rounded-full border border-surface-border bg-surface-secondary px-2 py-1 text-xs font-semibold text-ink">
              <span className="truncate">{option}</span>
              <button type="button" className="text-ink-secondary hover:text-rag-red" title={`Remove ${option}`} aria-label={`Remove ${option}`} onClick={() => remove(option)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={cn('rounded-lg border bg-white p-3', error ? 'border-rag-red' : 'border-surface-border')}>
        <label className="relative block">
          <span className="sr-only">Search service lines</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" />
          <input
            className="tk-input h-10 pl-9"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search services"
            aria-label="Search service lines"
          />
        </label>
        <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-surface-border bg-surface-secondary p-2">
          {isLoading ? <p className="px-2 py-3 text-sm text-ink-secondary">Loading service catalog...</p> : null}
          {!isLoading && catalogError ? <p className="px-2 py-3 text-sm text-rag-red">{catalogError}</p> : null}
          {!isLoading && !catalogError && !filteredOptions.length ? <p className="px-2 py-3 text-sm text-ink-secondary">No matching services.</p> : null}
          {!isLoading && !catalogError ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {filteredOptions.map(option => {
                const checked = normalizedSelected.some(item => item.toLowerCase() === option.toLowerCase())
                return (
                  <label key={option} className={cn('flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium', checked ? 'bg-blue-tint-20 text-brand-blue' : 'bg-white text-ink hover:bg-surface-tertiary')}>
                    <input type="checkbox" className="h-4 w-4 rounded border-surface-border text-brand-blue focus:ring-brand-blue/20" checked={checked} onChange={() => toggle(option)} />
                    <span className="min-w-0 flex-1">{option}</span>
                  </label>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
      <FieldError id={`${label.toLowerCase().replace(/\W+/g, '-')}-error`} message={error} />
    </div>
  )
}

function uniqueNames(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  values.forEach(value => {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    result.push(trimmed)
  })
  return result
}
