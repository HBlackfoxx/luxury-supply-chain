'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Product } from '@/lib/api'
import { 
  ArrowLeft, 
  Send, 
  Copy, 
  CheckCircle,
  AlertCircle,
  Clock,
  QrCode
} from 'lucide-react'

export default function TransferPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.productId as string
  
  const [product, setProduct] = useState<Product | null>(null)
  const [transferCode, setTransferCode] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    pin: ''
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
      
      // Check if product can be transferred
      // Products with OWNED or SOLD status can be transferred (SOLD means owned by a customer)
      if (data.status !== 'OWNED' && data.status !== 'SOLD') {
        setError('This product cannot be transferred in its current state')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load product')
    } finally {
      setLoading(false)
    }
  }

  const generateTransferCode = async () => {
    if (!authData.email || !authData.password || authData.pin.length !== 4) {
      setError('Please enter your email, password, and 4-digit PIN')
      return
    }
    
    try {
      setGenerating(true)
      setError(null)
      const result = await api.initiateTransfer(
        productId, 
        authData.email, 
        authData.password, 
        authData.pin
      )
      setTransferCode(result.transferCode)
      setExpiresAt(result.expiresAt)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate transfer code - please check your credentials')
    } finally {
      setGenerating(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transferCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold mx-auto"></div>
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
            className="block w-full text-center py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark mt-4"
          >
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href={`/verify/${productId}`} className="mr-4">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-semibold">Transfer Ownership</h1>
        </div>
      </div>

      {/* Product Info */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-2">{product.name}</h2>
          <p className="text-sm text-gray-600 mb-1">{product.description}</p>
          <p className="text-xs text-gray-500">Serial: {product.serialNumber}</p>
        </div>

        {/* Transfer Instructions */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-4">
          <div className="flex items-center mb-4">
            <Send className="w-6 h-6 text-luxury-gold mr-2" />
            <h3 className="text-lg font-semibold">Transfer Instructions</h3>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!transferCode ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Verify your ownership to generate a transfer code.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Email</label>
                <input
                  type="email"
                  value={authData.email}
                  onChange={(e) => setAuthData({...authData, email: e.target.value})}
                  placeholder="Enter your registered email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Password</label>
                <input
                  type="password"
                  value={authData.password}
                  onChange={(e) => setAuthData({...authData, password: e.target.value})}
                  placeholder="Enter your password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your 4-Digit PIN</label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  value={authData.pin}
                  onChange={(e) => setAuthData({...authData, pin: e.target.value.replace(/\D/g, '')})}
                  placeholder="0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                />
              </div>
              
              <button
                onClick={generateTransferCode}
                disabled={generating || (product.status !== 'OWNED' && product.status !== 'SOLD') || !authData.email || !authData.password || authData.pin.length !== 4}
                className="w-full py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
              >
                {generating ? 'Verifying & Generating...' : 'Generate Transfer Code'}
              </button>

              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-xs text-amber-800">
                  <strong>Important:</strong> Once you generate a transfer code and the new owner claims the product, 
                  you will no longer have ownership.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex items-center mb-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                  <span className="font-semibold text-green-900">Transfer Code Generated</span>
                </div>
                
                <div className="bg-white rounded p-3 mt-3">
                  <div className="flex items-center justify-between">
                    <code className="text-lg font-mono font-bold">{transferCode}</code>
                    <button
                      onClick={copyToClipboard}
                      className="p-2 hover:bg-gray-100 rounded"
                    >
                      {copied ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center mt-3 text-sm text-amber-700">
                  <Clock className="w-4 h-4 mr-1" />
                  <span>Expires: {new Date(expiresAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Share with New Owner:</h4>
                <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                  <li>Share the transfer code above</li>
                  <li>Direct them to scan the product QR code</li>
                  <li>They enter the transfer code when claiming</li>
                  <li>Transfer completes instantly</li>
                </ol>
              </div>

              <div className="flex items-center justify-center text-sm text-gray-600">
                <QrCode className="w-4 h-4 mr-1" />
                <span>Product QR contains verification link</span>
              </div>

              <button
                onClick={() => {
                  setTransferCode('')
                  setExpiresAt('')
                }}
                className="w-full py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Generate New Code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}