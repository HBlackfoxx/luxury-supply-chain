'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { organizationManager } from '@/lib/organization-config'
import { Package, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCredentials, setShowCredentials] = useState(true)

  useEffect(() => {
    // Initialize organization manager
    organizationManager.initialize()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Detect organization from email
      const org = organizationManager.getByEmail(email)
      
      if (!org) {
        setError('Email domain not recognized. Please use your organization email.')
        setLoading(false)
        return
      }

      // Call the organization's specific backend
      const response = await fetch(`${org.apiEndpoint}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        setError(data.error || 'Invalid credentials')
        setLoading(false)
        return
      }

      // Store auth data with organization info
      console.log('Login successful:', data);
      console.log('User role:', data.user.role);
      console.log('Org type:', org.type);
      
      await login({
        ...data.user,
        apiEndpoint: org.apiEndpoint,
        organization: org.id,
        token: data.token
      })

      // Redirect based on role
      console.log('Redirecting...');
      if (data.user.role === 'admin' && org.type === 'brand') {
        console.log('Redirecting to /admin');
        router.push('/admin')
      } else {
        console.log('Redirecting to /b2b');
        router.push('/b2b')
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection error. Please check if your organization server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Package className="w-12 h-12 text-luxury-gold" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Luxury Supply Chain
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in with your organization credentials
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-luxury-gold focus:border-luxury-gold sm:text-sm"
                  placeholder="admin@luxebags.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-luxury-gold focus:border-luxury-gold sm:text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={!email || !password}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-luxury-gold hover:bg-luxury-gold-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-luxury-gold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
          </form>

          {showCredentials && (
            <div className="mt-6 border-t border-gray-200 pt-6">
              <button
                onClick={() => setShowCredentials(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Hide demo credentials
              </button>
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <p className="font-medium text-gray-700">LuxeBags (Brand):</p>
                  <p className="text-gray-600">admin@luxebags.com / LuxeBags2024!</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Italian Leather (Supplier):</p>
                  <p className="text-gray-600">admin@italianleather.com / ItalianLeather2024!</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Craft Workshop (Manufacturer):</p>
                  <p className="text-gray-600">admin@craftworkshop.com / CraftWorkshop2024!</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Luxury Retail (Retailer):</p>
                  <p className="text-gray-600">admin@luxuryretail.com / LuxuryRetail2024!</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}