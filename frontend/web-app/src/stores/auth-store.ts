import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setAuthCookie, clearAuthCookie } from '@/lib/auth-utils'

interface User {
  id: string
  name: string
  email: string
  organization: string
  role: string
  fabricUserId?: string
  apiEndpoint?: string
  token?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  token: string | null
  login: (userData: User) => Promise<void>
  logout: () => void
  getAuthHeaders: () => Record<string, string>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      login: async (userData) => {
        const { token, ...user } = userData
        set({ 
          user, 
          isAuthenticated: true,
          token: token || null
        })
        // Set auth cookie for middleware
        if (token) {
          setAuthCookie(token)
        }
      },
      logout: () => {
        set({ user: null, isAuthenticated: false, token: null })
        // Clear auth cookie
        clearAuthCookie()
        // Clear any cached data
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      },
      getAuthHeaders: () => {
        const { token } = get()
        if (token) {
          return { Authorization: `Bearer ${token}` }
        }
        return {}
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)