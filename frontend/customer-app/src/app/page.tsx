'use client'

import { useState } from 'react'
import { QrCode, Package, ShieldCheck, Award } from 'lucide-react'
import Link from 'next/link'

export default function HomePage() {
  const [productId, setProductId] = useState('')

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo Section */}
        <div className="text-center">
          <ShieldCheck className="w-16 h-16 mx-auto text-luxury-gold mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">Luxury Authentication</h1>
          <p className="mt-2 text-gray-600">Verify and manage your luxury products</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/scan" 
            className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <QrCode className="w-10 h-10 text-luxury-gold mb-2" />
            <span className="text-sm font-medium">Scan QR Code</span>
          </Link>

          <Link href="/ownership"
            className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <Package className="w-10 h-10 text-luxury-gold mb-2" />
            <span className="text-sm font-medium">My Products</span>
          </Link>
        </div>

        {/* Manual Entry */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">Enter Product ID</h2>
          <div className="space-y-4">
            <input
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="Enter product ID or serial number"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-luxury-gold"
            />
            <Link 
              href={`/verify/${productId}`}
              className={`block w-full text-center py-2 rounded-md transition-colors ${
                productId 
                  ? 'bg-luxury-gold text-white hover:bg-luxury-dark' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              onClick={(e) => !productId && e.preventDefault()}
            >
              Verify Product
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="text-center text-sm text-gray-600">
          <div className="flex items-center justify-center space-x-6 mt-8">
            <div className="flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1 text-luxury-gold" />
              <span>Instant Verification</span>
            </div>
            <div className="flex items-center">
              <Award className="w-4 h-4 mr-1 text-luxury-gold" />
              <span>Certificate of Authenticity</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}