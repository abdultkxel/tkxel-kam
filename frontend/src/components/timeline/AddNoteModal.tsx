import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import { format } from 'date-fns'
import { AlertCircle, Calendar, Check, ChevronDown, FileText, Loader2, Paperclip, Plus, Tag, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { MentionTextarea } from '@/components/collaboration/MentionTextarea'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { createTimelineNote, getTimelineEventTypes } from '@/services/timeline'
import { TimelineEntry, TimelineEventTypeConfig } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { extractMentionIds } from '@/utils/mentions'

interface FormValues {
  eventType: string
  title: string
  description: string
  attachmentUrl: string
}

interface Props {
  accountId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onAdded?: (entry: TimelineEntry) => void
}

const fixedManualEventTypes = new Set(['manual_note', 'governance_event', 'escalation_event', 'opportunity_event', 'client_education'])

export function AddNoteModal({ accountId, open: controlledOpen, onOpenChange, onAdded }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [backendError, setBackendError] = useState('')
  const [eventTypesError, setEventTypesError] = useState('')
  const [eventTypesLoading, setEventTypesLoading] = useState(false)
  const { token } = useAuth()
  const user = useRole()
  const accountName = useAccountStore(state => state.accounts.find(account => account.id === accountId)?.name ?? 'Account')
  const addNotification = useNotificationStore(state => state.addNotification)
  const [serverEventTypes, setServerEventTypes] = useState<TimelineEventTypeConfig[]>([])
  const eventTypes = useMemo(() => serverEventTypes.filter(item => item.active && fixedManualEventTypes.has(item.eventType)), [serverEventTypes])
  const open = controlledOpen ?? internalOpen
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      eventType: '',
      title: '',
      description: '',
      attachmentUrl: '',
    },
    shouldFocusError: true,
  })

  const selectedEventType = watch('eventType')
  const title = watch('title') ?? ''
  const description = watch('description') ?? ''
  const selectedConfig = useMemo(() => eventTypes.find(item => item.eventType === selectedEventType), [eventTypes, selectedEventType])
  const hasEventTypes = eventTypes.length > 0
  const titleField = register('title', {
    maxLength: { value: 220, message: 'Keep titles under 220 characters' },
  })
  const descriptionField = register('description', {
    required: 'Description is required',
    minLength: { value: 3, message: 'Use at least 3 characters' },
    maxLength: { value: 2000, message: 'Keep notes under 2000 characters' },
  })

  useEffect(() => {
    if (open) {
      reset()
      setSelectedDate(new Date())
      setBackendError('')
      setEventTypesError('')
      setServerEventTypes([])
      if (token) {
        setEventTypesLoading(true)
        getTimelineEventTypes(token, 'active')
          .then(result => setServerEventTypes(result.items))
          .catch(() => setEventTypesError('Timeline event types are unavailable. Refresh and try again.'))
          .finally(() => setEventTypesLoading(false))
      }
    }
  }, [open, reset, token])

  useEffect(() => {
    if (!open || !eventTypes.length) return
    if (!eventTypes.some(item => item.eventType === selectedEventType)) {
      setValue('eventType', eventTypes[0].eventType, { shouldValidate: true })
    }
  }, [eventTypes, open, selectedEventType, setValue])

  function setOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }

  async function onSubmit(values: FormValues) {
    if (!token) {
      setBackendError('You must be logged in to add a timeline event.')
      return
    }
    if (!selectedConfig) {
      setBackendError('Choose an active timeline event type before saving.')
      return
    }
    const mentions = extractMentionIds(values.description)
    setBackendError('')
    try {
      const entry = await createTimelineNote(token, accountId, {
        event_type: selectedConfig.eventType,
        title: values.title.trim() || selectedConfig.name,
        description: values.description,
        event_at: selectedDate.toISOString(),
        owner_id: user.id,
        tags: ['manual'],
        mentions,
        attachments: values.attachmentUrl ? [{ name: 'Attachment', url: values.attachmentUrl }] : [],
      })
      mentions.forEach(mentionedUserId => {
        addNotification({
          userId: mentionedUserId,
          trigger: 'timeline_mention',
          sentence: `${user.name} mentioned you in a timeline note`,
          accountId,
          accountName,
          contentPreview: 'You were mentioned in a timeline note. Open the account to view authorized details.',
          route: `/accounts/${accountId}`,
        })
      })
      toast.success('Timeline event added')
      onAdded?.(entry)
      setOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Timeline event could not be saved'
      setBackendError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined ? (
        <Dialog.Trigger asChild>
          <button className="tk-button-primary">
            <Plus className="h-4 w-4" />
            Add event
          </button>
        </Dialog.Trigger>
      ) : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-surface-border bg-white shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-tint-20 text-brand-blue">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Manual timeline event</p>
                <Dialog.Title className="font-display text-2xl font-bold text-ink">Add timeline event</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                  Log a dated account update for {accountName}.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4 p-5">
                {backendError ? (
                  <p className="rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm font-medium text-rag-red">
                    {backendError}
                  </p>
                ) : null}

                {(eventTypesError || (!eventTypesLoading && !hasEventTypes)) ? (
                  <div className="rounded-lg border border-dashed border-surface-border bg-surface-tertiary p-4">
                    <div className="flex gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-brand-blue">
                        <AlertCircle className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">Timeline event types unavailable</p>
                        <p className="mt-1 text-sm leading-5 text-ink-secondary">
                          {eventTypesError || 'Timeline event types are unavailable. Refresh and try again.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                  <label className="space-y-1">
                    <span className={cn('tk-label', errors.title ? 'text-rag-red' : '')}>Event title</span>
                    <input
                      name={titleField.name}
                      ref={titleField.ref}
                      onBlur={titleField.onBlur}
                      value={title}
                      onChange={titleField.onChange}
                      className={cn('tk-input', errors.title ? 'border-rag-red focus:ring-rag-red/30' : '')}
                      placeholder={selectedConfig?.name ?? 'Short summary'}
                      aria-invalid={Boolean(errors.title)}
                    />
                    {errors.title ? <p className="text-xs text-rag-red">{errors.title.message}</p> : null}
                  </label>

                  <div className="space-y-1">
                    <label className={cn('tk-label flex items-center gap-1', errors.eventType ? 'text-rag-red' : '')}>
                      Event type <span className="text-rag-amber">*</span>
                    </label>
                    <Select.Root value={watch('eventType')} onValueChange={value => setValue('eventType', value, { shouldValidate: true })} disabled={!hasEventTypes}>
                      <Select.Trigger aria-label="Event type" className={cn('tk-input flex items-center justify-between', errors.eventType ? 'border-rag-red focus:ring-rag-red/30' : '', !hasEventTypes ? 'cursor-not-allowed bg-surface-tertiary text-ink-tertiary' : '')}>
                        <Select.Value placeholder="Choose type" />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="z-[70] max-h-[320px] overflow-hidden rounded-md border border-surface-border bg-white shadow-panel">
                          <Select.Viewport className="p-1">
                            {eventTypes.map(item => (
                              <Select.Item key={item.id} value={item.eventType} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-tertiary">
                                <span className="h-2.5 w-2.5 rounded-full bg-brand-blue" />
                                <Select.ItemText>{item.name}</Select.ItemText>
                                <span className="ml-auto rounded-md bg-surface-tertiary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                                  {item.module}
                                </span>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className={cn('tk-label flex items-center gap-1', errors.description ? 'text-rag-red' : '')}>
                    Description <span className="text-rag-amber">*</span>
                  </label>
                  <MentionTextarea
                    name={descriptionField.name}
                    inputRef={descriptionField.ref}
                    onBlur={descriptionField.onBlur}
                    value={description}
                    onChange={value => setValue('description', value, { shouldValidate: true, shouldDirty: true })}
                    className={cn('min-h-[190px]', errors.description ? 'border-rag-red focus:ring-rag-red/30' : '')}
                    placeholder="Write the account update"
                    aria-invalid={Boolean(errors.description)}
                  />
                  <div className="flex items-center justify-between gap-3">
                    {errors.description ? <p className="text-xs text-rag-red">{errors.description.message}</p> : <span />}
                    <p className="text-xs text-ink-secondary">{description.length}/2000</p>
                  </div>
                </div>

                <label className="space-y-1">
                  <span className="tk-label flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-ink-secondary" />
                    Attachment URL
                  </span>
                  <input {...register('attachmentUrl')} className="tk-input" placeholder="https://..." />
                </label>

                <div className="rounded-lg border border-surface-border bg-surface-tertiary p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Tag className="h-4 w-4 text-brand-blue" />
                    Event details
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Type</dt>
                      <dd className="mt-1 font-medium text-ink">{selectedConfig?.name ?? 'Not configured'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Module</dt>
                      <dd className="mt-1 font-medium text-ink">{selectedConfig?.module ?? 'No active type'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Visibility</dt>
                      <dd className="mt-1 font-medium text-ink">{selectedConfig?.defaultVisibility ?? 'Public'}</dd>
                    </div>
                  </dl>
                </div>

              </div>

              <aside className="border-t border-surface-border bg-surface-tertiary p-5 lg:border-l lg:border-t-0">
                <div className="rounded-lg border border-surface-border bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                    <Calendar className="h-4 w-4 text-brand-blue" />
                    Event date
                  </div>
                  <div className="overflow-hidden">
                    <DayPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={date => date && setSelectedDate(date)}
                      className="m-0 max-w-full text-sm [--rdp-cell-size:34px]"
                    />
                  </div>
                  <p className="mt-3 rounded-md bg-surface-tertiary px-3 py-2 text-sm font-semibold text-ink">{format(selectedDate, 'MMM d, yyyy')}</p>
                </div>
              </aside>
            </div>

            <div className="flex justify-end gap-2 border-t border-surface-border bg-white p-4">
              <Dialog.Close type="button" className="tk-button-secondary" disabled={isSubmitting}>
                Cancel
              </Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={isSubmitting || !selectedConfig}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isSubmitting ? 'Saving...' : 'Save event'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
