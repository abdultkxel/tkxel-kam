import { FormEvent, useEffect, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { BellRing, KeyRound, Loader2, LogOut, Save, ShieldCheck, Unplug, UserRound, Video } from 'lucide-react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { NotificationPreferencesPanel } from '@/components/notifications/NotificationPreferencesPanel'
import { ApiError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  readPersonalFathomConnection,
  readPersonalFirefliesConnection,
  updatePersonalFathomConnection,
  updatePersonalFirefliesConnection,
  type UserMeetingConnection,
} from '@/services/meetingCapture'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

export function Profile() {
  const { user, token, updateProfile, changePassword, logout } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [title, setTitle] = useState(user?.title ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [avatarInitials, setAvatarInitials] = useState(user?.avatarInitials ?? '')
  const [primaryGoogleCalendarId, setPrimaryGoogleCalendarId] = useState(user?.primaryGoogleCalendarId ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [profileFieldErrors, setProfileFieldErrors] = useState<FieldErrors>({})
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<FieldErrors>({})
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [fathomConnection, setFathomConnection] = useState<UserMeetingConnection | null>(null)
  const [fathomApiKey, setFathomApiKey] = useState('')
  const [fathomFieldErrors, setFathomFieldErrors] = useState<FieldErrors>({})
  const [fathomError, setFathomError] = useState('')
  const [loadingFathom, setLoadingFathom] = useState(false)
  const [savingFathom, setSavingFathom] = useState(false)
  const [disconnectingFathom, setDisconnectingFathom] = useState(false)
  const [firefliesConnection, setFirefliesConnection] = useState<UserMeetingConnection | null>(null)
  const [firefliesApiKey, setFirefliesApiKey] = useState('')
  const [firefliesFieldErrors, setFirefliesFieldErrors] = useState<FieldErrors>({})
  const [firefliesError, setFirefliesError] = useState('')
  const [loadingFireflies, setLoadingFireflies] = useState(false)
  const [savingFireflies, setSavingFireflies] = useState(false)
  const [disconnectingFireflies, setDisconnectingFireflies] = useState(false)

  useEffect(() => {
    setName(user?.name ?? '')
    setTitle(user?.title ?? '')
    setPhone(user?.phone ?? '')
    setAvatarInitials(user?.avatarInitials ?? '')
    setPrimaryGoogleCalendarId(user?.primaryGoogleCalendarId ?? '')
  }, [user])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoadingFathom(true)
    setLoadingFireflies(true)
    Promise.allSettled([readPersonalFathomConnection(token), readPersonalFirefliesConnection(token)]).then(results => {
      if (!active) return
      const fathomResult = results[0]
      const firefliesResult = results[1]
      if (fathomResult.status === 'fulfilled') {
        setFathomConnection(fathomResult.value)
        setFathomError(fathomResult.value.lastError ?? '')
      } else {
        setFathomError(fathomResult.reason instanceof Error ? fathomResult.reason.message : 'Unable to load Fathom connection')
      }
      if (firefliesResult.status === 'fulfilled') {
        setFirefliesConnection(firefliesResult.value)
        setFirefliesError(firefliesResult.value.lastError ?? '')
      } else {
        setFirefliesError(firefliesResult.reason instanceof Error ? firefliesResult.reason.message : 'Unable to load Fireflies connection')
      }
      setLoadingFathom(false)
      setLoadingFireflies(false)
    })
    return () => {
      active = false
    }
  }, [token])

  function clearProfileField(field: string) {
    setProfileFieldErrors(errors => clearFieldError(errors, field))
  }

  function clearPasswordField(field: string) {
    setPasswordFieldErrors(errors => clearFieldError(errors, field))
  }

  function clearFathomField(field: string) {
    setFathomFieldErrors(errors => clearFieldError(errors, field))
  }

  function clearFirefliesField(field: string) {
    setFirefliesFieldErrors(errors => clearFieldError(errors, field))
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError('')
    setProfileFieldErrors({})
    setSavingProfile(true)
    try {
      await updateProfile({ name, title, phone, avatarInitials, primaryGoogleCalendarId })
      toast.success('Profile updated')
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, { full_name: 'name', avatar_initials: 'avatarInitials', primary_google_calendar_id: 'primaryGoogleCalendarId' })
      setProfileFieldErrors(nextFieldErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextFieldErrors)) {
        setProfileError(err.message)
        toast.error(err.message)
      }
      if (!(err instanceof ApiError)) {
        setProfileError('Unable to update profile')
        toast.error('Unable to update profile')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError('')
    setPasswordFieldErrors({})
    setSavingPassword(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      toast.success('Password updated')
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, { current_password: 'currentPassword', new_password: 'newPassword' })
      setPasswordFieldErrors(nextFieldErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextFieldErrors)) {
        setPasswordError(err.message)
        toast.error(err.message)
      }
      if (!(err instanceof ApiError)) {
        setPasswordError('Unable to update password')
        toast.error('Unable to update password')
      }
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleFathomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFathomError('')
    setFathomFieldErrors({})
    if (!token) {
      toast.error('Sign in again before saving Fathom.')
      return
    }
    setSavingFathom(true)
    try {
      const saved = await updatePersonalFathomConnection(token, { enabled: true, apiKey: fathomApiKey.trim() || undefined })
      setFathomConnection(saved)
      setFathomApiKey('')
      setFathomError(saved.lastError ?? '')
      if (saved.credentialStatus.configured) {
        toast.success('Fathom API key saved')
      } else {
        toast.error(saved.lastError ?? 'Personal Fathom API key is required.')
      }
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, { api_key: 'apiKey' })
      setFathomFieldErrors(nextFieldErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextFieldErrors)) {
        setFathomError(err.message)
        toast.error(err.message)
      }
      if (!(err instanceof ApiError)) {
        setFathomError('Unable to save Fathom connection')
        toast.error('Unable to save Fathom connection')
      }
    } finally {
      setSavingFathom(false)
    }
  }

  async function handleFathomDisconnect() {
    setFathomError('')
    setFathomFieldErrors({})
    if (!token) {
      toast.error('Sign in again before disconnecting Fathom.')
      return
    }
    setDisconnectingFathom(true)
    try {
      const saved = await updatePersonalFathomConnection(token, { enabled: false, clearApiKey: true })
      setFathomConnection(saved)
      setFathomApiKey('')
      setFathomError('')
      toast.success('Fathom disconnected')
    } catch (err) {
      if (err instanceof ApiError) {
        setFathomError(err.message)
        toast.error(err.message)
      } else {
        setFathomError('Unable to disconnect Fathom')
        toast.error('Unable to disconnect Fathom')
      }
    } finally {
      setDisconnectingFathom(false)
    }
  }

  async function handleFirefliesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFirefliesError('')
    setFirefliesFieldErrors({})
    if (!token) {
      toast.error('Sign in again before saving Fireflies.')
      return
    }
    setSavingFireflies(true)
    try {
      const saved = await updatePersonalFirefliesConnection(token, { enabled: true, apiKey: firefliesApiKey.trim() || undefined })
      setFirefliesConnection(saved)
      setFirefliesApiKey('')
      setFirefliesError(saved.lastError ?? '')
      if (saved.credentialStatus.configured) {
        toast.success('Fireflies API key saved')
      } else {
        toast.error(saved.lastError ?? 'Personal Fireflies API key is required.')
      }
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, { api_key: 'apiKey' })
      setFirefliesFieldErrors(nextFieldErrors)
      if (err instanceof ApiError && !hasFieldErrors(nextFieldErrors)) {
        setFirefliesError(err.message)
        toast.error(err.message)
      }
      if (!(err instanceof ApiError)) {
        setFirefliesError('Unable to save Fireflies connection')
        toast.error('Unable to save Fireflies connection')
      }
    } finally {
      setSavingFireflies(false)
    }
  }

  async function handleFirefliesDisconnect() {
    setFirefliesError('')
    setFirefliesFieldErrors({})
    if (!token) {
      toast.error('Sign in again before disconnecting Fireflies.')
      return
    }
    setDisconnectingFireflies(true)
    try {
      const saved = await updatePersonalFirefliesConnection(token, { enabled: false, clearApiKey: true })
      setFirefliesConnection(saved)
      setFirefliesApiKey('')
      setFirefliesError('')
      toast.success('Fireflies disconnected')
    } catch (err) {
      if (err instanceof ApiError) {
        setFirefliesError(err.message)
        toast.error(err.message)
      } else {
        setFirefliesError('Unable to disconnect Fireflies')
        toast.error('Unable to disconnect Fireflies')
      }
    } finally {
      setDisconnectingFireflies(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-blue">Account access</p>
          <h1 className="font-display text-4xl font-bold text-ink">Profile</h1>
        </div>
        <button className="tk-button-secondary" type="button" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </header>

      <Tabs.Root defaultValue="account-security" className="space-y-5">
        <Tabs.List className="flex flex-wrap gap-2 rounded-lg border border-surface-border bg-white p-1">
          {[
            { value: 'account-security', label: 'Account & Security', icon: ShieldCheck },
            { value: 'meeting-integrations', label: 'Meeting Integrations', icon: Video },
            { value: 'notifications', label: 'Notifications', icon: BellRing },
          ].map(tab => {
            const Icon = tab.icon
            return (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className="flex min-h-[40px] items-center gap-2 rounded-md px-3 text-sm font-bold text-ink-secondary transition hover:bg-surface-tertiary hover:text-ink data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Tabs.Trigger>
            )
          })}
        </Tabs.List>

        <Tabs.Content value="account-security" className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <section className="tk-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-tint-20 text-brand-blue">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">User details</h2>
                <p className="text-sm text-ink-secondary">{user?.email}</p>
              </div>
            </div>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleProfileSubmit} noValidate>
              <label className="block md:col-span-2">
                <span className="tk-label">Full name</span>
                <input
                  className={cn('tk-input mt-2', profileFieldErrors.name && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  value={name}
                  onChange={event => {
                    setName(event.target.value)
                    clearProfileField('name')
                  }}
                  aria-invalid={Boolean(profileFieldErrors.name)}
                  aria-describedby={profileFieldErrors.name ? 'profile-name-error' : undefined}
                />
                <FieldError id="profile-name-error" message={profileFieldErrors.name} />
              </label>
              <label className="block">
                <span className="tk-label">Title</span>
                <input
                  className={cn('tk-input mt-2', profileFieldErrors.title && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  value={title}
                  onChange={event => {
                    setTitle(event.target.value)
                    clearProfileField('title')
                  }}
                  aria-invalid={Boolean(profileFieldErrors.title)}
                  aria-describedby={profileFieldErrors.title ? 'profile-title-error' : undefined}
                />
                <FieldError id="profile-title-error" message={profileFieldErrors.title} />
              </label>
              <label className="block">
                <span className="tk-label">Phone</span>
                <input
                  className={cn('tk-input mt-2', profileFieldErrors.phone && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  value={phone}
                  onChange={event => {
                    setPhone(event.target.value)
                    clearProfileField('phone')
                  }}
                  aria-invalid={Boolean(profileFieldErrors.phone)}
                  aria-describedby={profileFieldErrors.phone ? 'profile-phone-error' : undefined}
                />
                <FieldError id="profile-phone-error" message={profileFieldErrors.phone} />
              </label>
              <label className="block">
                <span className="tk-label">Avatar initials</span>
                <input
                  className={cn('tk-input mt-2 uppercase', profileFieldErrors.avatarInitials && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  value={avatarInitials}
                  onChange={event => {
                    setAvatarInitials(event.target.value)
                    clearProfileField('avatarInitials')
                  }}
                  aria-invalid={Boolean(profileFieldErrors.avatarInitials)}
                  aria-describedby={profileFieldErrors.avatarInitials ? 'profile-avatar-error' : undefined}
                  maxLength={8}
                />
                <FieldError id="profile-avatar-error" message={profileFieldErrors.avatarInitials} />
              </label>
              <label className="block md:col-span-2">
                <span className="tk-label">Primary Google Calendar ID</span>
                <input
                  className={cn('tk-input mt-2', profileFieldErrors.primaryGoogleCalendarId && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  value={primaryGoogleCalendarId}
                  onChange={event => {
                    setPrimaryGoogleCalendarId(event.target.value)
                    clearProfileField('primaryGoogleCalendarId')
                  }}
                  aria-invalid={Boolean(profileFieldErrors.primaryGoogleCalendarId)}
                  aria-describedby={profileFieldErrors.primaryGoogleCalendarId ? 'profile-primary-calendar-error' : undefined}
                />
                <FieldError id="profile-primary-calendar-error" message={profileFieldErrors.primaryGoogleCalendarId} />
              </label>
              <label className="block">
                <span className="tk-label">Role</span>
                <input className="tk-input mt-2 capitalize" value={user?.role.replace('_', ' ') ?? ''} readOnly />
              </label>
              <div className="md:col-span-2">
                {profileError ? <p className="mb-3 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{profileError}</p> : null}
                <button className="tk-button-primary" type="submit" disabled={savingProfile}>
                  <Save className="h-4 w-4" />
                  {savingProfile ? 'Saving profile' : 'Save profile'}
                </button>
              </div>
            </form>
          </section>

          <section className="tk-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-orange-tint-20 text-brand-orange">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">Password</h2>
                <p className="text-sm text-ink-secondary">Update your login credential.</p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handlePasswordSubmit} noValidate>
              <label className="block">
                <span className="tk-label">Current password</span>
                <input
                  className={cn('tk-input mt-2', passwordFieldErrors.currentPassword && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type="password"
                  value={currentPassword}
                  onChange={event => {
                    setCurrentPassword(event.target.value)
                    clearPasswordField('currentPassword')
                  }}
                  autoComplete="current-password"
                  aria-invalid={Boolean(passwordFieldErrors.currentPassword)}
                  aria-describedby={passwordFieldErrors.currentPassword ? 'profile-current-password-error' : undefined}
                  minLength={8}
                />
                <FieldError id="profile-current-password-error" message={passwordFieldErrors.currentPassword} />
              </label>
              <label className="block">
                <span className="tk-label">New password</span>
                <input
                  className={cn('tk-input mt-2', passwordFieldErrors.newPassword && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type="password"
                  value={newPassword}
                  onChange={event => {
                    setNewPassword(event.target.value)
                    clearPasswordField('newPassword')
                  }}
                  autoComplete="new-password"
                  aria-invalid={Boolean(passwordFieldErrors.newPassword)}
                  aria-describedby={passwordFieldErrors.newPassword ? 'profile-new-password-error' : undefined}
                  minLength={8}
                />
                <FieldError id="profile-new-password-error" message={passwordFieldErrors.newPassword} />
              </label>
              {passwordError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{passwordError}</p> : null}
              <button className="tk-button-primary w-full" type="submit" disabled={savingPassword}>
                <KeyRound className="h-4 w-4" />
                {savingPassword ? 'Updating password' : 'Update password'}
              </button>
            </form>
          </section>
        </Tabs.Content>

        <Tabs.Content value="meeting-integrations" className="grid gap-6 lg:grid-cols-2">
          <section className="tk-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-tint-20 text-brand-blue">
                <Video className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-bold text-ink">Fathom</h2>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', fathomConnection?.credentialStatus.configured ? 'bg-rag-green/10 text-rag-green' : 'bg-surface-tertiary text-ink-secondary')}>
                    {loadingFathom ? 'Checking' : fathomConnection?.credentialStatus.configured ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <p className="text-sm text-ink-secondary">Save your personal API key for meeting notes.</p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleFathomSubmit} noValidate>
              <label className="block">
                <span className="tk-label">Fathom API key</span>
                <input
                  className={cn('tk-input mt-2', fathomFieldErrors.apiKey && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type="password"
                  value={fathomApiKey}
                  onChange={event => {
                    setFathomApiKey(event.target.value)
                    clearFathomField('apiKey')
                  }}
                  placeholder={fathomConnection?.credentialStatus.configured ? 'Saved key is masked' : 'Paste your Fathom API key'}
                  autoComplete="off"
                  aria-invalid={Boolean(fathomFieldErrors.apiKey)}
                  aria-describedby={fathomFieldErrors.apiKey ? 'profile-fathom-api-key-error' : undefined}
                />
                <FieldError id="profile-fathom-api-key-error" message={fathomFieldErrors.apiKey} />
              </label>
              {fathomError ? <p className="rounded-md border border-brand-orange/20 bg-brand-orange/10 px-3 py-2 text-sm font-medium text-brand-orange">{fathomError}</p> : null}
              <button className="tk-button-primary w-full" type="submit" disabled={savingFathom || loadingFathom || disconnectingFathom}>
                {savingFathom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingFathom ? 'Saving Fathom' : 'Save Fathom key'}
              </button>
              {fathomConnection?.credentialStatus.configured ? (
                <button className="tk-button-secondary w-full" type="button" onClick={handleFathomDisconnect} disabled={disconnectingFathom || savingFathom || loadingFathom}>
                  {disconnectingFathom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  {disconnectingFathom ? 'Disconnecting Fathom' : 'Disconnect Fathom'}
                </button>
              ) : null}
            </form>
          </section>

          <section className="tk-card p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-green-50 text-rag-green">
                <Video className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-bold text-ink">Fireflies</h2>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', firefliesConnection?.credentialStatus.configured ? 'bg-rag-green/10 text-rag-green' : 'bg-surface-tertiary text-ink-secondary')}>
                    {loadingFireflies ? 'Checking' : firefliesConnection?.credentialStatus.configured ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <p className="text-sm text-ink-secondary">Import one transcript summary by ID or URL.</p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleFirefliesSubmit} noValidate>
              <label className="block">
                <span className="tk-label">Fireflies API key</span>
                <input
                  className={cn('tk-input mt-2', firefliesFieldErrors.apiKey && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20')}
                  type="password"
                  value={firefliesApiKey}
                  onChange={event => {
                    setFirefliesApiKey(event.target.value)
                    clearFirefliesField('apiKey')
                  }}
                  placeholder={firefliesConnection?.credentialStatus.configured ? 'Saved key is masked' : 'Paste your Fireflies API key'}
                  autoComplete="off"
                  aria-invalid={Boolean(firefliesFieldErrors.apiKey)}
                  aria-describedby={firefliesFieldErrors.apiKey ? 'profile-fireflies-api-key-error' : undefined}
                />
                <FieldError id="profile-fireflies-api-key-error" message={firefliesFieldErrors.apiKey} />
              </label>
              {firefliesError ? <p className="rounded-md border border-brand-orange/20 bg-brand-orange/10 px-3 py-2 text-sm font-medium text-brand-orange">{firefliesError}</p> : null}
              <button className="tk-button-primary w-full" type="submit" disabled={savingFireflies || loadingFireflies || disconnectingFireflies}>
                {savingFireflies ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingFireflies ? 'Saving Fireflies' : 'Save Fireflies key'}
              </button>
              {firefliesConnection?.credentialStatus.configured ? (
                <button className="tk-button-secondary w-full" type="button" onClick={handleFirefliesDisconnect} disabled={disconnectingFireflies || savingFireflies || loadingFireflies}>
                  {disconnectingFireflies ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  {disconnectingFireflies ? 'Disconnecting Fireflies' : 'Disconnect Fireflies'}
                </button>
              ) : null}
            </form>
          </section>
        </Tabs.Content>

        <Tabs.Content value="notifications">
          <NotificationPreferencesPanel />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
