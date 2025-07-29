// backend/erp-integration/erp-integration-service.ts
// Main service for managing ERP integrations with blockchain

import { EventEmitter } from 'events';
import { ERPAdapterBase } from './adapters/erp-adapter-base';
import { MockERPAdapter } from './adapters/mock-erp-adapter';
import { ConsensusSystem } from '../consensus/setup-consensus';
import { 
  ERPConfig, 
  PurchaseOrder, 
  ERPWebhookPayload,
  InventoryUpdate,
  QualityResult 
} from './types';

export class ERPIntegrationService extends EventEmitter {
  private adapters: Map<string, ERPAdapterBase> = new Map();
  private consensusSystem: ConsensusSystem;
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(consensusSystem: ConsensusSystem) {
    super();
    this.consensusSystem = consensusSystem;
  }

  /**
   * Register an ERP adapter
   */
  public async registerERP(orgId: string, config: ERPConfig): Promise<void> {
    console.log(`Registering ERP adapter for ${orgId}...`);
    
    // Create adapter based on type
    let adapter: ERPAdapterBase;
    
    switch (config.type) {
      case 'Mock':
        adapter = new MockERPAdapter(config);
        break;
      case 'SAP':
        // adapter = new SAPAdapter(config);
        throw new Error('SAP adapter not implemented yet');
      case 'Oracle':
        // adapter = new OracleAdapter(config);
        throw new Error('Oracle adapter not implemented yet');
      default:
        throw new Error(`Unknown ERP type: ${config.type}`);
    }

    // Connect to ERP
    await adapter.connect();
    
    // Store adapter
    this.adapters.set(orgId, adapter);
    
    // Setup event listeners
    this.setupAdapterListeners(orgId, adapter);
    
    // Setup sync if configured
    if (config.syncInterval) {
      this.setupSync(orgId, config.syncInterval);
    }
    
    console.log(`ERP adapter registered for ${orgId}`);
  }

  /**
   * Handle incoming webhook from ERP
   */
  public async handleWebhook(orgId: string, payload: ERPWebhookPayload): Promise<void> {
    const adapter = this.adapters.get(orgId);
    if (!adapter) {
      throw new Error(`No ERP adapter found for ${orgId}`);
    }
    
    await adapter.handleWebhook(payload);
  }

  /**
   * Create blockchain transaction from PO
   */
  public async createTransactionFromPO(orgId: string, poNumber: string): Promise<string> {
    const adapter = this.adapters.get(orgId);
    if (!adapter) {
      throw new Error(`No ERP adapter found for ${orgId}`);
    }
    
    // Get PO from ERP
    const po = await adapter.getPurchaseOrder(poNumber);
    
    // Create blockchain transaction
    const txId = await this.consensusSystem.createB2BTransaction({
      sender: po.vendorId,
      receiver: po.buyerId,
      itemId: po.items[0].itemId, // Simplified for PoC
      value: po.totalValue,
      metadata: {
        poNumber: po.poNumber,
        erpSource: orgId,
        items: po.items
      }
    });
    
    // Update PO status in ERP
    await adapter.updatePOStatus(poNumber, 'BLOCKCHAIN_CREATED', { txId });
    
    return txId;
  }

  /**
   * Sync blockchain confirmation back to ERP
   */
  public async syncConfirmationToERP(
    orgId: string, 
    txId: string, 
    confirmationType: 'SENT' | 'RECEIVED'
  ): Promise<void> {
    const adapter = this.adapters.get(orgId);
    if (!adapter) {
      throw new Error(`No ERP adapter found for ${orgId}`);
    }
    
    // Get transaction details
    const txReport = await this.consensusSystem.getTransactionReport(txId);
    const poNumber = txReport.transaction.metadata?.poNumber;
    
    if (poNumber) {
      const newStatus = confirmationType === 'SENT' ? 'SHIPPED' : 'DELIVERED';
      await adapter.updatePOStatus(poNumber, newStatus, {
        confirmedAt: new Date(),
        blockchainTxId: txId
      });
    }
  }

