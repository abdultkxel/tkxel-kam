import { Plus, Tags } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useAccountStore } from '@/stores/accountStore'

export function SegmentSettings() {
  const segmentTags = useAccountStore(state => state.segmentTags)
  const addSegmentTag = useAccountStore(state => state.addSegmentTag)
  const [name, setName] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    addSegmentTag(name.trim())
    setName('')
  }

  return (
    <section className="tk-card p-5">
      <div className="mb-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account Settings</p>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Tags className="h-4 w-4 text-brand-blue" />
          Segments
        </h2>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input className="tk-input" value={name} onChange={event => setName(event.target.value)} placeholder="Add segment tag" />
        <button className="tk-button-primary" type="submit">
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {segmentTags.map(tag => (
          <span key={tag} className="rounded-full border border-surface-border bg-surface-tertiary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-secondary">{tag}</span>
        ))}
      </div>
    </section>
  )
}
