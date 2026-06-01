import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/services/api'
import type { User, UserRole } from '@/types/user'

const AUTH_TOKEN_KEY = 'kam.auth.token'

export interface ApiUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  title?: string | null
  phone?: string | null
  avatar_initials: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface AuthResponse {
  access_token: string
  token_type: 'bearer'
  user: ApiUser
}

interface ForgotPasswordResponse {
  message: string
  reset_token?: string | null
}

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  googleSignIn: (credential: string) => Promise<void>
  logout: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<ForgotPasswordResponse>
  resetPassword: (token: string, newPassword: string) => Promise<void>
  updateProfile: (payload: Partial<Pick<User, 'name' | 'title' | 'phone' | 'avatarInitials'>>) => Promise<User>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function mapApiUser(user: ApiUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.full_name,
    role: user.role,
    title: user.title,
    phone: user.phone,
    avatarInitials: user.avatar_initials,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const persistToken = useCallback((nextToken: string | null) => {
    setToken(nextToken)
    if (nextToken) localStorage.setItem(AUTH_TOKEN_KEY, nextToken)
    else localStorage.removeItem(AUTH_TOKEN_KEY)
  }, [])

  const refreshProfile = useCallback(async () => {
    const activeToken = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!activeToken) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const profile = await apiRequest<ApiUser>('/api/auth/me', { token: activeToken })
      setUser(mapApiUser(profile))
      setToken(activeToken)
    } catch {
      persistToken(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [persistToken])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      persistToken(response.access_token)
      setUser(mapApiUser(response.user))
    },
    [persistToken],
  )

  const googleSignIn = useCallback(
    async (credential: string) => {
      const response = await apiRequest<AuthResponse>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      })
      persistToken(response.access_token)
      setUser(mapApiUser(response.user))
    },
    [persistToken],
  )

  const logout = useCallback(async () => {
    const activeToken = token
    try {
      if (activeToken) {
        await apiRequest('/api/auth/logout', { method: 'POST', token: activeToken })
      }
    } finally {
      persistToken(null)
      setUser(null)
    }
  }, [persistToken, token])

  const requestPasswordReset = useCallback(async (email: string) => {
    return apiRequest<ForgotPasswordResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  }, [])

  const resetPassword = useCallback(async (resetToken: string, newPassword: string) => {
    await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, new_password: newPassword }),
    })
  }, [])

  const updateProfile = useCallback(
    async (payload: Partial<Pick<User, 'name' | 'title' | 'phone' | 'avatarInitials'>>) => {
      if (!token) throw new Error('You must be logged in to update your profile')
      const profile = await apiRequest<ApiUser>('/api/users/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          full_name: payload.name,
          title: payload.title,
          phone: payload.phone,
          avatar_initials: payload.avatarInitials,
        }),
      })
      const mappedUser = mapApiUser(profile)
      setUser(mappedUser)
      return mappedUser
    },
    [token],
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!token) throw new Error('You must be logged in to change your password')
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        token,
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
    },
    [token],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      login,
      googleSignIn,
      logout,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      changePassword,
      refreshProfile,
    }),
    [changePassword, googleSignIn, isLoading, login, logout, refreshProfile, requestPasswordReset, resetPassword, token, updateProfile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