  /**
   * Update inventory from blockchain events
   */
  public async updateInventoryFromBlockchain(
    orgId: string,
    itemId: string,
    quantity: number,
    type: 'RECEIPT' | 'ISSUE',
    reference: string
  ): Promise<void> {
    const adapter = this.adapters.get(orgId);
    if (!adapter) {
      throw new Error(`No ERP adapter found for ${orgId}`);
    }
    
    const update: InventoryUpdate = {
      locationId: orgId,
      itemId,
      quantity,
      transactionType: type,
      referenceDoc: reference,
      timestamp: new Date()
    };
    
    await adapter.updateInventory(update);
  }

  /**
   * Submit quality results to ERP
   */
  public async submitQualityToERP(
    orgId: string,
    qualityResult: QualityResult
  ): Promise<void> {
    const adapter = this.adapters.get(orgId);
    if (!adapter) {
      throw new Error(`No ERP adapter found for ${orgId}`);
    }
    
    await adapter.submitQualityResult(qualityResult);
  }

  /**
   * Get current inventory level from ERP
   */
  public async getInventoryLevel(
    orgId: string,
    itemId: string
  ): Promise<number> {
    const adapter = this.adapters.get(orgId);
    if (!adapter) {
      throw new Error(`No ERP adapter found for ${orgId}`);
    }
    
    return adapter.getInventoryLevel(itemId);
  }

  /**
   * Setup event listeners for adapter
   */
  private setupAdapterListeners(orgId: string, adapter: ERPAdapterBase): void {
    // Listen for ERP events
    adapter.on('erp_event', (event) => {
      console.log(`ERP Event from ${orgId}:`, event);
      this.handleERPEvent(orgId, event);
    });
    
    // Listen for webhook events (for mock adapter)
    adapter.on('webhook_received', (payload) => {
      console.log(`Webhook received from ${orgId}:`, payload);
      this.handleWebhook(orgId, payload);
    });
  }

  /**
   * Handle ERP events
   */
  private async handleERPEvent(orgId: string, event: any): Promise<void> {
    switch (event.eventType) {
      case 'PO_CREATED':
        // Auto-create blockchain transaction
        if (event.data.status === 'APPROVED') {
          try {
            const txId = await this.createTransactionFromPO(orgId, event.data.poNumber);
            console.log(`Created blockchain transaction ${txId} for PO ${event.data.poNumber}`);
          } catch (error) {
            console.error('Failed to create blockchain transaction:', error);
          }
        }
        break;
        
      case 'INVENTORY_UPDATED':
        // Emit event for other systems
        this.emit('inventory_changed', {
          orgId,
          ...event.data
        });
        break;
        
      case 'QC_COMPLETED':
        // Could trigger blockchain quality recording
        this.emit('quality_completed', {
          orgId,
          ...event.data
        });
        break;
    }
  }

  /**
   * Setup periodic sync
   */
  private setupSync(orgId: string, intervalMinutes: number): void {
    // Ensure interval is reasonable (max 24 hours)
    const maxInterval = 24 * 60; // 24 hours in minutes
    const safeInterval = Math.min(intervalMinutes, maxInterval);
    
    const interval = setInterval(async () => {
      try {
        const adapter = this.adapters.get(orgId);
        if (adapter) {
          const result = await adapter.performIncrementalSync(
            new Date(Date.now() - safeInterval * 60 * 1000)
          );
          console.log(`Sync completed for ${orgId}:`, result);
        }
      } catch (error) {
        console.error(`Sync failed for ${orgId}:`, error);
      }
    }, safeInterval * 60 * 1000);
    
    this.syncIntervals.set(orgId, interval);
  }

  /**
   * Cleanup
   */
  public async shutdown(): Promise<void> {
    // Clear sync intervals
    this.syncIntervals.forEach(interval => clearInterval(interval));
    this.syncIntervals.clear();
    
    // Disconnect all adapters
    for (const [orgId, adapter] of this.adapters) {
      try {
        await adapter.disconnect();
      } catch (error) {
        console.error(`Failed to disconnect adapter for ${orgId}:`, error);
      }
    }
    
    this.adapters.clear();
  }
}