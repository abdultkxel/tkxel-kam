import { FieldError } from '@/components/form/FieldError'
import { RuntimeCustomField } from '@/services/contentGovernance'

type CustomValues = Record<string, unknown>

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
