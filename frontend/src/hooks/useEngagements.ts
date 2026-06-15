import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  archiveEngagement as archiveEngagementRequest,
  createEngagement as createEngagementRequest,
  createEngagementFromCharter as createEngagementFromCharterRequest,
  getEngagement as getEngagementRequest,
  getEngagementTimeline as getEngagementTimelineRequest,
  listEngagements as listEngagementsRequest,
  updateEngagement as updateEngagementRequest,
} from '@/services/accountWorkspace'
import type { EngagementCreatePayload, EngagementListParams, EngagementTimelineParams, EngagementUpdatePayload, Page } from '@/services/accountWorkspace'
import type { EngagementRecord } from '@/types/v3'
import type { TimelineEntry } from '@/types/timeline'

const ENGAGEMENT_CACHE_INVALIDATED = 'kam:engagement-cache-invalidated'

interface EngagementCacheScope {
  accountId?: string
  engagementId?: string
}

interface QueryState<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<T | null>
}

interface MutationState {
  isLoading: boolean
  error: Error | null
}

type EngagementQueryParams = URLSearchParams | EngagementListParams | EngagementTimelineParams | undefined

export function invalidateEngagementCache(scope: EngagementCacheScope = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<EngagementCacheScope>(ENGAGEMENT_CACHE_INVALIDATED, { detail: scope }))
}

export function useEngagements(accountId?: string, params?: URLSearchParams | EngagementListParams): QueryState<Page<EngagementRecord>> & { engagements: EngagementRecord[] } {
  const { token } = useAuth()
  const paramsKey = useMemo(() => paramsToKey(params), [params])
  const load = useCallback(() => {
    if (!token || !accountId) return Promise.resolve(null)
    return listEngagementsRequest(token, accountId, keyToSearchParams(paramsKey))
  }, [accountId, paramsKey, token])
  const query = useEngagementQuery(Boolean(token && accountId), { accountId }, load)
  return { ...query, engagements: query.data?.items ?? [] }
}

export function useEngagement(engagementId?: string): QueryState<EngagementRecord> {
  const { token } = useAuth()
  const load = useCallback(() => {
    if (!token || !engagementId) return Promise.resolve(null)
    return getEngagementRequest(token, engagementId)
  }, [engagementId, token])
  return useEngagementQuery(Boolean(token && engagementId), { engagementId }, load)
}

export function useEngagementTimeline(engagementId?: string, params?: URLSearchParams | EngagementTimelineParams): QueryState<Page<TimelineEntry>> & { events: TimelineEntry[] } {
  const { token } = useAuth()
  const paramsKey = useMemo(() => paramsToKey(params), [params])
  const load = useCallback(() => {
    if (!token || !engagementId) return Promise.resolve(null)
    return getEngagementTimelineRequest(token, engagementId, keyToSearchParams(paramsKey))
  }, [engagementId, paramsKey, token])
  const query = useEngagementQuery(Boolean(token && engagementId), { engagementId }, load)
  return { ...query, events: query.data?.items ?? [] }
}

export function useCreateEngagement(): MutationState & { createEngagement: (accountId: string, payload: EngagementCreatePayload) => Promise<EngagementRecord> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createEngagement = useCallback(
    async (accountId: string, payload: EngagementCreatePayload) => {
      if (!token) throw new Error('You must be logged in to create an engagement')
      setIsLoading(true)
      setError(null)
      try {
        const engagement = await createEngagementRequest(token, accountId, payload)
        invalidateEngagementCache({ accountId, engagementId: engagement.id })
        return engagement
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [token],
  )

  return { createEngagement, isLoading, error }
}

export function useCreateEngagementFromCharter(): MutationState & { createEngagementFromCharter: (accountId: string, file: File) => Promise<EngagementRecord> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createEngagementFromCharter = useCallback(
    async (accountId: string, file: File) => {
      if (!token) throw new Error('You must be logged in to import a project charter')
      setIsLoading(true)
      setError(null)
      try {
        const engagement = await createEngagementFromCharterRequest(token, accountId, file)
        invalidateEngagementCache({ accountId, engagementId: engagement.id })
        return engagement
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [token],
  )

  return { createEngagementFromCharter, isLoading, error }
}

export function useUpdateEngagement(): MutationState & { updateEngagement: (engagementId: string, payload: EngagementUpdatePayload) => Promise<EngagementRecord> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const updateEngagement = useCallback(
    async (engagementId: string, payload: EngagementUpdatePayload) => {
      if (!token) throw new Error('You must be logged in to update an engagement')
      setIsLoading(true)
      setError(null)
      try {
        const engagement = await updateEngagementRequest(token, engagementId, payload)
        invalidateEngagementCache({ accountId: engagement.accountId, engagementId: engagement.id })
        return engagement
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [token],
  )

  return { updateEngagement, isLoading, error }
}

export function useArchiveEngagement(): MutationState & { archiveEngagement: (engagementId: string, accountId?: string) => Promise<{ message: string }> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const archiveEngagement = useCallback(
    async (engagementId: string, accountId?: string) => {
      if (!token) throw new Error('You must be logged in to archive an engagement')
      setIsLoading(true)
      setError(null)
      try {
        const result = await archiveEngagementRequest(token, engagementId)
        invalidateEngagementCache({ accountId, engagementId })
        return result
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [token],
  )

  return { archiveEngagement, isLoading, error }
}

function useEngagementQuery<T>(enabled: boolean, scope: EngagementCacheScope, load: () => Promise<T | null>): QueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)

  const refetch = useCallback(async () => {
    if (!enabled) {
      setData(null)
      setIsLoading(false)
      return null
    }
    setIsLoading(true)
    setError(null)
    try {
      const result = await load()
      setData(result)
      return result
    } catch (err) {
      const nextError = toError(err)
      setError(nextError)
      throw nextError
    } finally {
      setIsLoading(false)
    }
  }, [enabled, load])

  useEffect(() => {
    let active = true
    if (!enabled) {
      setData(null)
      setIsLoading(false)
      return () => {
        active = false
      }
    }

    setIsLoading(true)
    setError(null)
    load()
      .then(result => {
        if (active) setData(result)
      })
      .catch(err => {
        if (active) setError(toError(err))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [enabled, load, refreshIndex])

  useEffect(() => {
    if (typeof window === 'undefined') return
    function handleInvalidation(event: Event) {
      const detail = (event as CustomEvent<EngagementCacheScope>).detail ?? {}
      if (matchesScope(detail, scope)) setRefreshIndex(current => current + 1)
    }
    window.addEventListener(ENGAGEMENT_CACHE_INVALIDATED, handleInvalidation)
    return () => window.removeEventListener(ENGAGEMENT_CACHE_INVALIDATED, handleInvalidation)
  }, [scope.accountId, scope.engagementId])

  return { data, isLoading, error, refetch }
}

function matchesScope(detail: EngagementCacheScope, scope: EngagementCacheScope) {
  if (scope.accountId && detail.accountId && scope.accountId !== detail.accountId) return false
  if (scope.engagementId && detail.engagementId && scope.engagementId !== detail.engagementId) return false
  return true
}

function paramsToKey(params: EngagementQueryParams) {
  if (!params) return ''
  if (params instanceof URLSearchParams) return params.toString()
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}

function keyToSearchParams(key: string) {
  return new URLSearchParams(key)
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error('Engagement request failed')
}
