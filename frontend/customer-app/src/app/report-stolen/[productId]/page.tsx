'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Product } from '@/lib/api'
import { 
  ArrowLeft, 
  AlertTriangle,
  Shield,
  FileText,
  AlertCircle
} from 'lucide-react'

export default function ReportStolenPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.productId as string
  
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [reporting, setReporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    pin: '',
    policeReportId: ''
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
      
      // Check if product is already stolen
      if (data.status === 'STOLEN') {
        setError('This product is already reported as stolen')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load product')
    } finally {
      setLoading(false)
    }
  }

  const handleReportStolen = async () => {
    if (!authData.email || !authData.password || authData.pin.length !== 4) {
      setError('Please enter your email, password, and 4-digit PIN to verify ownership')
      return
    }
    
    try {
      setReporting(true)
      setError(null)
      
      const result = await api.reportStolen(
        productId,
        authData.email,
        authData.password,
        authData.pin,
        authData.policeReportId || undefined
      )
      
      if (result.success) {
        setSuccess(true)
        // Redirect after 3 seconds
        setTimeout(() => {
          router.push(`/verify/${productId}`)
        }, 3000)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to report product as stolen - please check your credentials')
    } finally {
      setReporting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
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
          <Shield className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-center mb-2">Product Reported as Stolen</h2>
          <p className="text-gray-600 text-center mb-4">
            The product has been marked as stolen in our system. This will help prevent unauthorized resale.
          </p>
          <p className="text-sm text-gray-500 text-center">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-red-600 text-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href={`/verify/${productId}`} className="mr-4">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-semibold">Report Stolen Product</h1>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-3 mt-0.5" />
            <div>
              <h2 className="font-semibold text-red-900">Important Notice</h2>
              <p className="text-sm text-red-700 mt-1">
                Reporting a product as stolen will prevent it from being transferred or sold. 
                You should file a police report if your product was actually stolen.
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
        </div>

        {/* Report Form */}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Police Report ID (Optional)
              </label>
              <input
                type="text"
                value={authData.policeReportId}
                onChange={(e) => setAuthData({...authData, policeReportId: e.target.value})}
                placeholder="Enter police report number if available"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                You can add this later if you don't have it yet
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex items-start">
                <FileText className="w-5 h-5 text-amber-600 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">Filing a Police Report</p>
                  <p className="text-xs text-amber-700 mt-1">
                    We strongly recommend filing a police report for stolen items. 
                    This helps with insurance claims and legal proceedings.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleReportStolen}
              disabled={reporting || !authData.email || !authData.password || authData.pin.length !== 4}
              className="w-full py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {reporting ? 'Reporting...' : 'Report as Stolen'}
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