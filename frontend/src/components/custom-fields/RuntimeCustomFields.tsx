import { FieldError } from '@/components/form/FieldError'
import { RuntimeCustomField } from '@/services/contentGovernance'
import { cn } from '@/utils/cn'

type CustomValues = Record<string, unknown>
type RuntimeCustomFieldValueDefinition = Pick<RuntimeCustomField, 'id' | 'field_key' | 'label' | 'field_type'>

export function RuntimeCustomFields({
  fields,
  values,
  errors,
  onChange,
}: {
  fields: RuntimeCustomField[]
  values: CustomValues
  errors: Record<string, string>
  onChange: (fieldKey: string, value: unknown) => void
}) {
  if (!fields.length) return null

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {fields.map(field => (
        <RuntimeCustomFieldInput
          key={field.id}
          field={field}
          value={values[field.field_key]}
          error={errors[field.field_key]}
          onChange={value => onChange(field.field_key, value)}
        />
      ))}
    </div>
  )
}

export function customValuesForSubmit(fields: RuntimeCustomField[], values: CustomValues) {
  return fields.reduce<CustomValues>((payload, field) => {
    const value = values[field.field_key]
    if (!isEmptyCustomValue(value)) payload[field.field_key] = value
    return payload
  }, {})
}

export function requiredCustomFieldErrors(fields: RuntimeCustomField[], values: CustomValues) {
  return fields.reduce<Record<string, string>>((errors, field) => {
    if (field.is_required && isEmptyCustomValue(values[field.field_key])) {
      errors[field.field_key] = `${field.label} is required.`
    }
    return errors
  }, {})
}

export function RuntimeCustomFieldValues({
  fields,
  values,
  title = 'Custom fields',
  variant = 'panel',
  className,
}: {
  fields: RuntimeCustomFieldValueDefinition[]
  values?: CustomValues | null
  title?: string
  variant?: 'panel' | 'badges' | 'definition-grid'
  className?: string
}) {
  const entries = fields
    .map(field => ({ field, value: values?.[field.field_key] }))
    .filter(entry => !isEmptyCustomValue(entry.value))

  if (!entries.length) return null

  if (variant === 'badges') {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        {entries.map(({ field, value }) => (
          <span key={field.id} className="rounded-full bg-surface-tertiary px-2 py-1 text-[11px] font-semibold text-ink-secondary">
            {field.label}: {formatCustomFieldValue(field, value)}
          </span>
        ))}
      </div>
    )
  }

  const content = (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(({ field, value }) => (
        <div key={field.id}>
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{field.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-ink">{formatCustomFieldValue(field, value)}</dd>
        </div>
      ))}
    </dl>
  )

  if (variant === 'definition-grid') {
    return <div className={className}>{content}</div>
  }

  return (
    <section className={cn('rounded-lg border border-surface-border bg-white p-4', className)}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3">{content}</div>
    </section>
  )
}

function RuntimeCustomFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: RuntimeCustomField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const id = `custom-${field.field_key}`
  const common = {
    id,
    'aria-invalid': Boolean(error),
  }
  const help = error || field.help_text

  if (field.field_type === 'textarea') {
    return (
      <label className="space-y-1 md:col-span-2">
        <span className="tk-label">{field.label}{field.is_required ? ' *' : ''}</span>
        <textarea className={fieldClass(error)} value={String(value ?? '')} onChange={event => onChange(event.target.value)} placeholder={field.placeholder ?? undefined} {...common} />
        <CustomMeta id={`${id}-error`} help={help} error={error} />
      </label>
    )
  }

  if (field.field_type === 'single_select') {
    return (
      <label className="space-y-1">
        <span className="tk-label">{field.label}{field.is_required ? ' *' : ''}</span>
        <select className={fieldClass(error)} value={String(value ?? '')} onChange={event => onChange(event.target.value)} {...common}>
          <option value="">Select</option>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <CustomMeta id={`${id}-error`} help={help} error={error} />
      </label>
    )
  }

  if (field.field_type === 'multi_select') {
    const selected = Array.isArray(value) ? value.map(String) : []
    return (
      <label className="space-y-1">
        <span className="tk-label">{field.label}{field.is_required ? ' *' : ''}</span>
        <select className={fieldClass(error)} value={selected} multiple onChange={event => onChange(Array.from(event.target.selectedOptions).map(option => option.value))} {...common}>
          {field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <CustomMeta id={`${id}-error`} help={help} error={error} />
      </label>
    )
  }

  if (field.field_type === 'boolean') {
    return (
      <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
        <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} />
        {field.label}{field.is_required ? ' *' : ''}
      </label>
    )
  }

  const inputType = field.field_type === 'number' || field.field_type === 'currency' ? 'number' : field.field_type === 'datetime' ? 'datetime-local' : ['email', 'url', 'date', 'phone'].includes(field.field_type) ? field.field_type : 'text'
  return (
    <label className="space-y-1">
      <span className="tk-label">{field.label}{field.is_required ? ' *' : ''}</span>
      <input
        type={inputType === 'phone' ? 'tel' : inputType}
        className={fieldClass(error)}
        value={String(value ?? '')}
        onChange={event => onChange(inputType === 'number' ? numberValue(event.target.value) : event.target.value)}
        placeholder={field.placeholder ?? undefined}
        {...common}
      />
      <CustomMeta id={`${id}-error`} help={help} error={error} />
    </label>
  )
}

function CustomMeta({ id, help, error }: { id: string; help?: string | null; error?: string }) {
  if (error) return <FieldError id={id} message={error} />
  if (!help) return null
  return <p className="text-xs text-ink-tertiary">{help}</p>
}

function fieldClass(error?: string) {
  return `tk-input ${error ? 'border-rag-red focus:border-rag-red focus:ring-rag-red/20' : ''}`
}

function numberValue(value: string) {
  return value === '' ? '' : Number(value)
}

function isEmptyCustomValue(value: unknown) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function formatCustomFieldValue(field: RuntimeCustomFieldValueDefinition, value: unknown) {
  if (field.field_type === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(item => String(item)).join(', ')
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}
