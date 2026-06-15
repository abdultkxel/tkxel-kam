import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { listAccounts } from '@/services/accountWorkspace'
import { Account } from '@/types/account'

export function useAccountOptions(params: URLSearchParams = defaultAccountParams()) {
  const { token } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const key = params.toString()

  useEffect(() => {
    if (!token) {
      setAccounts([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    listAccounts(token, new URLSearchParams(key))
      .then(result => {
        if (active) setAccounts(result.items)
      })
      .catch(err => {
        if (!active) return
        setAccounts([])
        setError(err instanceof Error ? err.message : 'Unable to load accounts')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [key, token])

  return { accounts, loading, error }
}

function defaultAccountParams() {
  return new URLSearchParams({
    sort: 'name',
    direction: 'asc',
    page: '1',
    page_size: '100',
  })
}
