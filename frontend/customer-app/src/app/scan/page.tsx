'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import QRScanner from '@/components/QRScanner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ScanPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const handleScan = (data: string) => {
    // Parse QR data - expected format: luxury://product/{productId}
    // or just the product ID directly
    let productId = data
    
    if (data.startsWith('luxury://product/')) {
      productId = data.replace('luxury://product/', '')
    } else if (data.startsWith('http')) {
      // Extract product ID from URL if it's a web link
      const url = new URL(data)
      const match = url.pathname.match(/\/product\/([^\/]+)/)
      if (match) {
        productId = match[1]
      }
    }

    if (productId) {
      router.push(`/verify/${productId}`)
    } else {
      setError('Invalid QR code format')
    }
  }

  const handleError = (error: string) => {
    setError(error)
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-sm w-full">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Scan Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="space-y-2">
            <button
              onClick={() => setError(null)}
              className="w-full py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="block w-full text-center py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <QRScanner
        onScan={handleScan}
        onError={handleError}
        onClose={() => router.push('/')}
      />
      
      {/* Instructions overlay */}
      <div className="fixed bottom-0 left-0 right-0 bg-white bg-opacity-90 p-4 z-60">
        <p className="text-center text-sm text-gray-600">
          Position the QR code within the frame to scan
        </p>
      </div>
    </>
  )
}