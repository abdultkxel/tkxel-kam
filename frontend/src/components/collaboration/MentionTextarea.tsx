import { TextareaHTMLAttributes, useRef } from 'react'
import { cn } from '@/utils/cn'

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  inputRef?: (element: HTMLTextAreaElement | null) => void
}

export function MentionTextarea({ value, onChange, inputRef, className, onBlur, onKeyUp, ...props }: Props) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)

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
        }}
        onKeyUp={event => {
          onKeyUp?.(event)
        }}
        onBlur={event => {
          onBlur?.(event)
        }}
        className={cn('tk-input min-h-[120px] resize-y', className)}
      />
    </div>
  )
}
