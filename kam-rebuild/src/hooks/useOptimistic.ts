import { useState } from 'react'

export function useOptimistic<T>(
  items: T[],
  updateFn: (draft: T[], action: { type: string; payload: unknown }) => T[],
) {
  const [snapshot, setSnapshot] = useState<T[] | null>(null)

  function apply(action: { type: string; payload: unknown }, commit: (next: T[]) => void) {
    setSnapshot(items)
    const next = updateFn([...items], action)
    commit(next)
  }

  function revert(commit: (next: T[]) => void) {
    if (snapshot) commit(snapshot)
    setSnapshot(null)
  }

  function confirm() {
    setSnapshot(null)
  }

  return { apply, revert, confirm, hasPending: Boolean(snapshot) }
}
