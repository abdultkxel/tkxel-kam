import { useSearchParams } from 'react-router-dom'

export interface TimelineFilterState {
  eventTypes: string[]
  dateFrom: string
  dateTo: string
  owner: string
  modules: string[]
  stage: string
  search: string
  showSensitive: boolean
}

export function useTimelineFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: TimelineFilterState = {
    eventTypes: searchParams.getAll('eventType'),
    dateFrom: searchParams.get('from') ?? '',
    dateTo: searchParams.get('to') ?? '',
    owner: searchParams.get('owner') ?? '',
    modules: searchParams.getAll('module'),
    stage: searchParams.get('stage') ?? '',
    search: searchParams.get('q') ?? '',
    showSensitive: searchParams.get('sensitive') === 'true',
  }

  function setFilter(key: string, value: string | string[] | boolean) {
    const next = new URLSearchParams(searchParams)
    next.delete(key)
    if (Array.isArray(value)) value.forEach(item => item && next.append(key, item))
    else if (typeof value === 'boolean') {
      if (value) next.set(key, 'true')
    } else if (value) next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  function clearAll() {
    setSearchParams({}, { replace: true })
  }

  return { filters, setFilter, clearAll }
}
