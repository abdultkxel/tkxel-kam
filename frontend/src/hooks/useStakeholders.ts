import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { invalidateEngagementCache } from '@/hooks/useEngagements'
import {
  archiveStakeholder as archiveStakeholderRequest,
  createStakeholder as createStakeholderRequest,
  createStakeholderInteraction as createStakeholderInteractionRequest,
  getStakeholderOrgChart as getStakeholderOrgChartRequest,
  listStakeholderCoverageGaps as listStakeholderCoverageGapsRequest,
  listStakeholderInteractions as listStakeholderInteractionsRequest,
  listStakeholders as listStakeholdersRequest,
  recalculateStakeholderCoverageGaps as recalculateStakeholderCoverageGapsRequest,
  updateStakeholder as updateStakeholderRequest,
} from '@/services/stakeholders'
import type {
  Stakeholder,
  StakeholderCoverageGap,
  StakeholderCreatePayload,
  StakeholderFilters,
  StakeholderInteraction,
  StakeholderInteractionCreatePayload,
  StakeholderInteractionPage,
  StakeholderOrgChart,
  StakeholderPage,
  StakeholderUpdatePayload,
} from '@/types/stakeholder'

const STAKEHOLDER_CACHE_INVALIDATED = 'kam:stakeholder-cache-invalidated'

type StakeholderCacheResource = 'stakeholders' | 'stakeholderInteractions' | 'coverageGaps' | 'orgChart' | 'accountTimeline' | 'all'

interface StakeholderCacheScope {
  accountId?: string
  stakeholderId?: string
  resources?: StakeholderCacheResource[]
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

export function invalidateStakeholderCache(scope: StakeholderCacheScope = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<StakeholderCacheScope>(STAKEHOLDER_CACHE_INVALIDATED, { detail: scope }))
}

export function useStakeholders(accountId?: string, filters: StakeholderFilters | URLSearchParams = {}): QueryState<StakeholderPage> & { stakeholders: Stakeholder[] } {
  const { token } = useAuth()
  const filtersKey = useMemo(() => paramsToKey(filters), [filters])
  const load = useCallback(() => {
    if (!token || !accountId) return Promise.resolve(null)
    return listStakeholdersRequest(token, accountId, keyToSearchParams(filtersKey))
  }, [accountId, filtersKey, token])
  const query = useStakeholderQuery(Boolean(token && accountId), { accountId, resources: ['stakeholders'] }, load)
  return { ...query, stakeholders: query.data?.items ?? [] }
}

