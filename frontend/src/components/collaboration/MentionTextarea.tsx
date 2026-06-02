import { TextareaHTMLAttributes, useMemo, useRef, useState } from 'react'
import { users } from '@/data/mock'
import { cn } from '@/utils/cn'
import { insertMentionToken } from '@/utils/mentions'

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  inputRef?: (element: HTMLTextAreaElement | null) => void
}

function getMentionQuery(value: string, cursor: number) {
  const prefix = value.slice(0, cursor)
  const match = prefix.match(/@([\w.-]*)$/)
  return match ? match[1] : null
}

export function MentionTextarea({ value, onChange, inputRef, className, onBlur, onKeyUp, ...props }: Props) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const matches = useMemo(() => {
    if (query === null) return []
    const normalized = query.toLowerCase()
    return users.filter(user => user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized)).slice(0, 5)
  }, [query])

  function updateQuery(element: HTMLTextAreaElement) {
    setQuery(getMentionQuery(element.value, element.selectionStart))
  }

  function selectUser(userId: string) {
    const element = localRef.current
    if (!element || query === null) return
    const next = insertMentionToken(value, element.selectionStart, query, userId)
    onChange(next.value)
    setQuery(null)
    window.requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(next.cursor, next.cursor)
    })
  }

  return (
    <div className="relative">
      <textarea
        {...props}
        ref={element => {
          localRef.current = element
          inputRef?.(element)
        }}
        value={value}
        onChange={event => {
          onChange(event.target.value)
          updateQuery(event.target)
        }}
        onKeyUp={event => {
          updateQuery(event.currentTarget)
          onKeyUp?.(event)
        }}
        onBlur={event => {
          window.setTimeout(() => setQuery(null), 140)
          onBlur?.(event)
        }}
        className={cn('tk-input min-h-[120px] resize-y', className)}
      />
      {query !== null && matches.length ? (
        <div className="absolute left-2 right-2 top-full z-[80] mt-2 overflow-hidden rounded-lg border border-surface-border bg-white shadow-panel">
          {matches.map(user => (
            <button
              key={user.id}
              type="button"
              className="flex min-h-[44px] w-full items-center gap-3 px-3 text-left text-sm hover:bg-surface-tertiary"
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectUser(user.id)}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-tint-20 text-xs font-bold text-brand-blue">{user.avatarInitials}</span>
              <span>
                <span className="block font-semibold text-ink">{user.name}</span>
                <span className="block text-xs text-ink-secondary">{user.email}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
