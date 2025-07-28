// backend/erp-integration/adapters/mock-erp-adapter.ts
// Mock ERP adapter for local testing

import { ERPAdapterBase } from './erp-adapter-base';
import { 
  ERPConfig, 
  PurchaseOrder, 
  InventoryUpdate, 
  QualityResult,
  ERPWebhookPayload,
  ERPSyncResult
} from '../types';

export class MockERPAdapter extends ERPAdapterBase {
  private mockDatabase: {
    purchaseOrders: Map<string, PurchaseOrder>;
    inventory: Map<string, number>;
    qualityCerts: Map<string, QualityResult>;
  };

  constructor(config: ERPConfig) {
    super(config);
    this.mockDatabase = {
      purchaseOrders: new Map(),
      inventory: new Map(),
      qualityCerts: new Map()
    };
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Add some sample data
    this.mockDatabase.inventory.set('LEATHER-001', 1000);
    this.mockDatabase.inventory.set('HARDWARE-001', 500);
    this.mockDatabase.inventory.set('THREAD-001', 2000);
  }

  async connect(): Promise<void> {
    this.logInfo('Connecting to Mock ERP...');
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.isConnected = true;
    this.logInfo('Connected to Mock ERP');
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.logInfo('Disconnected from Mock ERP');
  }

  async testConnection(): Promise<boolean> {
    return this.isConnected;
  }

  async createPurchaseOrder(po: PurchaseOrder): Promise<string> {
    this.mockDatabase.purchaseOrders.set(po.poNumber, po);
    
    // Simulate ERP processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Emit event that PO was created
    this.emitERPEvent('PO_CREATED', po);
    
    // Simulate webhook callback
    setTimeout(() => {
      this.simulateWebhook({
        eventType: 'PO_CREATED',
        timestamp: new Date(),
        source: 'MOCK_ERP',
        data: po
      });
    }, 2000);

    return po.poNumber;
  }

  async updatePOStatus(poNumber: string, status: string, details?: any): Promise<void> {
    const po = this.mockDatabase.purchaseOrders.get(poNumber);
    if (!po) {
      throw new Error(`PO ${poNumber} not found`);
    }
    
    po.status = status as any;
    this.mockDatabase.purchaseOrders.set(poNumber, po);
    
    this.emitERPEvent('PO_UPDATED', { poNumber, status, details });
  }

  async getPurchaseOrder(poNumber: string): Promise<PurchaseOrder> {
    const po = this.mockDatabase.purchaseOrders.get(poNumber);
    if (!po) {
      throw new Error(`PO ${poNumber} not found`);
    }
    return po;
  }

  async syncPurchaseOrders(since?: Date): Promise<PurchaseOrder[]> {
    const allPOs = Array.from(this.mockDatabase.purchaseOrders.values());
    
    if (since) {
      // Filter by date in real implementation
      return allPOs;
    }
    
    return allPOs;
  }

  async updateInventory(update: InventoryUpdate): Promise<void> {
    const key = `${update.itemId}`;
    const currentQty = this.mockDatabase.inventory.get(key) || 0;
    
    let newQty = currentQty;
    switch (update.transactionType) {
      case 'RECEIPT':
        newQty += update.quantity;
        break;
      case 'ISSUE':
        newQty -= update.quantity;
        break;
      case 'ADJUSTMENT':
        newQty = update.quantity;
        break;
    }
    
    this.mockDatabase.inventory.set(key, newQty);
    
    this.emitERPEvent('INVENTORY_UPDATED', {
      ...update,
      newQuantity: newQty
    });
  }

  async getInventoryLevel(itemId: string, locationId?: string): Promise<number> {
    return this.mockDatabase.inventory.get(itemId) || 0;
  }

  async syncInventoryUpdates(since?: Date): Promise<InventoryUpdate[]> {
    // In real implementation, would return historical updates
    const updates: InventoryUpdate[] = [];
    
    this.mockDatabase.inventory.forEach((quantity, itemId) => {
      updates.push({
        locationId: 'WAREHOUSE-001',
        itemId,
        quantity,
        transactionType: 'ADJUSTMENT',
        timestamp: new Date()
      });
    });
    
    return updates;
  }

  async submitQualityResult(result: QualityResult): Promise<void> {
    this.mockDatabase.qualityCerts.set(result.certificateId, result);
    
    this.emitERPEvent('QC_COMPLETED', result);
    
    // Simulate webhook
    setTimeout(() => {
      this.simulateWebhook({
        eventType: 'QC_COMPLETED',
        timestamp: new Date(),
        source: 'MOCK_ERP',
        data: result
      });
    }, 1500);
  }

  async getQualityCertificate(certificateId: string): Promise<QualityResult> {
    const cert = this.mockDatabase.qualityCerts.get(certificateId);
    if (!cert) {
      throw new Error(`Certificate ${certificateId} not found`);
    }
    return cert;
  }

  async handleWebhook(payload: ERPWebhookPayload): Promise<void> {
    this.logInfo('Handling webhook', payload);
    
    // Process webhook based on event type
    switch (payload.eventType) {
      case 'PO_CREATED':
        // Handle new PO from ERP
        break;
      case 'INVENTORY_CHANGE':
        // Handle inventory update from ERP
        break;
      case 'QC_COMPLETED':
        // Handle quality control completion
        break;
      default:
        this.logInfo('Unknown webhook event type', payload.eventType);
    }
  }

  async registerWebhook(events: string[]): Promise<void> {
    this.logInfo('Registering webhooks for events', events);
    // In real implementation, would register with ERP system
  }

  async performFullSync(): Promise<ERPSyncResult> {
    this.logInfo('Performing full sync...');
    
    const pos = await this.syncPurchaseOrders();
    const inventory = await this.syncInventoryUpdates();
    
    return {
      success: true,
      recordsProcessed: pos.length + inventory.length,
      lastSyncTime: new Date()
    };
  }

  async performIncrementalSync(since: Date): Promise<ERPSyncResult> {
    this.logInfo('Performing incremental sync since', since);
    
    const pos = await this.syncPurchaseOrders(since);
    const inventory = await this.syncInventoryUpdates(since);
    
    return {
      success: true,
      recordsProcessed: pos.length + inventory.length,
      lastSyncTime: new Date()
    };
  }

  // Helper method to simulate webhook calls
  private simulateWebhook(payload: ERPWebhookPayload): void {
    // In real scenario, this would be an HTTP POST to our webhook endpoint
    this.emit('webhook_received', payload);
  }
}