import { FormEvent, useEffect, useState } from 'react'
import { KeyRound, LogOut, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { NotificationPreferencesPanel } from '@/components/notifications/NotificationPreferencesPanel'
import { ApiError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'
import { cn } from '@/utils/cn'

export function Profile() {
  const { user, updateProfile, changePassword, logout } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [title, setTitle] = useState(user?.title ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [avatarInitials, setAvatarInitials] = useState(user?.avatarInitials ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [profileFieldErrors, setProfileFieldErrors] = useState<FieldErrors>({})
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<FieldErrors>({})
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setName(user?.name ?? '')
    setTitle(user?.title ?? '')
    setPhone(user?.phone ?? '')
    setAvatarInitials(user?.avatarInitials ?? '')
  }, [user])

  function clearProfileField(field: string) {
    setProfileFieldErrors(errors => clearFieldError(errors, field))
  }

  function clearPasswordField(field: string) {
    setPasswordFieldErrors(errors => clearFieldError(errors, field))
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileError('')
    setProfileFieldErrors({})
    setSavingProfile(true)
    try {
      await updateProfile({ name, title, phone, avatarInitials })
      toast.success('Profile updated')
    } catch (err) {
      const nextFieldErrors = apiFieldErrors(err, { full_name: 'name', avatar_initials: 'avatarInitials' })
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

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
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
      </div>
      <NotificationPreferencesPanel />
    </div>
  )
}
