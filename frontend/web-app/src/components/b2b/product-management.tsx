'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, QrCode, Send, Eye, Download, Layers, CheckCircle, AlertCircle } from 'lucide-react'
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
  materialId: string
  type: string
  source: string
  supplier?: string
  batch: string
  quality?: string
  quantity: number // This is actually the available quantity
  totalReceived?: number
  used?: number
  owner?: string
  verification?: string
}

export function ProductManagement() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const api = useApi()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [showAddMaterialToProduct, setShowAddMaterialToProduct] = useState(false)
  const [showQualityForm, setShowQualityForm] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrProduct, setQrProduct] = useState<Product | null>(null)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [transferQuantity, setTransferQuantity] = useState(1)
  const [materialFilter, setMaterialFilter] = useState<'all' | 'available' | 'unavailable'>('all')
  
  // New states for enhanced UI
  const [viewMode, setViewMode] = useState<'all' | 'products' | 'materials'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentProductPage, setCurrentProductPage] = useState(1)
  const [currentMaterialPage, setCurrentMaterialPage] = useState(1)
  const itemsPerPage = 5

  // Form state for products
  const [productFormData, setProductFormData] = useState({
    brand: '',
    name: '',
    type: '',
    serialNumber: ''
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

  // Form state for adding material to product
  const [addMaterialFormData, setAddMaterialFormData] = useState({
    productId: '',
    materialId: '',
    type: '',
    source: '',
    supplier: '',
    batch: '',
    verification: ''
  })

  // Form state for quality checkpoint
  const [qualityFormData, setQualityFormData] = useState({
    productId: '',
    checkpointId: '',
    type: '',
    inspector: '',
    location: '',
    passed: true,
    details: ''
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

  // Filter materials based on selected filter and search
  const filteredMaterials = materials?.filter(material => {
    const matchesFilter = materialFilter === 'all' || 
      (materialFilter === 'available' && material.quantity > 0) ||
      (materialFilter === 'unavailable' && material.quantity === 0)
    
    const matchesSearch = !searchQuery || 
      material.materialId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      material.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      material.batch?.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesFilter && matchesSearch
  }) || []
  
  // Filter products based on search
  const filteredProducts = products?.filter(product => {
    const matchesSearch = !searchQuery ||
      product.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.type?.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesSearch
  }) || []
  
  // Pagination logic
  const paginatedProducts = filteredProducts.slice(
    (currentProductPage - 1) * itemsPerPage,
    currentProductPage * itemsPerPage
  )
  const totalProductPages = Math.ceil(filteredProducts.length / itemsPerPage)
  
  const paginatedMaterials = filteredMaterials.slice(
    (currentMaterialPage - 1) * itemsPerPage,
    currentMaterialPage * itemsPerPage
  )
  const totalMaterialPages = Math.ceil(filteredMaterials.length / itemsPerPage)

  // Calculate statistics
  const materialStats = {
    total: materials?.length || 0,
    available: materials?.filter(m => m.quantity > 0).length || 0,
    unavailable: materials?.filter(m => m.quantity === 0).length || 0,
    totalQuantity: materials?.reduce((sum, m) => sum + (m.totalReceived || 0), 0) || 0,
    usedQuantity: materials?.reduce((sum, m) => sum + (m.used || 0), 0) || 0,
    availableQuantity: materials?.reduce((sum, m) => sum + m.quantity, 0) || 0
  }

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setShowTransferDialog(false)
      setSelectedMaterial(null)
      setTransferQuantity(1)
      alert(`Material transfer initiated. Transfer ID: ${data.transferId}. Awaiting manufacturer confirmation.`)
    },
    onError: (error: any) => {
      alert(`Transfer failed: ${error.response?.data?.error || error.message}`)
    }
  })

  // Confirm material receipt (Manufacturer only)
  const confirmMaterialReceiptMutation = useMutation({
    mutationFn: async ({ materialId, transferId }: { 
      materialId: string; 
      transferId: string 
    }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/materials/${materialId}/confirm-receipt`, {
        transferId
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      alert('Material receipt confirmed successfully!')
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
        serialNumber: ''
      })
      
      // If QR code was generated, show it
      if (data.qrCode) {
        setQrProduct(data)
        setShowQRModal(true)
      }
    }
  })

  // Add material to product mutation (Manufacturer only)
  const addMaterialToProductMutation = useMutation({
    mutationFn: async (materialData: typeof addMaterialFormData) => {
      if (!api) throw new Error('API not initialized')
      const { productId, ...material } = materialData
      const { data } = await api.post(`/api/supply-chain/products/${productId}/materials`, material)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowAddMaterialToProduct(false)
      setAddMaterialFormData({
        productId: '',
        materialId: '',
        type: '',
        source: '',
        supplier: '',
        batch: '',
        verification: ''
      })
      alert('Material added to product successfully!')
    }
  })

  // Add quality checkpoint mutation
  const addQualityCheckpointMutation = useMutation({
    mutationFn: async (checkpointData: typeof qualityFormData) => {
      if (!api) throw new Error('API not initialized')
      const { productId, ...checkpoint } = checkpointData
      const { data } = await api.post(`/api/supply-chain/products/${productId}/quality`, checkpoint)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowQualityForm(false)
      setQualityFormData({
        productId: '',
        checkpointId: '',
        type: '',
        inspector: '',
        location: '',
        passed: true,
        details: ''
      })
      alert('Quality checkpoint added successfully!')
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
            {isSupplier ? 'Material Management' : 'Product & Material Management'}
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
        <div className="flex gap-2">
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
      </div>
      
      {/* View Mode Tabs and Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* View Mode Tabs - Only for Manufacturer/Retailer */}
          {!isSupplier && (
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('all')}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  viewMode === 'all'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setViewMode('products')}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  viewMode === 'products'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Products Only
              </button>
              <button
                onClick={() => setViewMode('materials')}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  viewMode === 'materials'
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Materials Only
              </button>
            </div>
          )}
          
          {/* Search Box */}
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder={isSupplier ? "Search materials..." : "Search products or materials..."}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentProductPage(1)
                  setCurrentMaterialPage(1)
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-luxury-gold focus:border-luxury-gold"
              />
              <Package className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>
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

            {/* Note about materials */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Materials can be added after product creation. 
                Ensure materials have been transferred and received first.
              </p>
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

      {/* Add Material to Product Form (Manufacturer) */}
      {showAddMaterialToProduct && isManufacturer && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Add Material to Product</h3>
          <p className="text-sm text-gray-600 mb-4">Product ID: {addMaterialFormData.productId}</p>
          <form onSubmit={(e) => {
            e.preventDefault()
            addMaterialToProductMutation.mutate(addMaterialFormData)
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Material ID</label>
                <select
                  value={addMaterialFormData.materialId}
                  onChange={(e) => {
                    const material = materials?.find(m => m.id === e.target.value)
                    setAddMaterialFormData({ 
                      ...addMaterialFormData, 
                      materialId: e.target.value,
                      type: material?.type || '',
                      source: material?.source || '',
                      supplier: material?.supplier || 'italianleather',
                      batch: material?.batch || ''
                    })
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                  disabled={!materials?.some(m => m.quantity > 0)}
                >
                  <option value="">
                    {materials?.some(m => m.quantity > 0) 
                      ? "Select material" 
                      : "No materials available (receive materials first)"}
                  </option>
                  {materials?.filter(m => m.quantity > 0).map(material => (
                    <option key={material.id} value={material.id}>
                      {material.id} - {material.type} (Batch: {material.batch}, Available: {material.quantity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Verification</label>
                <input
                  type="text"
                  value={addMaterialFormData.verification}
                  onChange={(e) => setAddMaterialFormData({ ...addMaterialFormData, verification: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., verified"
                  required
                />
              </div>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
                <p className="text-sm text-yellow-800">
                  Only materials that have been transferred to you and confirmed can be added.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddMaterialToProduct(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addMaterialToProductMutation.isPending}
                className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
              >
                {addMaterialToProductMutation.isPending ? 'Adding...' : 'Add Material'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quality Checkpoint Form */}
      {showQualityForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Add Quality Checkpoint</h3>
          <p className="text-sm text-gray-600 mb-4">Product ID: {qualityFormData.productId}</p>
          <form onSubmit={(e) => {
            e.preventDefault()
            addQualityCheckpointMutation.mutate(qualityFormData)
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Checkpoint ID</label>
                <input
                  type="text"
                  value={qualityFormData.checkpointId}
                  onChange={(e) => setQualityFormData({ ...qualityFormData, checkpointId: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., QC-001"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type/Stage</label>
                <select
                  value={qualityFormData.type}
                  onChange={(e) => setQualityFormData({ ...qualityFormData, type: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                >
                  <option value="">Select stage</option>
                  <option value="material-inspection">Material Inspection</option>
                  <option value="assembly">Assembly</option>
                  <option value="finishing">Finishing</option>
                  <option value="final-inspection">Final Inspection</option>
                  <option value="packaging">Packaging</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Inspector</label>
                <input
                  type="text"
                  value={qualityFormData.inspector}
                  onChange={(e) => setQualityFormData({ ...qualityFormData, inspector: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="Inspector name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input
                  type="text"
                  value={qualityFormData.location}
                  onChange={(e) => setQualityFormData({ ...qualityFormData, location: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., Workshop Floor 2"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={qualityFormData.passed === true}
                    onChange={() => setQualityFormData({ ...qualityFormData, passed: true })}
                    className="mr-2 text-luxury-gold focus:ring-luxury-gold"
                  />
                  <span className="text-sm">Passed</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={qualityFormData.passed === false}
                    onChange={() => setQualityFormData({ ...qualityFormData, passed: false })}
                    className="mr-2 text-luxury-gold focus:ring-luxury-gold"
                  />
                  <span className="text-sm">Failed</span>
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Details/Notes</label>
              <textarea
                value={qualityFormData.details}
                onChange={(e) => setQualityFormData({ ...qualityFormData, details: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                rows={3}
                placeholder="Quality check details and observations"
              />
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQualityForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addQualityCheckpointMutation.isPending}
                className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
              >
                {addQualityCheckpointMutation.isPending ? 'Adding...' : 'Add Checkpoint'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Materials List (Supplier & Manufacturer) */}
      {(isSupplier || isManufacturer) && materials && materials.length > 0 && (viewMode === 'all' || viewMode === 'materials') && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Materials Inventory</h3>
              <div className="flex items-center gap-4">
                {/* Statistics */}
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span className="px-2 py-1 bg-gray-100 rounded">
                    Total: {materialStats.total}
                  </span>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                    Available: {materialStats.available}
                  </span>
                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                    Unavailable: {materialStats.unavailable}
                  </span>
                </div>
                
                {/* Filter Buttons */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setMaterialFilter('all')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      materialFilter === 'all' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setMaterialFilter('available')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      materialFilter === 'available' 
                        ? 'bg-white text-green-700 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Available
                  </button>
                  <button
                    onClick={() => setMaterialFilter('unavailable')}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      materialFilter === 'unavailable' 
                        ? 'bg-white text-red-700 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Zero Qty
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Summary Statistics */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Total Received:</span>
                <span className="ml-2 font-semibold">{materialStats.totalQuantity} units</span>
              </div>
              <div>
                <span className="text-gray-500">Used:</span>
                <span className="ml-2 font-semibold">{materialStats.usedQuantity} units</span>
              </div>
              <div>
                <span className="text-gray-500">Available:</span>
                <span className="ml-2 font-semibold text-green-600">{materialStats.availableQuantity} units</span>
              </div>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {paginatedMaterials.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>No materials found with current filter</p>
                <button
                  onClick={() => setMaterialFilter('all')}
                  className="mt-2 text-sm text-luxury-gold hover:underline"
                >
                  Show all materials
                </button>
              </div>
            ) : (
              paginatedMaterials.map((material) => (
              <div key={material.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 rounded-lg">
                      <Layers className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">{material.type}</h4>
                      <p className="text-sm text-gray-600">
                        ID: {material.materialId || material.id} • Batch: {material.batch}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-gray-500">Total Received:</span>
                          <span className="ml-1 font-semibold text-gray-700">{material.totalReceived || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Used:</span>
                          <span className="ml-1 font-semibold text-gray-700">{material.used || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Available:</span>
                          <span className="ml-1 font-semibold text-green-600">{material.quantity || 0}</span>
                        </div>
                      </div>
                      {material.quantity === 0 && (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ No available quantity (may have pending transfers)
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {isSupplier && (
                    <button
                      onClick={() => {
                        if (material.quantity === 0) {
                          alert('No available quantity to transfer. Check if there are pending transfers.')
                          return
                        }
                        setSelectedMaterial(material)
                        setTransferQuantity(Math.min(1, material.quantity))
                        setShowTransferDialog(true)
                      }}
                      disabled={material.quantity === 0}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md ${
                        material.quantity > 0 
                          ? 'bg-luxury-gold text-white hover:bg-luxury-dark' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      Transfer to Manufacturer
                    </button>
                  )}
                </div>
              </div>
            )))}
          </div>
          
          {/* Pagination Controls for Materials */}
          {totalMaterialPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentMaterialPage - 1) * itemsPerPage) + 1} to{' '}
                {Math.min(currentMaterialPage * itemsPerPage, filteredMaterials.length)} of{' '}
                {filteredMaterials.length} materials
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentMaterialPage(Math.max(1, currentMaterialPage - 1))}
                  disabled={currentMaterialPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {[...Array(totalMaterialPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentMaterialPage(i + 1)}
                    className={`px-3 py-1 text-sm border rounded ${
                      currentMaterialPage === i + 1
                        ? 'bg-luxury-gold text-white border-luxury-gold'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentMaterialPage(Math.min(totalMaterialPages, currentMaterialPage + 1))}
                  disabled={currentMaterialPage === totalMaterialPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Products List (Manufacturer & Retailer) */}
      {!isSupplier && filteredProducts.length > 0 && (viewMode === 'all' || viewMode === 'products') && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Products</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {paginatedProducts.map((product) => (
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
                      {product.createdAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          Created: {format(new Date(product.createdAt), 'MMM dd, yyyy HH:mm')}
                        </p>
                      )}
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
                    {isManufacturer && product.currentOwner === user?.organization && (
                      <>
                        <button
                          onClick={() => {
                            setAddMaterialFormData({ ...addMaterialFormData, productId: product.id })
                            setShowAddMaterialToProduct(true)
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          title="Add Material"
                        >
                          <Layers className="w-3 h-3" />
                          Add Material
                        </button>
                        <button
                          onClick={() => {
                            setQualityFormData({ ...qualityFormData, productId: product.id })
                            setShowQualityForm(true)
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          title="Add Quality Check"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Quality
                        </button>
                      </>
                    )}
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
          
          {/* Pagination Controls for Products */}
          {totalProductPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentProductPage - 1) * itemsPerPage) + 1} to{' '}
                {Math.min(currentProductPage * itemsPerPage, filteredProducts.length)} of{' '}
                {filteredProducts.length} products
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentProductPage(Math.max(1, currentProductPage - 1))}
                  disabled={currentProductPage === 1}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {[...Array(totalProductPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentProductPage(i + 1)}
                    className={`px-3 py-1 text-sm border rounded ${
                      currentProductPage === i + 1
                        ? 'bg-luxury-gold text-white border-luxury-gold'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentProductPage(Math.min(totalProductPages, currentProductPage + 1))}
                  disabled={currentProductPage === totalProductPages}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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

      {/* Material Transfer Dialog */}
      {showTransferDialog && selectedMaterial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Transfer Material</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Material: <span className="font-semibold">{selectedMaterial.type}</span></p>
                <p className="text-sm text-gray-600">ID: <span className="font-semibold">{selectedMaterial.materialId || selectedMaterial.id}</span></p>
                <p className="text-sm text-gray-600">Batch: <span className="font-semibold">{selectedMaterial.batch}</span></p>
                <p className="text-sm text-gray-600 mt-2">Available Quantity: <span className="font-semibold text-green-600">{selectedMaterial.quantity}</span></p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transfer Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedMaterial.quantity}
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(Math.min(parseInt(e.target.value) || 1, selectedMaterial.quantity))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-luxury-gold focus:border-luxury-gold"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum: {selectedMaterial.quantity} units
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transfer To
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-luxury-gold focus:border-luxury-gold"
                  defaultValue="craftworkshop"
                >
                  <option value="craftworkshop">Craft Workshop (Manufacturer)</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowTransferDialog(false)
                    setSelectedMaterial(null)
                    setTransferQuantity(1)
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    transferMaterialMutation.mutate({
                      materialId: selectedMaterial.materialId || selectedMaterial.id,
                      manufacturer: 'craftworkshop',
                      quantity: transferQuantity
                    })
                  }}
                  disabled={transferMaterialMutation.isPending}
                  className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
                >
                  {transferMaterialMutation.isPending ? 'Transferring...' : 'Transfer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}