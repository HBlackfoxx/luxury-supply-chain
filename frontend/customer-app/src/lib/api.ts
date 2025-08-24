import axios from 'axios'

const customerGateway = axios.create({
  baseURL: process.env.NEXT_PUBLIC_CUSTOMER_GATEWAY_URL || 'http://localhost:3010',
  headers: {
    'Content-Type': 'application/json',
  },
})

const retailerAPI = axios.create({
  baseURL: process.env.NEXT_PUBLIC_RETAILER_API_URL || 'http://localhost:4004',
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface Product {
  id: string
  name: string
  type: string
  description: string
  serialNumber: string
  manufacturingDate?: string
  createdAt?: string
  currentOwner?: string
  currentLocation?: string
  ownershipHash?: string
  isStolen?: boolean
  brand?: string
  batchId?: string
  materials?: any[]
  ownershipHistory?: OwnershipRecord[]
  status: 'AVAILABLE' | 'OWNED' | 'STOLEN' | 'IN_TRANSFER' | 'SOLD' | 'IN_STORE' | 'CREATED' | 'IN_PRODUCTION' | 'IN_TRANSIT'
  qrCode?: string
  birthCertificate?: BirthCertificate
}

export interface OwnershipRecord {
  owner: string
  timestamp: string
  transactionId: string
  transferCode?: string
}

export interface BirthCertificate {
  productId: string
  manufacturingDate: string
  manufacturer: string
  materials: string[]
  craftsman?: string
  qualityChecks: QualityCheck[]
  authenticityCertificate: string
  certificateHash?: string
}

export interface QualityCheck {
  date: string
  inspector: string
  passed: boolean
  notes?: string
}

export interface TransferRequest {
  productId: string
  transferCode: string
  newOwnerEmail?: string
}

export const api = {
  // Product verification
  async verifyProduct(productId: string): Promise<Product> {
    const { data } = await customerGateway.get(`/api/products/verify/${productId}`)
    // The API returns { authentic, message, product, verifiedAt }
    // We need to return just the product
    return data.product || data
  },

  // Ownership operations with security
  async claimOwnership(productId: string, transferCode: string, email?: string, password?: string, pin?: string): Promise<{ success: boolean; message: string }> {
    const { data } = await customerGateway.post('/api/ownership/transfer/complete', {
      productId,
      transferCode,
      email,
      password,
      pin
    })
    return data
  },

  async initiateTransfer(productId: string, email?: string, password?: string, pin?: string): Promise<{ transferCode: string; expiresAt: string }> {
    const { data } = await customerGateway.post('/api/ownership/transfer/generate', {
      productId,
      email,
      password,
      pin
    })
    return data
  },

  async completeTransfer(transferRequest: TransferRequest): Promise<{ success: boolean; message: string }> {
    const { data } = await customerGateway.post('/api/ownership/transfer/complete', transferRequest)
    return data
  },

  async reportStolen(productId: string, email: string, password: string, pin: string, policeReportId?: string): Promise<{ success: boolean; message: string }> {
    const { data } = await customerGateway.post('/api/ownership/report-stolen', {
      productId,
      email,
      password,
      pin,
      policeReportId
    })
    return data
  },

  async recoverProduct(productId: string, email: string, password: string, pin: string, recoveryDetails: string): Promise<{ success: boolean; message: string }> {
    const { data } = await customerGateway.post('/api/ownership/recover', {
      productId,
      email,
      password,
      pin,
      recoveryDetails
    })
    return data
  },

  // Get owned products (requires email or other identifier)
  async getOwnedProducts(email: string): Promise<Product[]> {
    const { data } = await customerGateway.get(`/api/ownership/products?email=${email}`)
    return data
  },

  // Get birth certificate
  async getBirthCertificate(productId: string): Promise<BirthCertificate> {
    const { data } = await customerGateway.get(`/api/products/certificate/${productId}`)
    return data
  },

  // Get QR code image
  getQRCodeUrl(productId: string): string {
    return `${process.env.NEXT_PUBLIC_RETAILER_API_URL}/uploads/qrcodes/${productId}.png`
  },

  // Get supply chain history
  async getProductHistory(productId: string): Promise<any[]> {
    const { data } = await customerGateway.get(`/api/products/${productId}/history`)
    return data.history || []
  }
}