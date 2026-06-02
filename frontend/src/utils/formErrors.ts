import { ApiError } from '@/services/api'

export type FieldErrors = Record<string, string>
export type FieldAliases = Record<string, string>

export function apiFieldErrors(error: unknown, aliases: FieldAliases = {}): FieldErrors {
  if (!(error instanceof ApiError)) return {}

  return error.fieldErrors.reduce<FieldErrors>((fieldErrors, item) => {
    const field = aliases[item.field] ?? item.field
    if (!fieldErrors[field]) fieldErrors[field] = item.message
    return fieldErrors
  }, {})
}

export function clearFieldError(fieldErrors: FieldErrors, field: string): FieldErrors {
  if (!fieldErrors[field]) return fieldErrors

  const nextErrors = { ...fieldErrors }
  delete nextErrors[field]
  return nextErrors
}

export function hasFieldErrors(fieldErrors: FieldErrors): boolean {
  return Object.keys(fieldErrors).length > 0
}
