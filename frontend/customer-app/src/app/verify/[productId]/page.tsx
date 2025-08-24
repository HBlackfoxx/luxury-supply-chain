'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Product } from '@/lib/api'
import { 
  ShieldCheck, 
  AlertTriangle, 
  Package, 
  Calendar, 
  Hash, 
  ArrowLeft,
  Award,
  User,
  Clock,
  AlertCircle,
  QrCode
} from 'lucide-react'

export default function VerifyProductPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params.productId as string
  
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [transferCode, setTransferCode] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [supplyChainHistory, setSupplyChainHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (productId) {
      fetchProduct()
      fetchSupplyChainHistory()
    }
  }, [productId])

  const fetchProduct = async () => {
    try {
      setLoading(true)
      const data = await api.verifyProduct(productId)
      setProduct(data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify product')
    } finally {
      setLoading(false)
    }
  }

  const fetchSupplyChainHistory = async () => {
    try {
      setHistoryLoading(true)
      const history = await api.getProductHistory(productId)
      setSupplyChainHistory(history)
    } catch (err: any) {
      console.error('Failed to fetch supply chain history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleClaimOwnership = async () => {
    if (!transferCode) {
      setError('Please enter the transfer code')
      return
    }
    
    if (!email || !password || pin.length !== 4) {
      setError('Please enter your email, password, and 4-digit PIN')
      return
    }

    try {
      setClaiming(true)
      const result = await api.claimOwnership(productId, transferCode, email, password, pin)
      if (result.success) {
        // Refresh product data
        await fetchProduct()
        setShowClaimForm(false)
        setTransferCode('')
        setEmail('')
        setPassword('')
        setPin('')
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to claim ownership')
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying product...</p>
        </div>
      </div>
    )
  }

  if (error && !product) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-center mb-2">Verification Failed</h2>
          <p className="text-gray-600 text-center mb-4">{error}</p>
          <Link
            href="/"
            className="block w-full text-center py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
          >
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  if (!product) return null

  const isAuthentic = product.status !== 'STOLEN'
  const isOwned = product.status === 'OWNED' || product.status === 'SOLD'
  const isAvailable = product.status === 'AVAILABLE' || product.status === 'IN_STORE'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href="/" className="mr-4">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-semibold">Product Verification</h1>
        </div>
      </div>

      {/* Verification Status */}
      <div className={`max-w-md mx-auto mt-4 mx-4 p-4 rounded-lg ${
        product.status === 'STOLEN' 
          ? 'bg-red-50 border border-red-200' 
          : 'bg-green-50 border border-green-200'
      }`}>
        <div className="flex items-center">
          {product.status === 'STOLEN' ? (
            <>
              <AlertTriangle className="w-8 h-8 text-red-500 mr-3" />
              <div>
                <h2 className="font-semibold text-red-900">Reported Stolen</h2>
                <p className="text-sm text-red-700">This product has been reported as stolen</p>
              </div>
            </>
          ) : (
            <>
              <ShieldCheck className="w-8 h-8 text-green-500 mr-3" />
              <div>
                <h2 className="font-semibold text-green-900">Authentic Product</h2>
                <p className="text-sm text-green-700">Verified genuine luxury item</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Product Details */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Product Information</h3>
          
          <div className="space-y-3">
            <div className="flex items-start">
              <Package className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Product</p>
                <p className="font-medium">{product.name || product.type || 'Luxury Item'}</p>
                <p className="text-sm text-gray-600">{product.description || product.brand || 'Premium Quality'}</p>
              </div>
            </div>

            <div className="flex items-start">
              <Hash className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Serial Number</p>
                <p className="font-medium font-mono">{product.serialNumber}</p>
              </div>
            </div>

            <div className="flex items-start">
              <Calendar className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Manufacturing Date</p>
                <p className="font-medium">
                  {(() => {
                    const dateStr = product.manufacturingDate || product.createdAt;
                    if (dateStr && dateStr !== 'N/A') {
                      try {
                        const date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                          return date.toLocaleDateString();
                        }
                      } catch {
                        // Fall through to return default
                      }
                    }
                    return 'Recently manufactured';
                  })()}
                </p>
              </div>
            </div>

            {isOwned && product.currentOwner && product.currentOwner !== 'customer' && (
              <div className="flex items-start">
                <User className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-500">Current Owner</p>
                  <p className="font-medium">{product.currentOwner}</p>
                </div>
              </div>
            )}

            <div className="flex items-start">
              <Clock className="w-5 h-5 text-gray-400 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="font-medium capitalize">
                  {(() => {
                    if (!product.status) {
                      // Try to infer status from other fields
                      if (product.isStolen) return 'Stolen';
                      if (product.ownershipHash) return 'Owned';
                      if (product.currentLocation === 'luxuryretail' || product.currentLocation === 'LuxuryRetailMSP') return 'In Store';
                      return 'Available';
                    }
                    return product.status.toLowerCase().replace(/_/g, ' ');
                  })()}
                </p>
              </div>
            </div>
          </div>

          {/* QR Code Display */}
          {product.qrCode && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg text-center">
              <QrCode className="w-6 h-6 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-2">Product QR Code</p>
              <img 
                src={api.getQRCodeUrl(productId)} 
                alt="Product QR Code"
                className="mx-auto max-w-[200px]"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            <Link
              href={`/certificate/${productId}`}
              className="flex items-center justify-center w-full py-2 border border-luxury-gold text-luxury-gold rounded-md hover:bg-luxury-cream"
            >
              <Award className="w-4 h-4 mr-2" />
              View Birth Certificate
            </Link>

            {isAvailable && !showClaimForm && (
              <button
                onClick={() => setShowClaimForm(true)}
                className="w-full py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
              >
                Claim Ownership
              </button>
            )}

            {isOwned && product.status !== 'STOLEN' && (
              <>
                <Link
                  href={`/transfer/${productId}`}
                  className="block w-full text-center py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
                >
                  Transfer Ownership
                </Link>
                <Link
                  href={`/report-stolen/${productId}`}
                  className="block w-full text-center py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Report as Stolen
                </Link>
              </>
            )}

            {isOwned && product.status === 'STOLEN' && (
              <Link
                href={`/recover/${productId}`}
                className="block w-full text-center py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Mark as Recovered
              </Link>
            )}
          </div>
        </div>

        {/* Claim Ownership Form */}
        {showClaimForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-4">
            <h3 className="text-lg font-semibold mb-4">Claim Ownership</h3>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transfer Code *
                </label>
                <input
                  type="text"
                  value={transferCode}
                  onChange={(e) => setTransferCode(e.target.value)}
                  placeholder="Enter the transfer code from seller"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email for ownership records"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Create Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set your password for future transfers"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Create 4-Digit PIN *
                </label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">You'll need these credentials for future transfers</p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleClaimOwnership}
                  disabled={claiming}
                  className="flex-1 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
                >
                  {claiming ? 'Processing...' : 'Confirm Ownership'}
                </button>
                <button
                  onClick={() => {
                    setShowClaimForm(false)
                    setError(null)
                  }}
                  className="flex-1 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supply Chain History */}
        {supplyChainHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-4">
            <h3 className="text-lg font-semibold mb-4">Supply Chain Journey</h3>
            <div className="space-y-3">
              {supplyChainHistory.map((event, index) => (
                <div key={index} className="border-l-2 border-luxury-gold pl-4">
                  <p className="font-medium">{event.event || 'Status Update'}</p>
                  <p className="text-sm text-gray-600">{event.description || `Location: ${event.location}`}</p>
                  <p className="text-xs text-gray-500">
                    {(() => {
                      if (event.timestamp) {
                        try {
                          const date = new Date(event.timestamp);
                          if (!isNaN(date.getTime())) {
                            return date.toLocaleString();
                          }
                        } catch {
                          // Fall through
                        }
                      }
                      return 'Recent activity';
                    })()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ownership History */}
        {product.ownershipHistory && product.ownershipHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-4">
            <h3 className="text-lg font-semibold mb-4">Ownership History</h3>
            <div className="space-y-3">
              {product.ownershipHistory.map((record, index) => (
                <div key={index} className="border-l-2 border-luxury-gold pl-4">
                  <p className="font-medium">{record.owner}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(record.timestamp).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}