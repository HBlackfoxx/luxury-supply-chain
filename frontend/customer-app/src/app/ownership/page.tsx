'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Package, ArrowLeft, ShieldCheck, AlertTriangle } from 'lucide-react'
import { api, Product } from '@/lib/api'

export default function OwnershipPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!email) return

    try {
      setLoading(true)
      const data = await api.getOwnedProducts(email)
      setProducts(data)
      setSearched(true)
      // Save email to localStorage for convenience
      localStorage.setItem('customerEmail', email)
    } catch (err) {
      console.error('Failed to fetch products:', err)
      setProducts([])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Try to load email from localStorage
    const savedEmail = localStorage.getItem('customerEmail')
    if (savedEmail) {
      setEmail(savedEmail)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href="/" className="mr-4">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-semibold">My Products</h1>
        </div>
      </div>

      {/* Email Input */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">Find Your Products</h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter the email address you used when claiming ownership
          </p>
          
          <div className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
            />
            
            <button
              onClick={handleSearch}
              disabled={!email || loading}
              className="w-full py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Products List */}
        {searched && (
          <div className="mt-4">
            {products.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-6 text-center">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No products found for this email</p>
                <p className="text-sm text-gray-500 mt-2">
                  Make sure you entered the correct email address
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Your Products ({products.length})
                </h3>
                
                {products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/verify/${product.id}`}
                    className="block bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">
                          {product.name}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {product.description}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Serial: {product.serialNumber}
                        </p>
                      </div>
                      
                      <div className="ml-4">
                        {product.status === 'STOLEN' ? (
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        product.status === 'OWNED' 
                          ? 'bg-green-100 text-green-800'
                          : product.status === 'STOLEN'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {product.status}
                      </span>
                      
                      <span className="text-luxury-gold">
                        View Details →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}