const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'

export interface ApiFieldError {
  field: string
  message: string
}

export class ApiError extends Error {
  status: number
  details: unknown
  fieldErrors: ApiFieldError[]

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.fieldErrors = getApiFieldErrors(details)
  }
}

interface ApiRequestOptions extends RequestInit {
  token?: string | null
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { token, headers, body, ...requestOptions } = options
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message = getApiErrorMessage(payload)
    throw new ApiError(message, response.status, payload)
  }

  return payload as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getApiErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) return 'Request failed'
  if (typeof payload.detail === 'string') return payload.detail
  if (isRecord(payload.detail) && typeof payload.detail.message === 'string') return payload.detail.message
  if (typeof payload.message === 'string') return payload.message
  return 'Request failed'
}

function getApiFieldErrors(payload: unknown): ApiFieldError[] {
  if (!isRecord(payload)) return []
  const errors = Array.isArray(payload.errors) ? payload.errors : isRecord(payload.detail) && Array.isArray(payload.detail.errors) ? payload.detail.errors : []

  return errors.flatMap(error => {
    if (!isRecord(error) || typeof error.field !== 'string' || typeof error.message !== 'string') return []
    return [{ field: error.field, message: error.message }]
  })
}
