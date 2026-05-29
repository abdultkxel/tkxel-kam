import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const openAI = useUIStore(state => state.openAI)
  const setShortcutModalOpen = useUIStore(state => state.setShortcutModalOpen)
  const setGlobalNoteOpen = useUIStore(state => state.setGlobalNoteOpen)
  const lastKey = useRef('')

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const element = document.activeElement as HTMLElement | null
      const tag = element?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || element?.isContentEditable
      if (typing) return

      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        openAI()
        return
      }
      if (key === '?') setShortcutModalOpen(true)
      if (key === 'n') {
        event.preventDefault()
        setGlobalNoteOpen(true)
      }
      if (key === 'e') {
        event.preventDefault()
        navigate('/governance')
      }
      if (lastKey.current === 'g' && key === 'd') navigate('/dashboard')
      if (lastKey.current === 'g' && key === 'a') navigate('/accounts')
      lastKey.current = key
      window.setTimeout(() => {
        lastKey.current = ''
      }, 700)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, openAI, setGlobalNoteOpen, setShortcutModalOpen])
}
