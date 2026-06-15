import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { listServiceCatalog } from '@/services/relationshipsPlanning'

export function useServiceCatalogOptions() {
  const { token } = useAuth()
  const [options, setOptions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setOptions([])
      setError('')
      return
    }
    let active = true
    setIsLoading(true)
    setError('')
    listServiceCatalog(token)
      .then(page => {
        if (!active) return
        setOptions(page.items.map(item => item.name))
      })
      .catch(err => {
        if (!active) return
        setOptions([])
        setError(err instanceof Error ? err.message : 'Service catalog could not be loaded')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const serviceLineOptions = useMemo(() => options, [options])
  return { serviceLineOptions, isLoading, error }
}
