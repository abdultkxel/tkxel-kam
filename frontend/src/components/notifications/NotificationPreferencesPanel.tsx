import { BellRing, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { getNotificationPreferences, NotificationPreference, updateNotificationPreferences } from '@/services/notificationsReporting'

export function NotificationPreferencesPanel() {
  const { token } = useAuth()
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const preferenceItems = Array.isArray(preferences) ? preferences : []

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getNotificationPreferences(token)
      .then(result => {
        if (active) setPreferences(Array.isArray(result) ? result : [])
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Notification preferences could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  function update(trigger: string, field: 'mode' | 'digest_cadence', value: string) {
    setPreferences(items => items.map(item => (item.trigger === trigger ? { ...item, [field]: value } : item)))
  }

  async function save() {
    if (!token) return
    setSaving(true)
    setError('')
    try {
      const result = await updateNotificationPreferences(token, preferenceItems.map(item => ({ trigger: item.trigger, mode: item.mode, digest_cadence: item.digest_cadence })))
      setPreferences(Array.isArray(result) ? result : [])
      toast.success('Notification preferences saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notification preferences could not be saved')
      toast.error(err instanceof Error ? err.message : 'Notification preferences could not be saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-tint-20 text-brand-blue">
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Notifications</h2>
            <p className="text-sm text-ink-secondary">Delivery preferences for account alerts and digests.</p>
          </div>
        </div>
        <button className="tk-button-primary" type="button" onClick={() => void save()} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save preferences
        </button>
      </div>
      {loading ? <div className="flex items-center gap-2 p-4 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading preferences</div> : null}
      {error ? <p className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm font-medium text-rag-red">{error}</p> : null}
      {!loading && !error && preferenceItems.length === 0 ? <p className="p-4 text-sm text-ink-secondary">No notification triggers configured.</p> : null}
      <div className="divide-y divide-surface-border">
        {preferenceItems.map(preference => (
          <div key={preference.trigger} className="grid gap-3 p-4 lg:grid-cols-[1fr_180px_180px] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-ink">{preference.label}</p>
              <p className="text-xs text-ink-secondary">{preference.mandatory ? 'Mandatory policy notification' : 'Optional notification'}</p>
            </div>
            <select className="tk-input" value={preference.mode} onChange={event => update(preference.trigger, 'mode', event.target.value)} disabled={preference.mandatory}>
              <option value="in_app">In-app</option>
              <option value="in_app_email">In-app + email</option>
              <option value="off">Off</option>
            </select>
            <select className="tk-input" value={preference.digest_cadence} onChange={event => update(preference.trigger, 'digest_cadence', event.target.value)}>
              <option value="immediate">Immediate</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        ))}
      </div>
    </section>
  )
}
