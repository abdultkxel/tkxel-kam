import { ArrowDown, ArrowUp, ArrowUpDown, Check } from 'lucide-react'
import { ReactNode, useMemo, useState } from 'react'
import { cn } from '@/utils/cn'

export type SortState = { column: string; direction: 'asc' | 'desc' }

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  className?: string
  render?: (item: T) => ReactNode
}

export function useSortableData<T>(items: T[], defaultSort: SortState) {
  const [sort, setSort] = useState<SortState>(defaultSort)
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sort.column]
        const bv = (b as Record<string, unknown>)[sort.column]
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
        return sort.direction === 'asc' ? cmp : -cmp
      }),
    [items, sort],
  )
  return { sorted, sort, setSort }
}

export function SortableTable<T extends { id: string }>({
  items,
  columns,
  defaultSort,
  sort: controlledSort,
  onSortChange,
  onRowClick,
  selection,
}: {
  items: T[]
  columns: Column<T>[]
  defaultSort: SortState
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  onRowClick?: (item: T) => void
  selection?: {
    selectedIds: string[]
    onToggle: (id: string) => void
    onToggleAll: (ids: string[]) => void
    getLabel?: (item: T) => string
  }
}) {
  const { sorted: locallySorted, sort: localSort, setSort } = useSortableData(items, defaultSort)
  const sort = controlledSort ?? localSort
  const sorted = controlledSort ? items : locallySorted

  function handleSort(column: Column<T>) {
    if (!column.sortable) return
    const nextSort = {
      column: column.key,
      direction: sort.column === column.key && sort.direction === 'asc' ? 'desc' : 'asc',
    } as SortState
    if (onSortChange) onSortChange(nextSort)
    else setSort(nextSort)
  }

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-surface-border bg-surface-tertiary">
            <tr>
              {selection ? (
                <th className="px-4 py-3">
                  <label className="relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md hover:bg-white">
                    <input
                      type="checkbox"
                      checked={sorted.length > 0 && sorted.every(item => selection.selectedIds.includes(item.id))}
                      onChange={() => selection.onToggleAll(sorted.map(item => item.id))}
                      className="peer sr-only"
                      aria-label="Select all rows"
                    />
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-sm border peer-focus-visible:ring-2 peer-focus-visible:ring-brand-blue/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface-tertiary', sorted.length > 0 && sorted.every(item => selection.selectedIds.includes(item.id)) ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border bg-white')}>
                      {sorted.length > 0 && sorted.every(item => selection.selectedIds.includes(item.id)) ? <Check className="h-3 w-3" /> : null}
                    </span>
                  </label>
                </th>
              ) : null}
              {columns.map(column => {
                const active = sort.column === column.key
                return (
                  <th key={column.key} className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary', column.className)}>
                    <button
                      className={cn('flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-md px-1 text-left transition-colors', column.sortable ? 'cursor-pointer hover:text-ink' : 'cursor-default')}
                      onClick={() => handleSort(column)}
                    >
                      {column.header}
                      {column.sortable ? (
                        active ? (
                          sort.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        )
                      ) : null}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map(item => {
              const rowLabel = selection?.getLabel?.(item) ?? item.id
              return (
                <tr
                  key={item.id}
                  className={cn('border-b border-surface-border transition-colors last:border-b-0', onRowClick ? 'cursor-pointer hover:bg-surface-tertiary' : '')}
                  onClick={() => onRowClick?.(item)}
                >
                  {selection ? (
                    <td className="px-4 py-3" onClick={event => event.stopPropagation()}>
                      <label className="relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md hover:bg-surface-secondary">
                        <input
                          type="checkbox"
                          checked={selection.selectedIds.includes(item.id)}
                          onChange={() => selection.onToggle(item.id)}
                          className="peer sr-only"
                          aria-label={`Select ${rowLabel}`}
                        />
                        <span className={cn('flex h-5 w-5 items-center justify-center rounded-sm border peer-focus-visible:ring-2 peer-focus-visible:ring-brand-blue/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white', selection.selectedIds.includes(item.id) ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border bg-white')}>
                          {selection.selectedIds.includes(item.id) ? <Check className="h-3 w-3" /> : null}
                        </span>
                      </label>
                    </td>
                  ) : null}
                  {columns.map(column => (
                    <td key={column.key} className={cn('px-4 py-3 text-sm text-ink', column.className)}>
                      {column.render ? column.render(item) : String((item as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
