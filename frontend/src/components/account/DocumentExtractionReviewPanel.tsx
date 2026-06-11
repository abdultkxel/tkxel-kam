import { FileText } from 'lucide-react'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { cn } from '@/utils/cn'

export interface DocumentReviewSource {
  id?: string
  name: string
  status?: string
  confidence?: number
  pages?: number
}

interface DocumentExtractionReviewPanelProps {
  title: string
  eyebrow?: string
  documentName?: string
  previewUrl?: string
  mimeType?: string
  extractedHtml: string
  onExtractedHtmlChange: (value: string) => void
  disabled?: boolean
  sources?: DocumentReviewSource[]
  selectedSourceId?: string
  onSelectSource?: (sourceId: string) => void
  previewError?: string
  className?: string
}

export function DocumentExtractionReviewPanel({
  title,
  eyebrow = 'Document intelligence',
  documentName,
  previewUrl,
  mimeType,
  extractedHtml,
  onExtractedHtmlChange,
  disabled = false,
  sources = [],
  selectedSourceId,
  onSelectSource,
  previewError,
  className,
}: DocumentExtractionReviewPanelProps) {
  const isPdf = Boolean(previewUrl && (mimeType?.includes('pdf') || documentName?.toLowerCase().endsWith('.pdf')))
  const isImage = Boolean(previewUrl && mimeType?.startsWith('image/'))

  return (
    <section className={cn('tk-card overflow-hidden', className)}>
      <header className="border-b border-surface-border bg-surface-secondary p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{eyebrow}</p>
        <h3 className="mt-1 text-base font-semibold text-ink">{title}</h3>
      </header>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="border-b border-surface-border bg-surface-secondary p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Document preview</p>
              <p className="mt-1 truncate text-sm font-semibold text-ink">{documentName || 'No document selected'}</p>
            </div>
            {sources.length > 1 && onSelectSource ? (
              <select className="tk-input w-full sm:w-64" value={selectedSourceId ?? ''} onChange={event => onSelectSource(event.target.value)}>
                {sources.map(source => <option key={source.id ?? source.name} value={source.id ?? source.name}>{source.name}</option>)}
              </select>
            ) : null}
          </div>
          <div className="h-[520px] overflow-hidden rounded-lg border border-surface-border bg-white">
            {isPdf && previewUrl ? (
              <iframe title={`${documentName || 'Source document'} preview`} src={previewUrl} className="h-[520px] w-full" />
            ) : isImage && previewUrl ? (
              <img src={previewUrl} alt={`${documentName || 'Source document'} preview`} className="h-[520px] w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <FileText className="h-10 w-10 text-brand-blue" />
                <p className="mt-3 max-w-sm text-sm font-semibold text-ink">
                  {previewError || (documentName ? 'Preview is available for PDF and image files. Use download for DOC/DOCX files.' : 'Select or upload a SOW/charter to preview it here.')}
                </p>
              </div>
            )}
          </div>
          {sources.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.slice(0, 4).map(source => (
                <span key={source.id ?? source.name} className="rounded-md bg-white px-2 py-1 text-xs font-medium text-ink-secondary ring-1 ring-surface-border">
                  {source.status ? source.status.replace(/_/g, ' ') : 'source'}
                  {typeof source.confidence === 'number' ? ` · ${source.confidence}%` : ''}
                  {typeof source.pages === 'number' ? ` · ${source.pages}p` : ''}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="bg-white p-4">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Extracted data review</p>
            <p className="mt-1 text-sm font-semibold text-ink">Reviewer notes and extracted fields</p>
          </div>
          <RichTextEditor
            value={extractedHtml}
            onChange={onExtractedHtmlChange}
            disabled={disabled}
            ariaLabel="Extracted document data"
            placeholder="Extracted account, engagement, renewal, citation, and KYC details will appear here."
            editorHeight="520px"
          />
        </div>
      </div>
    </section>
  )
}
