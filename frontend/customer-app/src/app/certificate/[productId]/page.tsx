'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, BirthCertificate, Product } from '@/lib/api'
import { 
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle,
  XCircle,
  User,
  Package,
  FileText,
  Download,
  Shield
} from 'lucide-react'

export default function CertificatePage() {
  const params = useParams()
  const productId = params.productId as string
  
  const [product, setProduct] = useState<Product | null>(null)
  const [certificate, setCertificate] = useState<BirthCertificate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (productId) {
      fetchCertificate()
    }
  }, [productId])

  const fetchCertificate = async () => {
    try {
      setLoading(true)
      const [productData, certData] = await Promise.all([
        api.verifyProduct(productId),
        api.getBirthCertificate(productId)
      ])
      setProduct(productData)
      setCertificate(certData)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load certificate')
    } finally {
      setLoading(false)
    }
  }

  const downloadCertificate = () => {
    // In production, this would generate a PDF
    const certText = `
CERTIFICATE OF AUTHENTICITY
==========================

Product: ${product?.name}
Serial Number: ${product?.serialNumber}
Manufacturing Date: ${certificate?.manufacturingDate}
Manufacturer: ${certificate?.manufacturer}

This certifies that the above product is genuine and authentic.

Verification ID: ${certificate?.authenticityCertificate}
    `.trim()

    const blob = new Blob([certText], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificate-${productId}.txt`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading certificate...</p>
        </div>
      </div>
    )
  }

  if (error || !certificate || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-sm w-full">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-center mb-2">Certificate Not Found</h2>
          <p className="text-gray-600 text-center mb-4">{error || 'Unable to load certificate'}</p>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href={`/verify/${productId}`} className="mr-4">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-lg font-semibold">Birth Certificate</h1>
        </div>
      </div>

      {/* Certificate Header */}
      <div className="max-w-md mx-auto mt-4 mx-4">
        <div className="bg-gradient-to-r from-luxury-gold to-luxury-dark text-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-center mb-4">
            <Award className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Certificate of Authenticity</h2>
          <p className="text-center text-sm opacity-90">Digital Birth Certificate</p>
        </div>

        {/* Product Information */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Package className="w-5 h-5 mr-2 text-luxury-gold" />
            Product Details
          </h3>
          
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Product Name</p>
              <p className="font-medium">{product.name}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Serial Number</p>
              <p className="font-mono font-medium">{product.serialNumber}</p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Manufacturing Date</p>
              <p className="font-medium">
                {new Date(certificate.manufacturingDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-500">Manufacturer</p>
              <p className="font-medium">{certificate.manufacturer}</p>
            </div>

            {certificate.craftsman && (
              <div>
                <p className="text-sm text-gray-500">Craftsman</p>
                <p className="font-medium">{certificate.craftsman}</p>
              </div>
            )}
          </div>
        </div>

        {/* Materials */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-luxury-gold" />
            Materials & Components
          </h3>
          
          <div className="flex flex-wrap gap-2">
            {certificate.materials.map((material, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-luxury-cream text-luxury-dark rounded-full text-sm"
              >
                {material}
              </span>
            ))}
          </div>
        </div>

        {/* Authenticity Certificate */}
        <div className="bg-white rounded-lg shadow-md p-6 mt-4">
          <h3 className="text-lg font-semibold mb-4">Blockchain Verification</h3>
          
          {certificate.certificateHash && (
            <div className="bg-gray-50 rounded p-4 mb-3">
              <p className="text-xs text-gray-500 mb-2">Certificate Hash (SHA-256)</p>
              <p className="font-mono text-xs break-all">{certificate.certificateHash}</p>
            </div>
          )}
          
          <div className="bg-gray-50 rounded p-4">
            <p className="text-xs text-gray-500 mb-2">Authenticity ID</p>
            <p className="font-mono text-xs break-all">{certificate.authenticityCertificate}</p>
          </div>
          
          <p className="text-xs text-gray-600 mt-3">
            This certificate is permanently recorded on the blockchain and cannot be altered or forged.
          </p>
        </div>

        {/* Download Button */}
        <div className="mt-6 mb-8">
          <button
            onClick={downloadCertificate}
            className="w-full py-3 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark flex items-center justify-center"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Certificate
          </button>
        </div>
      </div>
    </div>
  )
}