export function useCreateStakeholder(accountId?: string): MutationState & { createStakeholder: (payload: StakeholderCreatePayload, overrideAccountId?: string) => Promise<Stakeholder> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createStakeholder = useCallback(
    async (payload: StakeholderCreatePayload, overrideAccountId?: string) => {
      const targetAccountId = overrideAccountId ?? accountId
      if (!token) throw new Error('You must be logged in to create a stakeholder')
      if (!targetAccountId) throw new Error('Account is required to create a stakeholder')
      setIsLoading(true)
      setError(null)
      try {
        const stakeholder = await createStakeholderRequest(token, targetAccountId, payload)
        invalidateStakeholderAccount({ accountId: stakeholder.accountId, engagementId: stakeholder.engagementId ?? undefined, stakeholderId: stakeholder.id })
        return stakeholder
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [accountId, token],
  )

  return { createStakeholder, isLoading, error }
}

export function useUpdateStakeholder(): MutationState & { updateStakeholder: (stakeholderId: string, payload: StakeholderUpdatePayload) => Promise<Stakeholder> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const updateStakeholder = useCallback(
    async (stakeholderId: string, payload: StakeholderUpdatePayload) => {
      if (!token) throw new Error('You must be logged in to update a stakeholder')
      setIsLoading(true)
      setError(null)
      try {
        const stakeholder = await updateStakeholderRequest(token, stakeholderId, payload)
        invalidateStakeholderAccount({ accountId: stakeholder.accountId, engagementId: stakeholder.engagementId ?? undefined, stakeholderId: stakeholder.id })
        return stakeholder
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

  return { updateStakeholder, isLoading, error }
}

export function useArchiveStakeholder(): MutationState & { archiveStakeholder: (stakeholderId: string, accountId?: string, engagementId?: string) => Promise<{ message: string }> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const archiveStakeholder = useCallback(
    async (stakeholderId: string, accountId?: string, engagementId?: string) => {
      if (!token) throw new Error('You must be logged in to archive a stakeholder')
      setIsLoading(true)
      setError(null)
      try {
        const result = await archiveStakeholderRequest(token, stakeholderId)
        invalidateStakeholderAccount({ accountId, engagementId, stakeholderId })
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

  return { archiveStakeholder, isLoading, error }
}

export function useStakeholderInteractions(stakeholderId?: string): QueryState<StakeholderInteractionPage> & { interactions: StakeholderInteraction[] } {
  const { token } = useAuth()
  const load = useCallback(() => {
    if (!token || !stakeholderId) return Promise.resolve(null)
    return listStakeholderInteractionsRequest(token, stakeholderId)
  }, [stakeholderId, token])
  const query = useStakeholderQuery(Boolean(token && stakeholderId), { stakeholderId, resources: ['stakeholderInteractions'] }, load)
  return { ...query, interactions: query.data?.items ?? [] }
}

export function useCreateStakeholderInteraction(stakeholderId?: string): MutationState & { createStakeholderInteraction: (payload: StakeholderInteractionCreatePayload, overrideStakeholderId?: string) => Promise<StakeholderInteraction> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createStakeholderInteraction = useCallback(
    async (payload: StakeholderInteractionCreatePayload, overrideStakeholderId?: string) => {
      const targetStakeholderId = overrideStakeholderId ?? stakeholderId
      if (!token) throw new Error('You must be logged in to create a stakeholder interaction')
      if (!targetStakeholderId) throw new Error('Stakeholder is required to create an interaction')
      setIsLoading(true)
      setError(null)
      try {
        const interaction = await createStakeholderInteractionRequest(token, targetStakeholderId, payload)
        invalidateStakeholderAccount({
          accountId: interaction.accountId,
          engagementId: interaction.engagementId ?? undefined,
          stakeholderId: interaction.stakeholderId,
          extraResources: ['stakeholderInteractions'],
        })
        return interaction
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [stakeholderId, token],
  )

  return { createStakeholderInteraction, isLoading, error }
}

export function useStakeholderCoverageGaps(accountId?: string): QueryState<StakeholderCoverageGap[]> & { coverageGaps: StakeholderCoverageGap[] } {
  const { token } = useAuth()
  const load = useCallback(() => {
    if (!token || !accountId) return Promise.resolve(null)
    return listStakeholderCoverageGapsRequest(token, accountId)
  }, [accountId, token])
  const query = useStakeholderQuery(Boolean(token && accountId), { accountId, resources: ['coverageGaps'] }, load)
  return { ...query, coverageGaps: query.data ?? [] }
}

export function useRecalculateStakeholderCoverageGaps(accountId?: string): MutationState & { recalculateStakeholderCoverageGaps: (overrideAccountId?: string) => Promise<StakeholderCoverageGap[]> } {
  const { token } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const recalculateStakeholderCoverageGaps = useCallback(
    async (overrideAccountId?: string) => {
      const targetAccountId = overrideAccountId ?? accountId
      if (!token) throw new Error('You must be logged in to recalculate stakeholder coverage gaps')
      if (!targetAccountId) throw new Error('Account is required to recalculate stakeholder coverage gaps')
      setIsLoading(true)
      setError(null)
      try {
        const gaps = await recalculateStakeholderCoverageGapsRequest(token, targetAccountId)
        invalidateStakeholderAccount({ accountId: targetAccountId })
        return gaps
      } catch (err) {
        const nextError = toError(err)
        setError(nextError)
        throw nextError
      } finally {
        setIsLoading(false)
      }
    },
    [accountId, token],
  )

  return { recalculateStakeholderCoverageGaps, isLoading, error }
}

export function useStakeholderOrgChart(accountId?: string): QueryState<StakeholderOrgChart> & { orgChart: StakeholderOrgChart | null; nodes: StakeholderOrgChart['nodes']; edges: StakeholderOrgChart['edges'] } {
  const { token } = useAuth()
  const load = useCallback(() => {
    if (!token || !accountId) return Promise.resolve(null)
    return getStakeholderOrgChartRequest(token, accountId)
  }, [accountId, token])
  const query = useStakeholderQuery(Boolean(token && accountId), { accountId, resources: ['orgChart'] }, load)
  return { ...query, orgChart: query.data, nodes: query.data?.nodes ?? [], edges: query.data?.edges ?? [] }
}

function invalidateStakeholderAccount({
  accountId,
  engagementId,
  stakeholderId,
  extraResources = [],
}: {
  accountId?: string
  engagementId?: string
  stakeholderId?: string
  extraResources?: StakeholderCacheResource[]
}) {
  invalidateStakeholderCache({
    accountId,
    stakeholderId,
    resources: uniqueResources(['stakeholders', 'coverageGaps', 'orgChart', 'accountTimeline', ...extraResources]),
  })
  if (engagementId) invalidateEngagementCache({ accountId, engagementId })
}

function useStakeholderQuery<T>(enabled: boolean, scope: StakeholderCacheScope, load: () => Promise<T | null>): QueryState<T> {
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
      const detail = (event as CustomEvent<StakeholderCacheScope>).detail ?? {}
      if (matchesScope(detail, scope)) setRefreshIndex(current => current + 1)
    }
    window.addEventListener(STAKEHOLDER_CACHE_INVALIDATED, handleInvalidation)
    return () => window.removeEventListener(STAKEHOLDER_CACHE_INVALIDATED, handleInvalidation)
  }, [scope.accountId, scope.stakeholderId, resourcesKey(scope.resources)])

  return { data, isLoading, error, refetch }
}

function matchesScope(detail: StakeholderCacheScope, scope: StakeholderCacheScope) {
  if (scope.accountId && detail.accountId && scope.accountId !== detail.accountId) return false
  if (scope.stakeholderId && detail.stakeholderId && scope.stakeholderId !== detail.stakeholderId) return false
  if (!scope.resources?.length || !detail.resources?.length || detail.resources.includes('all')) return true
  return scope.resources.some(resource => detail.resources?.includes(resource))
}

function paramsToKey(params: StakeholderFilters | URLSearchParams) {
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

function resourcesKey(resources: StakeholderCacheResource[] | undefined) {
  return resources?.join('|') ?? ''
}

function uniqueResources(resources: StakeholderCacheResource[]) {
  return Array.from(new Set(resources))
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error('Stakeholder request failed')
}
