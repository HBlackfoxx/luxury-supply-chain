// backend/customer/types.ts
// Types for customer-facing operations

export interface Customer {
  id: string;
  email: string;
  phone?: string;
  name?: string;
  registeredAt: Date;
  lastActive: Date;
  preferences: CustomerPreferences;
}

export interface CustomerPreferences {
  notificationMethod: 'email' | 'sms' | 'both' | 'none';
  language: string;
  timezone: string;
}

export interface OwnedProduct {
  productId: string;
  brand: string;
  model: string;
  serialNumber: string;
  purchaseDate: Date;
  purchaseLocation: string;
  currentOwner: string; // Hashed customer ID
  ownershipStatus: 'active' | 'transferred' | 'stolen' | 'lost';
  verificationCount: number;
  lastVerified?: Date;
  transferCode?: string;
  transferCodeExpiry?: Date;
}

export interface OwnershipClaim {
  productId: string;
  claimMethod: 'purchase' | 'transfer' | 'gift';
  purchaseReceipt?: string;
  transferCode?: string;
  location: string;
  timestamp: Date;
}

export interface TransferRequest {
  productId: string;
  fromCustomer: string;
  toCustomer?: string; // Optional for code-based transfers
  transferCode?: string;
  reason: 'sale' | 'gift' | 'return' | 'other';
  message?: string;
  timestamp: Date;
}

export interface QRCodeData {
  productId: string;
  brand: string;
  model: string;
  verificationUrl: string;
  timestamp: Date;
  signature: string; // For authenticity
}

export interface VerificationResult {
  isAuthentic: boolean;
  productId: string;
  brand: string;
  model: string;
  manufactureDate?: Date;
  currentOwner?: 'you' | 'someone_else' | 'unclaimed';
  ownershipStatus?: string;
  verificationHistory: number;
  lastVerified?: Date;
  alerts?: string[];
}

export interface RecoveryRequest {
  customerId: string;
  email: string;
  phone?: string;
  productIds: string[];
  verificationMethod: 'email' | 'sms' | 'id_upload';
  supportTicket?: string;
  status: 'pending' | 'verified' | 'approved' | 'rejected';
  createdAt: Date;
}

export interface ServiceRecord {
  productId: string;
  serviceType: 'repair' | 'authentication' | 'cleaning' | 'other';
  serviceProvider: string;
  date: Date;
  description: string;
  cost?: number;
  warranty?: boolean;
  documents?: string[];
}

export interface CustomerNotification {
  customerId: string;
  type: 'ownership_claimed' | 'transfer_initiated' | 'transfer_completed' | 
        'product_verified' | 'suspicious_activity' | 'service_reminder';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
}