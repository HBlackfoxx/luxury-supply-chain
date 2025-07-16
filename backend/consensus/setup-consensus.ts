// backend/consensus/setup-consensus.ts
// Integration script to connect Phase 2 consensus with Phase 1 infrastructure

import { SDKConfigManager } from '../gateway/src/config/sdk-config';
import { IdentityManager } from '../gateway/src/fabric/identity-manager';
import { GatewayManager } from '../gateway/src/fabric/gateway-manager';
import { TransactionHandler } from '../gateway/src/fabric/transaction-handler';
import { EventListenerManager } from '../gateway/src/fabric/event-listener';
import { FabricMonitor } from '../gateway/src/monitoring/fabric-monitor';

import { TransactionStateManager } from '../../consensus/2check/core/state/state-manager';
import { ValidationEngine } from '../../consensus/2check/core/validation/validation-engine';
import { FabricConsensusAdapter } from './fabric-consensus-adapter';

export class ConsensusSystem {
  private configManager: SDKConfigManager;
  private identityManager: IdentityManager;
  private gatewayManager: GatewayManager;
  private transactionHandler: TransactionHandler;
  private eventListener: EventListenerManager;
  private monitor: FabricMonitor;
  
  private stateManager: TransactionStateManager;
  private validationEngine: ValidationEngine;
  private fabricAdapter: FabricConsensusAdapter;

  constructor(brandId: string) {
    // Initialize Phase 1 components
    this.configManager = new SDKConfigManager(brandId);
    this.identityManager = new IdentityManager(this.configManager);
    this.gatewayManager = new GatewayManager(this.configManager, this.identityManager);
    this.transactionHandler = new TransactionHandler();
    this.eventListener = new EventListenerManager();
    this.monitor = new FabricMonitor({
      enablePrometheus: true,
      prometheusPort: 9090,
      logLevel: 'info'
    });

    // Initialize Phase 2 components
    this.stateManager = new TransactionStateManager();
    this.validationEngine = new ValidationEngine();
    this.fabricAdapter = new FabricConsensusAdapter(
      this.stateManager,
      this.gatewayManager,
      this.transactionHandler,
      this.eventListener
    );

    this.setupEventHandlers();
  }

  /**
   * Initialize the consensus system
   */
  public async initialize(orgId: string, userId: string): Promise<void> {
    this.monitor.logInfo('Initializing consensus system...');

    try {
      // Initialize Fabric connection
      await this.fabricAdapter.initialize(orgId, userId);

      // Setup monitoring for consensus events
      this.setupConsensusMonitoring();

      this.monitor.logInfo('Consensus system initialized successfully');
    } catch (error) {
      this.monitor.logError(error as Error, { operation: 'consensus_initialization' });
      throw error;
    }
  }

  /**
   * Create a new B2B transaction
   */
  public async createB2BTransaction(params: {
    sender: string;
    receiver: string;
    itemId: string;
    value: number;
    metadata?: any;
  }): Promise<string> {
    const startTime = Date.now();
    const transactionId = this.generateTransactionId();

    try {
      // Create transaction in state manager
      const transaction = await this.stateManager.createTransaction({
        id: transactionId,
        ...params
      });

      // Transaction will be automatically created on chain via event listener

      this.monitor.logTransaction({
        channel: 'luxury-supply-chain',
        chaincode: 'consensus',
        function: 'createTransaction',
        transactionId,
        success: true,
        duration: (Date.now() - startTime) / 1000
      });

      return transactionId;
    } catch (error) {
      this.monitor.logTransaction({
        channel: 'luxury-supply-chain',
        chaincode: 'consensus',
        function: 'createTransaction',
        transactionId,
        success: false,
        duration: (Date.now() - startTime) / 1000,
        error: error as Error
      });
      throw error;
    }
  }

  /**
   * Confirm sending (for suppliers, manufacturers, etc.)
   */
  public async confirmSent(
    transactionId: string,
    senderId: string,
    evidence?: {
      shippingLabel?: string;
      trackingNumber?: string;
      photos?: string[];
    }
  ): Promise<void> {
    try {
      await this.stateManager.confirmSent(transactionId, senderId, evidence);
      
      this.monitor.logInfo('Transaction sent confirmation', {
        transactionId,
        senderId
      });
    } catch (error) {
      this.monitor.logError(error as Error, {
        operation: 'confirm_sent',
        transactionId,
        senderId
      });
      throw error;
    }
  }

  /**
   * Confirm receipt (for manufacturers, brand, retailers)
   */
  public async confirmReceived(
    transactionId: string,
    receiverId: string,
    evidence?: {
      condition?: 'perfect' | 'good' | 'damaged';
      photos?: string[];
      notes?: string;
    }
  ): Promise<void> {
    try {
      await this.stateManager.confirmReceived(transactionId, receiverId, evidence);
      
      this.monitor.logInfo('Transaction receipt confirmation', {
        transactionId,
        receiverId
      });
    } catch (error) {
      this.monitor.logError(error as Error, {
        operation: 'confirm_received',
        transactionId,
        receiverId
      });
      throw error;
    }
  }

