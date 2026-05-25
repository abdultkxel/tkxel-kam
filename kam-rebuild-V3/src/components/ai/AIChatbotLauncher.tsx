import { MessageCircle, Sparkles } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

export function AIChatbotLauncher() {
  const aiOpen = useUIStore(state => state.aiOpen)
  const openAI = useUIStore(state => state.openAI)

  if (aiOpen) return null

  return (
    <button
      type="button"
      onClick={() => openAI('Summarise this account')}
      className="fixed bottom-5 right-5 z-40 inline-flex min-h-[56px] items-center gap-3 rounded-full bg-brand-blue px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-ai transition-transform hover:-translate-y-0.5 hover:bg-brand-blue-dark focus-visible:ring-offset-surface-secondary sm:bottom-6 sm:right-6"
      aria-label="Open KAM AI query dashboard"
      title="Open KAM AI"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
        <MessageCircle className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-orange text-white">
          <Sparkles className="h-2.5 w-2.5" />
        </span>
      </span>
      <span className="hidden sm:inline">KAM AI</span>
    </button>
  )
}
