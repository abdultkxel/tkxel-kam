import * as Dialog from '@radix-ui/react-dialog'
import * as Select from '@radix-ui/react-select'
import * as Switch from '@radix-ui/react-switch'
import { format } from 'date-fns'
import { Calendar, Check, ChevronDown, Loader2, Lock, Paperclip, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { MentionTextarea } from '@/components/collaboration/MentionTextarea'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { TimelineEntry, SensitivityLevel, TimelineEventType } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { extractMentionIds } from '@/utils/mentions'

interface FormValues {
  eventType: TimelineEventType
  description: string
  attachmentUrl: string
  sensitive: boolean
  sensitivityLevel: SensitivityLevel
}

interface Props {
  accountId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onAdded?: (entry: TimelineEntry) => void
}

export function AddNoteModal({ accountId, open: controlledOpen, onOpenChange, onAdded }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const user = useRole()
  const accountName = useAccountStore(state => state.accounts.find(account => account.id === accountId)?.name ?? 'Account')
  const addNotification = useNotificationStore(state => state.addNotification)
  const allEventTypes = useTimelineStore(state => state.eventTypes)
  const eventTypes = useMemo(() => allEventTypes.filter(item => item.active), [allEventTypes])
  const open = controlledOpen ?? internalOpen
  const leadership = user.role === 'leadership' || user.role === 'admin'
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      eventType: 'manual_note',
      description: '',
      attachmentUrl: '',
      sensitive: false,
      sensitivityLevel: 'commercial',
    },
    shouldFocusError: true,
  })

  const selectedEventType = watch('eventType')
  const description = watch('description') ?? ''
  const sensitive = watch('sensitive')
  const selectedConfig = useMemo(() => eventTypes.find(item => item.eventType === selectedEventType), [eventTypes, selectedEventType])
  const descriptionField = register('description', {
    required: 'Description is required',
    minLength: { value: 3, message: 'Use at least 3 characters' },
    maxLength: { value: 2000, message: 'Keep notes under 2000 characters' },
  })

  useEffect(() => {
    if (open) {
      reset()
      setSelectedDate(new Date())
    }
  }, [open])

  function setOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next)
    else setInternalOpen(next)
  }

  async function onSubmit(values: FormValues) {
    await new Promise(resolve => window.setTimeout(resolve, 350))
    const mentions = extractMentionIds(values.description)
    const entry = emitTimelineEvent({
      accountId,
      eventType: values.eventType,
      module: selectedConfig?.module ?? 'manual',
      title: selectedConfig?.name ?? 'Manual note',
      description: values.description,
      performedBy: user.id,
      performedByName: user.name,
      timestamp: selectedDate.toISOString(),
      tags: ['manual'],
      mentions,
      attachments: values.attachmentUrl ? [{ name: 'Attachment', url: values.attachmentUrl }] : undefined,
      isSensitive: leadership ? values.sensitive : false,
      sensitivityLevel: leadership && values.sensitive ? values.sensitivityLevel : undefined,
      isSystemGenerated: false,
      isImmutable: false,
    })
    mentions.forEach(mentionedUserId => {
      addNotification({
        userId: mentionedUserId,
        trigger: 'timeline_mention',
        sentence: `${user.name} mentioned you in a timeline note`,
        accountId,
        accountName,
        contentPreview: values.description.replace(/@\{([^}]+)\}/g, '@mention').slice(0, 120),
        route: `/accounts/${accountId}`,
      })
    })
    toast.success('Timeline note added')
    onAdded?.(entry)
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined ? (
        <Dialog.Trigger asChild>
          <button className="tk-button-primary">Add note</button>
        </Dialog.Trigger>
      ) : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(96vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">FR-86 Manual Timeline Note</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Add timeline note</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Manual notes are logged as traceable timeline events.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className={cn('tk-label flex items-center gap-1', errors.eventType ? 'text-rag-red' : '')}>
                  Event type <span className="text-rag-amber">*</span>
                </label>
                <Select.Root value={watch('eventType')} onValueChange={value => setValue('eventType', value as TimelineEventType, { shouldValidate: true })}>
                  <Select.Trigger className={cn('tk-input flex items-center justify-between', errors.eventType ? 'border-rag-red focus:ring-rag-red/30' : '')}>
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDown className="h-4 w-4" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-[70] overflow-hidden rounded-md border border-surface-border bg-white shadow-panel">
                      <Select.Viewport className="p-1">
                        {eventTypes.map(item => (
                          <Select.Item key={item.id} value={item.eventType} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-tertiary">
                            <Select.ItemText>{item.name}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
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
                  className={cn('min-h-[150px]', errors.description ? 'border-rag-red focus:ring-rag-red/30' : '')}
                  placeholder="Write the note"
                />
                <div className="flex items-center justify-between gap-3">
                  {errors.description ? <p className="text-xs text-rag-red">{errors.description.message}</p> : <span />}
                  <p className="text-xs text-ink-secondary">{description.length}/2000</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="tk-label flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-ink-secondary" />
                  Attachment URL
                </label>
                <input {...register('attachmentUrl')} className="tk-input" placeholder="https://..." />
              </div>

              {leadership ? (
                <div className="rounded-lg border border-surface-border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-brand-blue-dark" />
                      <div>
                        <p className="text-sm font-semibold text-ink">Restrict visibility</p>
                        <p className="text-xs text-ink-secondary">Sensitive notes are filtered at the data layer.</p>
                      </div>
                    </div>
                    <Switch.Root
                      checked={sensitive}
                      onCheckedChange={value => setValue('sensitive', value)}
                      className="relative h-6 w-11 rounded-full bg-surface-border data-[state=checked]:bg-brand-blue"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
                    </Switch.Root>
                  </div>
                  {sensitive ? (
                    <select {...register('sensitivityLevel')} className="tk-input mt-3">
                      <option value="commercial">Commercial</option>
                      <option value="executive">Executive</option>
                      <option value="legal">Legal</option>
                      <option value="escalation">Escalation</option>
                    </select>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-surface-border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Calendar className="h-4 w-4 text-brand-blue" />
                  Date
                </div>
                <DayPicker mode="single" selected={selectedDate} onSelect={date => date && setSelectedDate(date)} />
                <p className="mt-2 text-xs font-semibold text-ink-secondary">{format(selectedDate, 'MMM d, yyyy')}</p>
              </div>

              <div className="flex justify-end gap-2">
                <Dialog.Close type="button" className="tk-button-secondary">
                  Cancel
                </Dialog.Close>
                <button type="submit" className="tk-button-primary" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {isSubmitting ? 'Saving...' : 'Save note'}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