  /**
   * Create a dispute
   */
  public async createDispute(
    transactionId: string,
    disputeCreator: string,
    disputeType: 'not_received' | 'wrong_item' | 'damaged' | 'quantity_mismatch',
    evidence: any
  ): Promise<void> {
    try {
      // Validate dispute
      const transaction = this.stateManager.getTransaction(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const validation = await this.validationEngine.validateDispute(
        transaction,
        disputeType,
        evidence
      );

      if (!validation.isValid) {
        throw new Error(validation.reason);
      }

      // Create dispute
      await this.stateManager.createDispute(
        transactionId,
        disputeCreator,
        disputeType,
        evidence
      );

      this.monitor.logInfo('Dispute created', {
        transactionId,
        disputeCreator,
        disputeType
      });
    } catch (error) {
      this.monitor.logError(error as Error, {
        operation: 'create_dispute',
        transactionId,
        disputeCreator
      });
      throw error;
    }
  }

  /**
   * Get pending transactions for a participant
   */
  public async getPendingTransactions(participantId: string): Promise<any[]> {
    try {
      const pending = this.stateManager.getPendingTransactions(participantId);
      
      return pending.map(tx => ({
        id: tx.id,
        state: tx.state,
        role: tx.sender === participantId ? 'sender' : 'receiver',
        counterparty: tx.sender === participantId ? tx.receiver : tx.sender,
        item: tx.itemId,
        value: tx.value,
        created: tx.created,
        timeoutIn: Math.floor((tx.timeoutAt.getTime() - Date.now()) / 3600000) // hours
      }));
    } catch (error) {
      this.monitor.logError(error as Error, {
        operation: 'get_pending_transactions',
        participantId
      });
      throw error;
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle notifications
    this.fabricAdapter.on('notification:send', async (data) => {
      try {
        await this.sendNotification(data);
      } catch (error) {
        this.monitor.logError(error as Error, {
          operation: 'send_notification',
          data
        });
      }
    });

    // Handle validation completions
    this.stateManager.on('transaction:validated', (transaction) => {
      this.monitor.logInfo('Transaction validated', {
        transactionId: transaction.id,
        sender: transaction.sender,
        receiver: transaction.receiver,
        value: transaction.value
      });
    });

    // Handle timeouts
    this.stateManager.on('transaction:timeout', (transaction) => {
      this.monitor.logInfo('Transaction timeout', {
        transactionId: transaction.id,
        state: transaction.state
      });
    });

    // Handle disputes
    this.stateManager.on('transaction:disputed', (transaction) => {
      this.monitor.logInfo('Transaction disputed', {
        transactionId: transaction.id
      });
    });
  }

  /**
   * Setup consensus-specific monitoring
   */
  private setupConsensusMonitoring(): void {
    // Monitor validation performance
    this.validationEngine.on('validation:completed', (data) => {
      // Record metrics
    });

    // Monitor anomaly detection
    this.validationEngine.on('warning:anomalies_detected', (data) => {
      this.monitor.logInfo('Anomalies detected', data);
    });
  }

  /**
   * Send notification (placeholder - would integrate with notification service)
   */
  private async sendNotification(data: any): Promise<void> {
    console.log('Notification required:', data);
    // In production, this would:
    // - Send emails via SendGrid/SES
    // - Send SMS via Twilio
    // - Send in-app notifications via WebSocket
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Example usage
async function example() {
  const brandId = 'luxe-bags';
  const consensus = new ConsensusSystem(brandId);

  // Initialize with brand owner credentials
  await consensus.initialize('luxebags', 'admin');

  // Create a transaction (supplier to manufacturer)
  const txId = await consensus.createB2BTransaction({
    sender: 'italianleather',
    receiver: 'craftworkshop',
    itemId: 'LEATHER-BATCH-001',
    value: 5000,
    metadata: {
      quantity: 100,
      unit: 'sq_meters',
      quality: 'premium'
    }
  });

  console.log(`Transaction created: ${txId}`);

  // Supplier confirms sending
  await consensus.confirmSent(txId, 'italianleather', {
    shippingLabel: 'SL123456',
    trackingNumber: 'IT123456789'
  });

  console.log('Supplier confirmed sending');

  // Manufacturer confirms receipt
  await consensus.confirmReceived(txId, 'craftworkshop', {
    condition: 'perfect',
    notes: 'All materials received in good condition'
  });

  console.log('Manufacturer confirmed receipt');
  console.log('Transaction automatically validated!');

  // Check pending transactions
  const pending = await consensus.getPendingTransactions('craftworkshop');
  console.log('Pending transactions:', pending);
}