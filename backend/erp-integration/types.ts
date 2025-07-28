// backend/erp-integration/types.ts
// Common types for ERP integration

export interface ERPConfig {
  type: 'SAP' | 'Oracle' | 'Microsoft' | 'Mock';
  baseUrl: string;
  apiKey?: string;
  webhookUrl?: string;
  syncInterval?: number;
}

export interface PurchaseOrder {
  poNumber: string;
  vendorId: string;
  buyerId: string;
  items: POItem[];
  totalValue: number;
  currency: string;
  deliveryDate: Date;
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'RECEIVED' | 'COMPLETED';
  erpMetadata?: any;
}

export interface POItem {
  lineNumber: number;
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  qualitySpec?: string;
}

export interface InventoryUpdate {
  locationId: string;
  itemId: string;
  quantity: number;
  transactionType: 'RECEIPT' | 'ISSUE' | 'ADJUSTMENT';
  referenceDoc?: string;
  timestamp: Date;
}

export interface QualityResult {
  certificateId: string;
  itemId: string;
  batchNumber: string;
  testResults: {
    parameter: string;
    value: any;
    passed: boolean;
  }[];
  overallStatus: 'PASSED' | 'FAILED' | 'CONDITIONAL';
  certifiedBy: string;
  certificationDate: Date;
}

export interface ERPWebhookPayload {
  eventType: 'PO_CREATED' | 'PO_UPDATED' | 'INVENTORY_CHANGE' | 'QC_COMPLETED' | 'PAYMENT_RECEIVED';
  timestamp: Date;
  source: string;
  data: any;
}

export interface ERPSyncResult {
  success: boolean;
  recordsProcessed: number;
  errors?: string[];
  lastSyncTime: Date;
}