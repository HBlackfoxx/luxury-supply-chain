'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Product } from '@/lib/api'
import { 
  ArrowLeft, 
  CheckCircle,
  Shield,
  AlertCircle
} from 'lucide-react'

export default function RecoverProductPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.productId as string
  
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    pin: '',
    recoveryDetails: ''
  })

  useEffect(() => {
    if (productId) {
      fetchProduct()
    }
  }, [productId])

  const fetchProduct = async () => {
    try {
      setLoading(true)
      const data = await api.verifyProduct(productId)
      setProduct(data)
      
      // Check if product is actually stolen
      if (data.status !== 'STOLEN') {
        setError('This product is not reported as stolen')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load product')
    } finally {
      setLoading(false)
    }
  }

  const handleRecoverProduct = async () => {
    if (!authData.email || !authData.password || authData.pin.length !== 4) {
      setError('Please enter your email, password, and 4-digit PIN to verify ownership')
      return
    }
    
    try {
      setRecovering(true)
      setError(null)
      
      const result = await api.recoverProduct(
        productId,
        authData.email,
        authData.password,
        authData.pin,
        authData.recoveryDetails || 'Product recovered by owner'
      )
      
      if (result.success) {
        setSuccess(true)
        // Redirect after 3 seconds
        setTimeout(() => {
          router.push(`/verify/${productId}`)
        }, 3000)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to mark product as recovered - please check your credentials')
    } finally {
      setRecovering(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading product...</p>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-center mb-2">Product Not Found</h2>
          <Link
            href="/"
            className="block w-full text-center py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 mt-4"
          >
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-sm w-full">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-center mb-2">Product Recovered</h2>
          <p className="text-gray-600 text-center mb-4">
            The product has been marked as recovered. You can now transfer or sell it normally.
          </p>
          <p className="text-sm text-gray-500 text-center">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-600 text-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href={`/verify/${productId}`} className="mr-4">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-semibold">Mark Product as Recovered</h1>
        </div>
      </div>

      {/* Success Banner */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <Shield className="w-6 h-6 text-green-600 mr-3 mt-0.5" />
            <div>
              <h2 className="font-semibold text-green-900">Recovery Process</h2>
              <p className="text-sm text-green-700 mt-1">
                Mark your product as recovered once you have it back in your possession. 
                This will restore normal transfer capabilities.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Product Info */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-2">{product.name}</h2>
          <p className="text-sm text-gray-600 mb-1">{product.description}</p>
          <p className="text-xs text-gray-500">Serial: {product.serialNumber}</p>
          <div className="mt-3 p-2 bg-red-50 rounded">
            <p className="text-sm text-red-600 font-medium">Currently marked as: STOLEN</p>
          </div>
        </div>

        {/* Recovery Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-4">
          <h3 className="text-lg font-semibold mb-4">Verify Ownership</h3>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Email *
              </label>
              <input
                type="email"
                value={authData.email}
                onChange={(e) => setAuthData({...authData, email: e.target.value})}
                placeholder="Enter your registered email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Password *
              </label>
              <input
                type="password"
                value={authData.password}
                onChange={(e) => setAuthData({...authData, password: e.target.value})}
                placeholder="Enter your password"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your 4-Digit PIN *
              </label>
              <input
                type="text"
                maxLength={4}
                pattern="[0-9]{4}"
                value={authData.pin}
                onChange={(e) => setAuthData({...authData, pin: e.target.value.replace(/\D/g, '')})}
                placeholder="0000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recovery Details (Optional)
              </label>
              <textarea
                value={authData.recoveryDetails}
                onChange={(e) => setAuthData({...authData, recoveryDetails: e.target.value})}
                placeholder="How was the product recovered? (e.g., Found, returned by police, etc.)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Once marked as recovered, your product will return to normal status 
                and can be transferred or sold again.
              </p>
            </div>

            <button
              onClick={handleRecoverProduct}
              disabled={recovering || !authData.email || !authData.password || authData.pin.length !== 4}
              className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {recovering ? 'Processing...' : 'Mark as Recovered'}
            </button>

            <button
              onClick={() => router.push(`/verify/${productId}`)}
              className="w-full py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}