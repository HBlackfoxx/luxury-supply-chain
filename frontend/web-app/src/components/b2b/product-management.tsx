'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, QrCode, Send, Eye, Download, Layers } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'

interface Product {
  id: string
  brand: string
  name: string
  type: string
  serialNumber: string
  status: string
  currentOwner: string
  currentLocation: string
  createdAt: string
  materials?: Material[]
  qrCode?: {
    url: string
    dataUrl?: string
    data?: any
  }
}

interface Material {
  id: string
  type: string
  source: string
  supplier: string
  batch: string
  quality?: string
  quantity?: number
  verification?: string
}

export function ProductManagement() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const api = useApi()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrProduct, setQrProduct] = useState<Product | null>(null)

  // Form state for products
  const [productFormData, setProductFormData] = useState({
    brand: '',
    name: '',
    type: '',
    serialNumber: '',
    materials: [] as Material[]
  })

  // Form state for materials
  const [materialFormData, setMaterialFormData] = useState({
    materialId: '',
    type: '',
    source: '',
    batch: '',
    quality: '',
    quantity: 1
  })

  // Determine user's role based on organization
  const isSupplier = user?.organization === 'italianleather'
  const isManufacturer = user?.organization === 'craftworkshop'
  const isRetailer = user?.organization === 'luxuryretail'

  // Fetch products (for manufacturer and retailer)
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products', user?.organization],
    queryFn: async () => {
      if (!api || isSupplier) return [] // Suppliers don't see products
      const { data } = await api.get<Product[]>('/api/supply-chain/products')
      return data
    },
    enabled: !!api && !isSupplier
  })

  // Fetch materials (for supplier and manufacturer)
  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ['materials', user?.organization],
    queryFn: async () => {
      if (!api || isRetailer) return [] // Retailers don't see raw materials
      const { data } = await api.get<Material[]>('/api/supply-chain/materials')
      return data
    },
    enabled: !!api && !isRetailer
  })

  // Create material mutation (Supplier only)
  const createMaterialMutation = useMutation({
    mutationFn: async (materialData: typeof materialFormData) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post('/api/supply-chain/materials', materialData)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setShowMaterialForm(false)
      setMaterialFormData({
        materialId: '',
        type: '',
        source: '',
        batch: '',
        quality: '',
        quantity: 1
      })
    }
  })

  // Transfer material to manufacturer (Supplier only)
  const transferMaterialMutation = useMutation({
    mutationFn: async ({ materialId, manufacturer, quantity }: { 
      materialId: string; 
      manufacturer: string; 
      quantity: number 
    }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post('/api/supply-chain/materials/transfer', {
        materialId,
        manufacturer,
        quantity
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    }
  })

  // Create product mutation (Manufacturer only)
  const createProductMutation = useMutation({
    mutationFn: async (productData: typeof productFormData) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post('/api/supply-chain/products', productData)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowCreateForm(false)
      setProductFormData({
        brand: '',
        name: '',
        type: '',
        serialNumber: '',
        materials: []
      })
      
      // If QR code was generated, show it
      if (data.qrCode) {
        setQrProduct(data)
        setShowQRModal(true)
      }
    }
  })

  // Transfer product mutation (Manufacturer to Retailer, Retailer to Customer)
  const transferProductMutation = useMutation({
    mutationFn: async ({ productId, toOrganization }: { 
      productId: string; 
      toOrganization: string 
    }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post('/api/supply-chain/transfer/initiate', {
        productId,
        toOrganization,
        transferType: 'standard'
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    }
  })

  const handleCreateMaterial = (e: React.FormEvent) => {
    e.preventDefault()
    createMaterialMutation.mutate(materialFormData)
  }

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault()
    createProductMutation.mutate(productFormData)
  }

  const handleViewQR = async (product: Product) => {
    if (product.qrCode) {
      setQrProduct(product)
      setShowQRModal(true)
    } else {
      // Try to fetch product with QR
      if (!api) return
      const { data } = await api.get(`/api/supply-chain/products/${product.id}`)
      if (data.qrCode) {
        setQrProduct(data)
        setShowQRModal(true)
      }
    }
  }

  const downloadQR = (product: Product) => {
    if (!product.qrCode?.dataUrl) return
    
    const link = document.createElement('a')
    link.download = `QR-${product.id}.png`
    link.href = product.qrCode.dataUrl
    link.click()
  }

  const isLoading = productsLoading || materialsLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isSupplier ? 'Material Management' : 'Product Management'}
          </h2>
          <p className="text-gray-600">
            {isSupplier 
              ? 'Create and manage raw materials'
              : isManufacturer
              ? 'Create products from materials'
              : 'Manage product inventory'
            }
          </p>
        </div>
        {isSupplier && (
          <button
            onClick={() => setShowMaterialForm(!showMaterialForm)}
            className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Material
          </button>
        )}
        {isManufacturer && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Product
          </button>
        )}
      </div>

      {/* Create Material Form (Supplier) */}
      {showMaterialForm && isSupplier && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Create New Material</h3>
          <form onSubmit={handleCreateMaterial} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Material ID</label>
                <input
                  type="text"
                  value={materialFormData.materialId}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, materialId: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., LEATHER-001"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={materialFormData.type}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, type: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                >
                  <option value="">Select type</option>
                  <option value="leather">Leather</option>
                  <option value="fabric">Fabric</option>
                  <option value="metal">Metal</option>
                  <option value="thread">Thread</option>
                  <option value="zipper">Zipper</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Source</label>
                <input
                  type="text"
                  value={materialFormData.source}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, source: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., Tuscany, Italy"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Batch Number</label>
                <input
                  type="text"
                  value={materialFormData.batch}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, batch: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., BATCH-2024-001"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quality Grade</label>
                <select
                  value={materialFormData.quality}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, quality: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                >
                  <option value="">Select quality</option>
                  <option value="premium">Premium</option>
                  <option value="standard">Standard</option>
                  <option value="basic">Basic</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity</label>
                <input
                  type="number"
                  value={materialFormData.quantity}
                  onChange={(e) => setMaterialFormData({ ...materialFormData, quantity: parseInt(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  min="1"
                  required
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMaterialForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMaterialMutation.isPending}
                className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
              >
                {createMaterialMutation.isPending ? 'Creating...' : 'Create Material'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Product Form (Manufacturer) */}
      {showCreateForm && isManufacturer && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Create New Product</h3>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Brand</label>
                <input
                  type="text"
                  value={productFormData.brand}
                  onChange={(e) => setProductFormData({ ...productFormData, brand: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., LuxeBags"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Product Name</label>
                <input
                  type="text"
                  value={productFormData.name}
                  onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., Milano Handbag"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={productFormData.type}
                  onChange={(e) => setProductFormData({ ...productFormData, type: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                >
                  <option value="">Select type</option>
                  <option value="handbag">Handbag</option>
                  <option value="wallet">Wallet</option>
                  <option value="accessory">Accessory</option>
                  <option value="luggage">Luggage</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Serial Number</label>
                <input
                  type="text"
                  value={productFormData.serialNumber}
                  onChange={(e) => setProductFormData({ ...productFormData, serialNumber: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="Optional - auto-generated if empty"
                />
              </div>
            </div>

            {/* Materials selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Materials Used
              </label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                {materials && materials.length > 0 ? (
                  <div className="space-y-2">
                    {materials.map((material) => (
                      <label key={material.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={productFormData.materials.some(m => m.id === material.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setProductFormData({
                                ...productFormData,
                                materials: [...productFormData.materials, material]
                              })
                            } else {
                              setProductFormData({
                                ...productFormData,
                                materials: productFormData.materials.filter(m => m.id !== material.id)
                              })
                            }
                          }}
                          className="rounded border-gray-300 text-luxury-gold focus:ring-luxury-gold"
                        />
                        <span className="text-sm">
                          {material.type} - {material.id} (Batch: {material.batch})
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No materials available</p>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createProductMutation.isPending}
                className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
              >
                {createProductMutation.isPending ? 'Creating...' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Materials List (Supplier & Manufacturer) */}
      {(isSupplier || isManufacturer) && materials && materials.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Materials</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {materials.map((material) => (
              <div key={material.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 rounded-lg">
                      <Layers className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{material.type}</h4>
                      <p className="text-sm text-gray-600">
                        ID: {material.id} • Batch: {material.batch}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Source: {material.source} • Quality: {material.quality || 'Standard'}
                      </p>
                    </div>
                  </div>
                  
                  {isSupplier && (
                    <button
                      onClick={() => transferMaterialMutation.mutate({
                        materialId: material.id,
                        manufacturer: 'craftworkshop',
                        quantity: material.quantity || 1
                      })}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
                    >
                      <Send className="w-4 h-4" />
                      Transfer to Manufacturer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products List (Manufacturer & Retailer) */}
      {!isSupplier && products && products.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Products</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {products.map((product) => (
              <div key={product.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-luxury-gold/10 rounded-lg">
                      <Package className="w-6 h-6 text-luxury-gold" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{product.name}</h4>
                      <p className="text-sm text-gray-600">
                        {product.brand} • {product.type} • SN: {product.serialNumber}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Status: <span className="font-medium">{product.status}</span> • 
                        Location: <span className="font-medium">{product.currentLocation}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewQR(product)}
                      className="p-2 text-gray-600 hover:text-luxury-gold hover:bg-luxury-gold/10 rounded-lg transition-colors"
                      title="View QR Code"
                    >
                      <QrCode className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setSelectedProduct(product)}
                      className="p-2 text-gray-600 hover:text-luxury-gold hover:bg-luxury-gold/10 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    {user?.organization === product.currentOwner && (
                      <button
                        onClick={() => {
                          const toOrg = isManufacturer ? 'luxuryretail' : 'customer'
                          transferProductMutation.mutate({
                            productId: product.id,
                            toOrganization: toOrg
                          })
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
                      >
                        <Send className="w-4 h-4" />
                        Transfer to {isManufacturer ? 'Retailer' : 'Customer'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {isSupplier && (!materials || materials.length === 0) && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No materials created yet</p>
          <p className="text-sm text-gray-400 mt-2">Create your first material to get started</p>
        </div>
      )}

      {!isSupplier && (!products || products.length === 0) && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No products available</p>
          <p className="text-sm text-gray-400 mt-2">
            {isManufacturer 
              ? 'Create products from available materials' 
              : 'Waiting for products from manufacturer'}
          </p>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && qrProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Product QR Code</h3>
            <div className="space-y-4">
              <div className="text-center">
                {qrProduct.qrCode?.dataUrl ? (
                  <img 
                    src={qrProduct.qrCode.dataUrl} 
                    alt="QR Code" 
                    className="mx-auto"
                  />
                ) : qrProduct.qrCode?.url ? (
                  <img 
                    src={qrProduct.qrCode.url} 
                    alt="QR Code" 
                    className="mx-auto"
                  />
                ) : (
                  <p className="text-gray-500">QR Code not available</p>
                )}
              </div>
              
              <div className="text-sm text-gray-600">
                <p><strong>Product ID:</strong> {qrProduct.id}</p>
                <p><strong>Serial Number:</strong> {qrProduct.serialNumber}</p>
                <p><strong>Brand:</strong> {qrProduct.brand}</p>
              </div>
              
              <div className="flex justify-end gap-2">
                {qrProduct.qrCode?.dataUrl && (
                  <button
                    onClick={() => downloadQR(qrProduct)}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowQRModal(false)
                    setQrProduct(null)
                  }}
                  className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}