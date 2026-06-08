import { CKEditor } from '@ckeditor/ckeditor5-react'
import ClassicEditor from '@ckeditor/ckeditor5-build-classic'
import type { CSSProperties } from 'react'
import { cn } from '@/utils/cn'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  ariaLabel?: string
  editorHeight?: string
}

export function RichTextEditor({ value, onChange, disabled = false, placeholder, className, ariaLabel, editorHeight }: RichTextEditorProps) {
  return (
    <div
      className={cn(
        'rich-text-editor rounded-md border border-surface-border bg-white text-sm text-ink transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20',
        editorHeight && 'rich-text-editor--fixed',
        disabled && 'opacity-70',
        className,
      )}
      style={editorHeight ? ({ '--rich-text-editor-height': editorHeight } as CSSProperties) : undefined}
      aria-label={ariaLabel}
    >
      {editorHeight ? (
        <style>
          {`
            .rich-text-editor--fixed .ck.ck-editor,
            .rich-text-editor--fixed .ck.ck-editor__main {
              min-height: 0;
            }
            .rich-text-editor--fixed .ck.ck-editor__main > .ck-editor__editable {
              height: var(--rich-text-editor-height);
              max-height: var(--rich-text-editor-height);
              min-height: var(--rich-text-editor-height);
              overflow-y: auto;
              overscroll-behavior: contain;
            }
          `}
        </style>
      ) : null}
      <CKEditor
        editor={ClassicEditor as never}
        data={value}
        disabled={disabled}
        config={{
          placeholder,
          toolbar: ['heading', '|', 'bold', 'italic', 'bulletedList', 'numberedList', 'blockQuote', '|', 'undo', 'redo'],
        }}
        onChange={(_, editor) => onChange(editor.getData())}
      />
    </div>
  )
}
