// backend/erp-integration/adapters/erp-adapter-base.ts
// Base class for all ERP adapters

import { EventEmitter } from 'events';
import { 
  ERPConfig, 
  PurchaseOrder, 
  InventoryUpdate, 
  QualityResult,
  ERPWebhookPayload,
  ERPSyncResult 
} from '../types';

export abstract class ERPAdapterBase extends EventEmitter {
  protected config: ERPConfig;
  protected isConnected: boolean = false;

  constructor(config: ERPConfig) {
    super();
    this.config = config;
  }

  // Connection management
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract testConnection(): Promise<boolean>;

  // Purchase Order operations
  abstract createPurchaseOrder(po: PurchaseOrder): Promise<string>;
  abstract updatePOStatus(poNumber: string, status: string, details?: any): Promise<void>;
  abstract getPurchaseOrder(poNumber: string): Promise<PurchaseOrder>;
  abstract syncPurchaseOrders(since?: Date): Promise<PurchaseOrder[]>;

  // Inventory operations
  abstract updateInventory(update: InventoryUpdate): Promise<void>;
  abstract getInventoryLevel(itemId: string, locationId?: string): Promise<number>;
  abstract syncInventoryUpdates(since?: Date): Promise<InventoryUpdate[]>;

  // Quality operations
  abstract submitQualityResult(result: QualityResult): Promise<void>;
  abstract getQualityCertificate(certificateId: string): Promise<QualityResult>;

  // Webhook handling
  abstract handleWebhook(payload: ERPWebhookPayload): Promise<void>;
  abstract registerWebhook(events: string[]): Promise<void>;

  // Sync operations
  abstract performFullSync(): Promise<ERPSyncResult>;
  abstract performIncrementalSync(since: Date): Promise<ERPSyncResult>;

  // Helper methods
  protected logInfo(message: string, data?: any): void {
    console.log(`[${this.config.type} Adapter] ${message}`, data || '');
  }

  protected logError(message: string, error: any): void {
    console.error(`[${this.config.type} Adapter] ${message}`, error);
  }

  protected emitERPEvent(eventType: string, data: any): void {
    this.emit('erp_event', {
      adapter: this.config.type,
      eventType,
      timestamp: new Date(),
      data
    });
  }
}