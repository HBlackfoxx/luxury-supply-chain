'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, QrCode, Send, Eye, Download, Layers, CheckCircle, AlertCircle, X, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'
import { notifications } from '@/lib/notifications'
import toast from 'react-hot-toast'

interface ServiceRecord {
  id?: string
  serviceType: string
  description: string
  technician: string
  timestamp?: string
  date?: string
}

interface Batch {
  id: string
  brand: string
  productType: string
  quantity: number
  status: string
  location?: string
  materialIds?: string[]
}

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
  qualityCheckpoints?: any[]
  transferHistory?: any[]
  serviceRecords?: ServiceRecord[]
  qrCode?: {
    url: string
    dataUrl?: string
    data?: any
  }
}

interface Material {
  id: string
  materialId?: string  // Make optional since API sometimes returns one or the other
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
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [showAddMaterialToProduct, setShowAddMaterialToProduct] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrProduct, setQrProduct] = useState<Product | null>(null)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [showSellDialog, setShowSellDialog] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [transferQuantity, setTransferQuantity] = useState(1)
  const [materialFilter, setMaterialFilter] = useState<'all' | 'available' | 'unavailable'>('all')
  const [customerInfo, setCustomerInfo] = useState({
    customerId: '',
    password: '',
    pin: ''
  })
  
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
    serialNumber: '',
    materials: [] as Array<{ 
      id: string; 
      type: string;
      source: string;
      supplier: string;
      batch: string;
      verification: string;
      quantity: number;
    }>
  })
  const [selectedMaterialsForProduct, setSelectedMaterialsForProduct] = useState<Array<{
    materialId: string;
    type: string;
    batch: string;
    quantity: number;
    available: number;
  }>>([])
  const [materialToAdd, setMaterialToAdd] = useState({
    materialId: '',
    quantity: 1
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

  // Batch form state for manufacturers
  const [batchFormData, setBatchFormData] = useState({
    brand: 'LuxeBags',
    productType: '',
    quantity: 1,
    materialIds: [] as string[]
  })
  
  // State for material input with quantities
  const [materialInput, setMaterialInput] = useState('')
  const [selectedMaterials, setSelectedMaterials] = useState<{ id: string; quantity: number }[]>([])

  // Determine user's role based on organization
  const isSupplier = user?.organization === 'italianleather'
  const isManufacturer = user?.organization === 'craftworkshop'
  const isRetailer = user?.organization === 'luxuryretail'
  const isWarehouse = user?.organization === 'luxebags' // Brand acts as warehouse with dual role

  // Fetch products (for manufacturer, warehouse and retailer)
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

  // Fetch batches (for manufacturer, warehouse, and retailer)
  const { data: batches } = useQuery<Batch[]>({
    queryKey: ['batches', user?.organization],
    queryFn: async () => {
      if (!api || (!isManufacturer && !isWarehouse && !isRetailer)) return []
      const { data } = await api.get<Batch[]>('/api/supply-chain/batches')
      return data
    },
    enabled: !!api && (isManufacturer || isWarehouse || isRetailer)
  })

  // Fetch stolen products (for retailer and brand)
  const { data: stolenProducts } = useQuery({
    queryKey: ['stolen-products'],
    queryFn: async () => {
      if (!api || (!isRetailer && user?.organization !== 'luxebags')) return []
      const { data } = await api.get('/api/supply-chain/ownership/stolen')
      return data
    },
    enabled: !!api && (isRetailer || user?.organization === 'luxebags')
  })

  // Fetch service records for selected product
  const { data: serviceRecords } = useQuery({
    queryKey: ['service-records', selectedProduct?.id],
    queryFn: async () => {
      if (!api || !selectedProduct) return []
      try {
        const { data } = await api.get(`/api/supply-chain/products/${selectedProduct.id}/service-records`)
        return data
      } catch (error) {
        // Fallback: service records might be part of the product data
        return selectedProduct.serviceRecords || []
      }
    },
    enabled: !!api && !!selectedProduct?.id
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      notifications.materialCreated(materialFormData.materialId)
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
      // Invalidate all relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pending-transfers'] })
      
      // Show success notification with details
      notifications.materialTransferred(selectedMaterial?.materialId || 'Material', 'manufacturer')
      toast.success(`Transfer initiated: ${transferQuantity} units of ${selectedMaterial?.type} to manufacturer`)
      
      // Reset form
      setShowTransferDialog(false)
      setSelectedMaterial(null)
      setTransferQuantity(1)
    },
    onError: (error: any) => {
      toast.error(`Transfer failed: ${error.response?.data?.error || error.message}`)
      // Just use toast for error, notifications doesn't have error method
    }
  })

  // Note: Material receipt confirmation is handled in PendingActions component
  // to keep all pending confirmations in one place

  // Create batch mutation (Manufacturer only)
  const createBatchMutation = useMutation({
    mutationFn: async (batchData: typeof batchFormData) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post('/api/supply-chain/batches', batchData)
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      setShowBatchForm(false)
      notifications.success(`Batch ${data.batchId} created successfully!`)
      setBatchFormData({
        brand: 'LuxeBags',
        productType: '',
        quantity: 1,
        materialIds: []
      })
      setSelectedMaterials([]) // Reset selected materials
    },
    onError: (error: any) => {
      toast.error(`Failed to create batch: ${error.response?.data?.error || error.message}`)
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
      
      // Show success notification
      notifications.productCreated(data.productId)
      
      // If QR code was generated, show it with proper product details
      if (data.qrCode) {
        setQrProduct({
          id: data.productId,
          brand: productFormData.brand,
          name: productFormData.name,
          type: productFormData.type,
          serialNumber: productFormData.serialNumber,
          status: 'CREATED',
          currentOwner: user?.organization || '',
          currentLocation: user?.organization || '',
          createdAt: new Date().toISOString(),
          qrCode: data.qrCode
        })
        setShowQRModal(true)
      }
      
      // Reset form after showing modal
      setProductFormData({
        brand: '',
        name: '',
        type: '',
        serialNumber: '',
        materials: []
      })
      setSelectedMaterialsForProduct([])
      setMaterialToAdd({ materialId: '', quantity: 1 })
    }
  })

  // Complete product mutation (Manufacturer only)
  const completeProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/complete`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.success('Product marked as complete and ready for transfer!')
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

  // Quality checkpoints removed - quality is now implicit in 2-check consensus

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

  // Create birth certificate mutation (Retailer only)
  const createBirthCertificateMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/birth-certificate`)
      return data
    },
    onSuccess: () => {
      notifications.success('Birth certificate created successfully!')
    }
  })

  // Process customer return mutation (Retailer only)
  const processCustomerReturnMutation = useMutation({
    mutationFn: async ({ productId, reason }: { productId: string, reason: string }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/customer-return`, { reason })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.success('Customer return processed successfully!')
    }
  })

  // Add service record mutation (Retailer/Brand only)
  const addServiceRecordMutation = useMutation({
    mutationFn: async ({ productId, serviceType, description, technician }: any) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/service-record`, {
        serviceType,
        description,
        technician,
        date: new Date().toISOString()
      })
      return data
    },
    onSuccess: () => {
      notifications.success('Service record added successfully!')
    }
  })

  // Transfer batch mutation (Manufacturer and Warehouse)
  const transferBatchMutation = useMutation({
    mutationFn: async ({ batchId, toOrganization }: { batchId: string, toOrganization: string }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post('/api/supply-chain/batches/transfer', {
        batchId,
        toOrganization
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      notifications.success('Batch transferred successfully!')
    }
  })

  // Update batch location mutation (Warehouse only)
  const updateBatchLocationMutation = useMutation({
    mutationFn: async ({ batchId, location, status }: { batchId: string, location: string, status: string }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.put(`/api/supply-chain/batches/${batchId}/location`, {
        location,
        status
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      notifications.success('Batch location updated successfully!')
    }
  })

  // Mark for retail mutation (Retailer only)
  const markForRetailMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/retail`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.success('Product marked for retail sale!')
    }
  })

  // Take ownership mutation (Retailer only - B2C)
  const takeOwnershipMutation = useMutation({
    mutationFn: async ({ productId, purchaseLocation }: { productId: string, purchaseLocation: string }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/take-ownership`, {
        purchaseLocation
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.success('Ownership recorded on blockchain!')
    }
  })

  // Sell to customer mutation (Retailer only)
  const sellToCustomerMutation = useMutation({
    mutationFn: async ({ productId, customerId, password, pin }: { productId: string, customerId: string, password: string, pin: string }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/products/${productId}/sell`, {
        customerId,
        password,
        pin
      })
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowSellDialog(false)
      setSelectedProduct(null)
      
      // Display ownership confirmation
      if (data.ownershipHash) {
        alert(`Product sold successfully!\n\nOwnership transferred to customer.\nOwnership Hash: ${data.ownershipHash.substring(0, 10)}...\n\nCustomer can now verify ownership and transfer to others.`)
      } else {
        notifications.success('Product sold to customer successfully!')
      }
      
      setCustomerInfo({ customerId: '', password: '', pin: '' })
    },
    onError: (error: any) => {
      alert(`Failed to sell product: ${error.response?.data?.error || error.message}`)
    }
  })

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
              : isWarehouse
              ? 'Manage warehouse inventory and batch locations'
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
            <>
              <button
                onClick={() => setShowBatchForm(!showBatchForm)}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark transition-colors mr-2"
              >
                <Layers className="w-5 h-5" />
                Create Batch
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create Product
              </button>
            </>
          )}
          {isRetailer && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600 border-l-4 border-luxury-gold pl-3">
                <div className="font-medium text-gray-800">B2C Workflow:</div>
                <div className="text-xs mt-1">
                  1️⃣ Expand batch below → 2️⃣ Click "Sell to Customer" on any product
                </div>
              </div>
              {selectedProduct && (
                <button
                  onClick={() => setShowSellDialog(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark transition-colors"
                >
                  <Package className="w-5 h-5" />
                  Quick Sell
                </button>
              )}
            </div>
          )}
          {/* Warehouse status indicator */}
          {isWarehouse && (
            <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-lg">
              <Package className="w-5 h-5" />
              <span className="text-sm font-medium">
                Warehouse: {batches?.filter((b: any) => b.status === 'IN_WAREHOUSE').length || 0} batches in storage
              </span>
            </div>
          )}
        </div>
      </div>
      
      {/* View Mode Tabs and Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* View Mode Tabs - For Manufacturer/Warehouse/Retailer */}
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

      {/* Create Batch Form (Manufacturer) */}
      {showBatchForm && isManufacturer && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Create Product Batch</h3>
          <form onSubmit={(e) => {
            e.preventDefault()
            // Include material quantities in the batch data
            const batchDataWithQuantities = {
              ...batchFormData,
              materials: selectedMaterials // Pass materials with quantities
            }
            createBatchMutation.mutate(batchDataWithQuantities)
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Brand</label>
                <select
                  value={batchFormData.brand}
                  onChange={(e) => setBatchFormData({ ...batchFormData, brand: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                >
                  <option value="LuxeBags">LuxeBags</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Product Type</label>
                <input
                  type="text"
                  value={batchFormData.productType}
                  onChange={(e) => setBatchFormData({ ...batchFormData, productType: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="e.g., Handbag, Wallet"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={batchFormData.quantity}
                  onChange={(e) => setBatchFormData({ ...batchFormData, quantity: parseInt(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Materials</label>
                <div className="space-y-2">
                  {/* Material selector from available materials */}
                  <div className="flex gap-2">
                    <select
                      value={materialInput}
                      onChange={(e) => setMaterialInput(e.target.value)}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                    >
                      <option value="">Select a material</option>
                      {materials?.map((mat: any) => (
                        <option key={mat.materialId} value={mat.materialId}>
                          {mat.materialId} - {mat.type} (Available: {mat.available})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (materialInput && !selectedMaterials.find(m => m.id === materialInput)) {
                          setSelectedMaterials([...selectedMaterials, { id: materialInput, quantity: 1 }])
                          setBatchFormData({ 
                            ...batchFormData, 
                            materialIds: [...batchFormData.materialIds, materialInput]
                          })
                          setMaterialInput('')
                        }
                      }}
                      className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
                    >
                      Add Material
                    </button>
                  </div>
                  
                  {/* Selected materials with quantities */}
                  {selectedMaterials.length > 0 && (
                    <div className="border rounded-md p-3 space-y-2">
                      <p className="text-sm font-medium text-gray-700">Selected Materials:</p>
                      {selectedMaterials.map((mat, index) => (
                        <div key={mat.id} className="flex items-center gap-2">
                          <span className="flex-1 text-sm">{mat.id}</span>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={mat.quantity}
                            onChange={(e) => {
                              const newMaterials = [...selectedMaterials]
                              newMaterials[index].quantity = parseFloat(e.target.value) || 1
                              setSelectedMaterials(newMaterials)
                            }}
                            className="w-24 rounded-md border-gray-300 text-sm"
                            placeholder="Qty"
                          />
                          <span className="text-sm text-gray-500">units</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMaterials(selectedMaterials.filter((_, i) => i !== index))
                              setBatchFormData({
                                ...batchFormData,
                                materialIds: batchFormData.materialIds.filter(id => id !== mat.id)
                              })
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Add materials and specify quantities used for this batch</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBatchForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createBatchMutation.isPending}
                className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
              >
                {createBatchMutation.isPending ? 'Creating...' : 'Create Batch'}
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

            {/* Materials Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Add Materials (Optional)</label>
              
              {/* Material selector */}
              <div className="flex gap-2">
                <select
                  value={materialToAdd.materialId}
                  onChange={(e) => {
                    const mat = materials?.find(m => m.id === e.target.value)
                    setMaterialToAdd({ 
                      materialId: e.target.value, 
                      quantity: 1 
                    })
                  }}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                >
                  <option value="">Select material...</option>
                  {materials?.filter(m => m.quantity > 0).map(material => (
                    <option key={material.id} value={material.id}>
                      {material.materialId} - {material.type} (Available: {material.quantity})
                    </option>
                  ))}
                </select>
                
                <input
                  type="number"
                  value={materialToAdd.quantity}
                  onChange={(e) => setMaterialToAdd({ ...materialToAdd, quantity: parseFloat(e.target.value) || 1 })}
                  className="w-24 rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="1"
                  min="0.01"
                  step="0.01"
                />
                
                <button
                  type="button"
                  onClick={() => {
                    if (materialToAdd.materialId && materialToAdd.quantity > 0) {
                      const mat = materials?.find(m => m.id === materialToAdd.materialId)
                      if (mat && mat.quantity >= materialToAdd.quantity) {
                        setSelectedMaterialsForProduct([...selectedMaterialsForProduct, {
                          materialId: mat.materialId || mat.id,  // Use materialId if available, otherwise id
                          type: mat.type,
                          batch: mat.batch,
                          quantity: materialToAdd.quantity,
                          available: mat.quantity
                        }])
                        setProductFormData({
                          ...productFormData,
                          materials: [...productFormData.materials, {
                            id: mat.materialId || mat.id,  // Backend expects 'id', use whichever is available
                            type: mat.type,
                            source: mat.source,
                            supplier: mat.owner || mat.source,  // Use actual owner from material
                            batch: mat.batch,
                            verification: 'verified',  // Materials in inventory are already verified via 2-check
                            quantity: materialToAdd.quantity
                          }]
                        })
                        setMaterialToAdd({ materialId: '', quantity: 1 })
                      } else {
                        alert('Insufficient material quantity available')
                      }
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Add
                </button>
              </div>
              
              {/* Selected materials list */}
              {selectedMaterialsForProduct.length > 0 && (
                <div className="border rounded-md p-3">
                  <p className="text-sm font-medium mb-2">Selected Materials:</p>
                  <div className="space-y-2">
                    {selectedMaterialsForProduct.map((mat, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>{mat.materialId} - {mat.type} (Batch: {mat.batch})</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Qty: {mat.quantity}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMaterialsForProduct(selectedMaterialsForProduct.filter((_, i) => i !== idx))
                              setProductFormData({
                                ...productFormData,
                                materials: productFormData.materials.filter((_, i) => i !== idx)
                              })
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

      {/* Quality checkpoints removed - quality is now implicit in 2-check consensus */}

      {/* Bulk Actions Bar - Improved Design */}
      {selectedProducts.size > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                {selectedProducts.size}
              </div>
              <span className="font-medium text-gray-800">
                Product{selectedProducts.size > 1 ? 's' : ''} Selected
              </span>
              <button
                onClick={() => setSelectedProducts(new Set())}
                className="text-sm text-gray-600 hover:text-gray-800 underline"
              >
                Clear all
              </button>
            </div>
            <div className="flex gap-3">
              {isRetailer && (
                <button
                  onClick={async () => {
                    if (selectedProducts.size === 1) {
                      // Single product sell
                      const productId = Array.from(selectedProducts)[0]
                      let product = products?.find((p: Product) => p.id === productId)
                      
                      // If product not in list, fetch it
                      if (!product && api) {
                        try {
                          const response = await api.get(`/api/supply-chain/products/${productId}`)
                          product = response.data
                        } catch (error) {
                          console.error('Failed to fetch product:', error)
                        }
                      }
                      
                      // Allow sale if product is with retailer and not already sold
                      if (product && product.status !== 'SOLD' && product.status !== 'TRANSFERRED') {
                        setSelectedProduct(product)
                        setShowSellDialog(true)
                        setSelectedProducts(new Set()) // Clear selection after opening dialog
                      } else {
                        alert(`Selected product is not available for sale. Status: ${product?.status || 'Unknown'}`)
                      }
                    } else if (selectedProducts.size > 1) {
                      // Multiple products - process one by one
                      const availableProducts = Array.from(selectedProducts)
                        .map(id => products?.find((p: Product) => p.id === id))
                        .filter(p => p && p.status === 'IN_STORE')
                      
                      if (availableProducts.length > 0) {
                        setSelectedProduct(availableProducts[0] as Product)
                        setShowSellDialog(true)
                        alert(`Selling ${availableProducts.length} products. Process them one by one.`)
                      } else {
                        alert('No selected products are available for sale')
                      }
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Sell to Customer
                </button>
              )}
              <button
                onClick={() => {
                  alert(`Transfer ${selectedProducts.size} products - Coming soon`)
                }}
                className="px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batches List (Manufacturer, Warehouse, and Retailer) */}
      {(isManufacturer || isWarehouse || isRetailer) && batches && batches.length > 0 && (viewMode === 'all' || viewMode === 'products') && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Product Batches</h3>
              <span className="text-sm text-gray-500">
                Total: {batches.length} batches
              </span>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {batches.slice(0, 5).map((batch: any) => (
              <div key={batch.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const newExpanded = new Set(expandedBatches)
                          if (newExpanded.has(batch.id)) {
                            newExpanded.delete(batch.id)
                          } else {
                            newExpanded.add(batch.id)
                            // Fetch product details for all products in the batch
                            if (api && batch.productIds) {
                              try {
                                const fetchPromises = batch.productIds.map((productId: string) => 
                                  api.get(`/api/supply-chain/products/${productId}`)
                                )
                                const responses = await Promise.allSettled(fetchPromises)
                                const fetchedProducts = responses
                                  .filter(r => r.status === 'fulfilled')
                                  .map((r: any) => r.value.data)
                                
                                // Update products state with fetched products if not already present
                                if (fetchedProducts.length > 0) {
                                  queryClient.invalidateQueries({ queryKey: ['products'] })
                                }
                              } catch (error) {
                                console.error('Failed to fetch batch products:', error)
                              }
                            }
                          }
                          setExpandedBatches(newExpanded)
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {expandedBatches.has(batch.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                      <h4 className="font-medium text-gray-900">
                        {batch.id}
                      </h4>
                    </div>
                    <p className="text-sm text-gray-600 ml-6">
                      {batch.brand} • {batch.productType} • Qty: {batch.quantity}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Status: {batch.status} • Location: {batch.location || batch.currentOwner || 'Manufacturer'}
                    </p>
                    
                    {/* Expanded products view - Improved Design */}
                    {expandedBatches.has(batch.id) && batch.productIds && (
                      <div className="mt-4 ml-6 mr-2 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-luxury-gold rounded-full"></div>
                            <span className="text-sm font-semibold text-gray-800">
                              {batch.productIds.length} Products in Batch
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {selectedProducts.size > 0 && (
                              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                                {Array.from(selectedProducts).filter(id => batch.productIds?.includes(id)).length} selected
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const allProductIds = batch.productIds || []
                                const allSelected = allProductIds.every((id: string) => selectedProducts.has(id))
                                if (allSelected) {
                                  // Deselect all
                                  const newSelected = new Set(selectedProducts)
                                  allProductIds.forEach((id: string) => newSelected.delete(id))
                                  setSelectedProducts(newSelected)
                                } else {
                                  // Select all
                                  const newSelected = new Set(selectedProducts)
                                  allProductIds.forEach((id: string) => newSelected.add(id))
                                  setSelectedProducts(newSelected)
                                }
                              }}
                              className="text-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              {batch.productIds?.every((id: string) => selectedProducts.has(id)) ? '☐ Deselect All' : '☑ Select All'}
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {batch.productIds.slice(0, 12).map((productId: string) => {
                            const product = products?.find((p: Product) => p.id === productId)
                            const isSelected = selectedProducts.has(productId)
                            return (
                              <div 
                                key={productId} 
                                className={`relative group rounded-lg p-3 cursor-pointer transition-all transform hover:scale-[1.02] ${
                                  isSelected 
                                    ? 'bg-gradient-to-br from-luxury-cream to-yellow-50 border-2 border-luxury-gold shadow-md' 
                                    : 'bg-white border border-gray-200 hover:border-gray-400 hover:shadow-md'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const newSelected = new Set(selectedProducts)
                                  if (isSelected) {
                                    newSelected.delete(productId)
                                  } else {
                                    newSelected.add(productId)
                                  }
                                  setSelectedProducts(newSelected)
                                }}
                              >
                                {/* Selection indicator */}
                                <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-luxury-gold text-white' : 'bg-gray-300 text-gray-600 opacity-0 group-hover:opacity-100'
                                }`}>
                                  {isSelected ? '✓' : ''}
                                </div>
                                
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm text-gray-900 truncate" title={product?.name || productId}>
                                        {product?.name || productId}
                                      </div>
                                      <div className="text-xs text-gray-500 font-mono truncate" title={productId}>
                                        {productId}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {product && (
                                    <>
                                      <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                          product.status === 'IN_STORE' 
                                            ? 'bg-green-100 text-green-800' 
                                            : product.status === 'SOLD'
                                            ? 'bg-gray-100 text-gray-800'
                                            : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                          {product.status.replace('_', ' ')}
                                        </span>
                                      </div>
                                      
                                      {isRetailer && product.status === 'IN_STORE' && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedProduct(product)
                                            setShowSellDialog(true)
                                          }}
                                          className="w-full mt-2 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors"
                                        >
                                          Quick Sell
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {batch.productIds.length > 12 && (
                            <div className="flex items-center justify-center p-3 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                              <span className="text-sm text-gray-600 font-medium">
                                +{batch.productIds.length - 12} more products
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Warehouse-specific actions */}
                    {isWarehouse && batch.status === 'IN_TRANSIT' && (
                      <button
                        onClick={() => {
                          const location = prompt('Enter warehouse location (e.g., Section A, Shelf 5):')
                          if (location) {
                            updateBatchLocationMutation.mutate({
                              batchId: batch.id,
                              location,
                              status: 'IN_WAREHOUSE'
                            })
                          }
                        }}
                        disabled={updateBatchLocationMutation.isPending}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Receive & Store
                      </button>
                    )}
                    
                    {/* Transfer button for both manufacturer and warehouse */}
                    {batch.status !== 'TRANSFERRED' && batch.status !== 'SOLD' && (
                      <button
                        onClick={() => {
                          const toOrg = isManufacturer 
                            ? prompt('Transfer to (luxebags for warehouse or luxuryretail for direct):')
                            : prompt('Transfer to retailer (luxuryretail):')
                          if (toOrg) {
                            transferBatchMutation.mutate({
                              batchId: batch.id,
                              toOrganization: toOrg
                            })
                          }
                        }}
                        disabled={transferBatchMutation.isPending}
                        className="px-3 py-1 text-sm bg-luxury-gold text-white rounded hover:bg-luxury-dark disabled:opacity-50"
                      >
                        Transfer Batch
                      </button>
                    )}
                    <button
                      onClick={() => {
                        api?.get(`/api/supply-chain/batches/${batch.id}/products`)
                          .then(res => {
                            alert(`Products in batch: ${JSON.stringify(res.data, null, 2)}`)
                          })
                          .catch(err => alert('Failed to fetch batch products'))
                      }}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      View Products
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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

      {/* Stolen Products Alert (Retailer & Brand) */}
      {stolenProducts && stolenProducts.length > 0 && (isRetailer || user?.organization === 'luxebags') && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">Stolen Products Alert</h3>
              <div className="space-y-2">
                {stolenProducts.slice(0, 3).map((product: any) => (
                  <div key={product.id} className="text-sm text-red-700">
                    • {product.name} (SN: {product.serialNumber}) - Reported: {new Date(product.reportedAt).toLocaleDateString()}
                  </div>
                ))}
                {stolenProducts.length > 3 && (
                  <div className="text-sm text-red-600 font-medium">
                    + {stolenProducts.length - 3} more stolen products
                  </div>
                )}
              </div>
            </div>
          </div>
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
                            // Quality checkpoints removed
                            console.log('Quality is now implicit in 2-check consensus')
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          title="Add Quality Check"
                        >
                          <CheckCircle className="w-3 h-3" />
                          Quality
                        </button>
                      </>
                    )}
                    {/* Retailer B2C Actions */}
                    {isRetailer && product.currentOwner === user?.organization && product.status === 'IN_STORE' && (
                      <button
                        onClick={() => {
                          setSelectedProduct(product)
                          setShowSellDialog(true)
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        <Send className="w-4 h-4" />
                        Sell to Customer
                      </button>
                    )}
                    {/* Other organizations transfer */}
                    {!isRetailer && user?.organization === product.currentOwner && (
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

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold">Product Details</h3>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Basic Information */}
              <div className="border-b pb-4">
                <h4 className="font-medium mb-2">Basic Information</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="font-medium">Product ID:</span> {selectedProduct.id}</div>
                  <div><span className="font-medium">Serial Number:</span> {selectedProduct.serialNumber}</div>
                  <div><span className="font-medium">Brand:</span> {selectedProduct.brand}</div>
                  <div><span className="font-medium">Name:</span> {selectedProduct.name}</div>
                  <div><span className="font-medium">Type:</span> {selectedProduct.type}</div>
                  <div><span className="font-medium">Status:</span> {selectedProduct.status}</div>
                  <div><span className="font-medium">Current Owner:</span> {selectedProduct.currentOwner}</div>
                  <div><span className="font-medium">Created:</span> {new Date(selectedProduct.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
              
              {/* Materials */}
              {selectedProduct.materials && selectedProduct.materials.length > 0 && (
                <div className="border-b pb-4">
                  <h4 className="font-medium mb-2">Materials Used</h4>
                  <div className="space-y-1 text-sm">
                    {selectedProduct.materials.map((material: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{material.materialID} - {material.type} (Batch: {material.batch})</span>
                        <span className="text-gray-600">{material.verification}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Quality Checkpoints */}
              {selectedProduct.qualityCheckpoints && selectedProduct.qualityCheckpoints.length > 0 && (
                <div className="border-b pb-4">
                  <h4 className="font-medium mb-2">Quality Checkpoints</h4>
                  <div className="space-y-2 text-sm">
                    {selectedProduct.qualityCheckpoints.map((checkpoint: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{checkpoint.type}</span>
                          <span className="text-gray-600 ml-2">by {checkpoint.inspector}</span>
                        </div>
                        <span className={checkpoint.passed ? 'text-green-600' : 'text-red-600'}>
                          {checkpoint.passed ? '✓ Passed' : '✗ Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Transfer History */}
              {selectedProduct.transferHistory && selectedProduct.transferHistory.length > 0 && (
                <div className="border-b pb-4">
                  <h4 className="font-medium mb-2">Transfer History</h4>
                  <div className="space-y-2 text-sm">
                    {selectedProduct.transferHistory.map((transfer: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{transfer.from} → {transfer.to}</span>
                        <span className="text-gray-600">{new Date(transfer.timestamp).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Service Records */}
              {(serviceRecords && serviceRecords.length > 0) && (
                <div>
                  <h4 className="font-medium mb-2">Service Records</h4>
                  <div className="space-y-2 text-sm">
                    {serviceRecords.map((record: any, idx: number) => (
                      <div key={idx} className="border rounded p-2 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium">{record.serviceType}</span>
                            <p className="text-gray-600 text-xs mt-1">{record.description}</p>
                            <p className="text-gray-500 text-xs mt-1">By: {record.technician}</p>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(record.timestamp || record.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Action Buttons for Manufacturer */}
            {isManufacturer && selectedProduct && selectedProduct.status === 'CREATED' && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-blue-700 mb-3">Manufacturer Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Mark this product as complete and ready for transfer?')) {
                        completeProductMutation.mutate(selectedProduct.id)
                      }
                    }}
                    disabled={completeProductMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {completeProductMutation.isPending ? 'Completing...' : 'Complete Product'}
                  </button>
                  <button
                    onClick={() => {
                      setAddMaterialFormData({ 
                        ...addMaterialFormData, 
                        productId: selectedProduct.id 
                      })
                      setShowAddMaterialToProduct(true)
                      setSelectedProduct(null)
                    }}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Add Materials
                  </button>
                </div>
              </div>
            )}
            
            {/* Action Buttons for Warehouse */}
            {isWarehouse && selectedProduct && (
              <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                <h4 className="text-sm font-medium text-purple-700 mb-3">Warehouse Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const serviceType = prompt('Service type (inspection/storage/maintenance):')
                      const description = prompt('Service description:')
                      const technician = prompt('Warehouse staff name:')
                      if (serviceType && description && technician) {
                        addServiceRecordMutation.mutate({
                          productId: selectedProduct.id,
                          serviceType,
                          description,
                          technician
                        })
                      }
                    }}
                    disabled={addServiceRecordMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  >
                    {addServiceRecordMutation.isPending ? 'Adding...' : 'Add Service Record'}
                  </button>
                  <button
                    onClick={() => {
                      const location = prompt('Enter storage location (e.g., Section B, Shelf 3):')
                      if (location) {
                        // This would update the product's location in warehouse
                        api?.put(`/api/supply-chain/products/${selectedProduct.id}/location`, { location })
                          .then(() => {
                            notifications.success('Product location updated')
                            queryClient.invalidateQueries({ queryKey: ['products'] })
                          })
                          .catch(() => toast.error('Failed to update location'))
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Update Location
                  </button>
                  <button
                    onClick={() => {
                      const toOrg = prompt('Transfer to retailer (luxuryretail):')
                      if (toOrg === 'luxuryretail') {
                        transferProductMutation.mutate({
                          productId: selectedProduct.id,
                          toOrganization: toOrg
                        })
                      }
                    }}
                    disabled={transferProductMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {transferProductMutation.isPending ? 'Transferring...' : 'Transfer to Retailer'}
                  </button>
                </div>
              </div>
            )}
            
            {/* Action Buttons for Retailers */}
            {isRetailer && selectedProduct.status !== 'SOLD' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Retailer Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedProduct.status !== 'RETAIL' && (
                    <button
                      onClick={() => {
                        markForRetailMutation.mutate(selectedProduct.id)
                      }}
                      disabled={markForRetailMutation.isPending}
                      className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                      {markForRetailMutation.isPending ? 'Marking...' : 'Mark for Retail'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const location = prompt('Enter store location:')
                      if (location) {
                        takeOwnershipMutation.mutate({ 
                          productId: selectedProduct.id, 
                          purchaseLocation: location 
                        })
                      }
                    }}
                    disabled={takeOwnershipMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {takeOwnershipMutation.isPending ? 'Recording...' : 'Take Ownership'}
                  </button>
                  <button
                    onClick={() => {
                      createBirthCertificateMutation.mutate(selectedProduct.id)
                    }}
                    disabled={createBirthCertificateMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createBirthCertificateMutation.isPending ? 'Creating...' : 'Create Birth Certificate'}
                  </button>
                  <button
                    onClick={() => {
                      setShowSellDialog(true)
                    }}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Sell to Customer
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Enter return reason:')
                      if (reason) {
                        processCustomerReturnMutation.mutate({ 
                          productId: selectedProduct.id, 
                          reason 
                        })
                      }
                    }}
                    disabled={processCustomerReturnMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                  >
                    {processCustomerReturnMutation.isPending ? 'Processing...' : 'Process Return'}
                  </button>
                  <button
                    onClick={() => {
                      const serviceType = prompt('Service type (repair/cleaning/authentication):')
                      const description = prompt('Service description:')
                      const technician = prompt('Technician name:')
                      if (serviceType && description && technician) {
                        addServiceRecordMutation.mutate({
                          productId: selectedProduct.id,
                          serviceType,
                          description,
                          technician
                        })
                      }
                    }}
                    disabled={addServiceRecordMutation.isPending}
                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                  >
                    {addServiceRecordMutation.isPending ? 'Adding...' : 'Add Service Record'}
                  </button>
                </div>
              </div>
            )}
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
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
                    src={api ? `${api.defaults.baseURL}${qrProduct.qrCode.url}` : qrProduct.qrCode.url} 
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

      {/* Sell to Customer Dialog (Retailer only) */}
      {showSellDialog && selectedProduct && isRetailer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Sell Product to Customer</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Product</label>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedProduct.name} - {selectedProduct.serialNumber}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Email or Phone</label>
                <input
                  type="text"
                  value={customerInfo.customerId}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, customerId: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="customer@email.com or +1234567890"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">This will be hashed for privacy</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Customer Password</label>
                <input
                  type="password"
                  value={customerInfo.password}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, password: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="Set customer password"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Customer will need this for transfers</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">4-Digit PIN</label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  value={customerInfo.pin}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, pin: e.target.value.replace(/\D/g, '') })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-luxury-gold focus:ring-luxury-gold"
                  placeholder="0000"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Additional security for ownership transfers</p>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowSellDialog(false)
                    setCustomerInfo({ customerId: '', password: '', pin: '' })
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    sellToCustomerMutation.mutate({
                      productId: selectedProduct.id,
                      customerId: customerInfo.customerId,
                      password: customerInfo.password,
                      pin: customerInfo.pin
                    })
                  }}
                  disabled={sellToCustomerMutation.isPending || !customerInfo.customerId || !customerInfo.password || customerInfo.pin.length !== 4}
                  className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50"
                >
                  {sellToCustomerMutation.isPending ? 'Processing...' : 'Sell Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}