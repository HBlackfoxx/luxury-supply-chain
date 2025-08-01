// Utility to sync auth state with cookies for middleware
export function setAuthCookie(token: string) {
  if (typeof window !== 'undefined') {
    document.cookie = `auth-token=${token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`
  }
}

export function clearAuthCookie() {
  if (typeof window !== 'undefined') {
    document.cookie = 'auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  
  const match = document.cookie.match(/auth-token=([^;]+)/)
  return match ? match[1] : null
}