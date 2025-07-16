import { Gateway, Contract, Network } from '@hyperledger/fabric-gateway';
import { EventEmitter } from 'events';
import { TransactionStateManager as StateManager } from '../core/state/state-manager';
import { ValidationEngine } from '../core/validation/validation-engine';
import { TimeoutHandler } from '../core/timeout/timeout-handler';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';
import { DisputeResolution } from '../exceptions/disputes/dispute-resolution';
import { Transaction, TransactionState, TransactionParty } from '../core/types';

export interface FabricConfig {
  channelName: string;
  chaincodeName: string;
  mspId: string;
  walletPath: string;
  connectionProfile: any;
}

export interface ConsensusEvent {
  transactionId: string;
  type: string;
  payload: any;
  timestamp: Date;
}

export class FabricIntegration extends EventEmitter {
  private gateway!: Gateway;
  private network!: Network;
  private contract!: Contract;
  private stateManager: StateManager;
  private validationEngine: ValidationEngine;
  private timeoutHandler: TimeoutHandler;
  private trustSystem: TrustScoringSystem;
  private disputeResolution: DisputeResolution;
  private eventListeners: Map<string, any>;

  constructor(
    private config: FabricConfig,
    stateManager: StateManager,
    validationEngine: ValidationEngine,
    timeoutHandler: TimeoutHandler,
    trustSystem: TrustScoringSystem,
    disputeResolution: DisputeResolution
  ) {
    super();
    this.stateManager = stateManager;
    this.validationEngine = validationEngine;
    this.timeoutHandler = timeoutHandler;
    this.trustSystem = trustSystem;
    this.disputeResolution = disputeResolution;
    this.eventListeners = new Map();
  }

  public async connect(): Promise<void> {
    try {
      // Initialize gateway connection
      // In production, this would use proper wallet and connection setup
      console.log('Connecting to Fabric network...');
      
      // Set up event listeners
      await this.setupEventListeners();
      
      this.emit('connected', {
        channelName: this.config.channelName,
        chaincodeName: this.config.chaincodeName
      });
    } catch (error) {
      console.error('Failed to connect to Fabric network:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    // Clean up event listeners
    for (const [eventName, listener] of this.eventListeners) {
      // Remove listener
      this.eventListeners.delete(eventName);
    }

    if (this.gateway) {
      this.gateway.close();
    }

    this.emit('disconnected');
  }

  private async setupEventListeners(): Promise<void> {
    // Listen for 2-Check consensus events
    await this.listenForConsensusEvents();
    
    // Listen for dispute events
    await this.listenForDisputeEvents();
    
    // Listen for trust score updates
    await this.listenForTrustEvents();
  }

  private async listenForConsensusEvents(): Promise<void> {
    const eventName = 'ConsensusEvent';
    
    // In production, this would use contract.addContractListener
    const listener = async (event: any) => {
      await this.handleConsensusEvent(event);
    };

    this.eventListeners.set(eventName, listener);
  }

  private async listenForDisputeEvents(): Promise<void> {
    const eventName = 'DisputeEvent';
    
    const listener = async (event: any) => {
      await this.handleDisputeEvent(event);
    };

    this.eventListeners.set(eventName, listener);
  }

  private async listenForTrustEvents(): Promise<void> {
    const eventName = 'TrustScoreEvent';
    
    const listener = async (event: any) => {
      await this.handleTrustEvent(event);
    };

    this.eventListeners.set(eventName, listener);
  }

  private async handleConsensusEvent(event: any): Promise<void> {
    const consensusEvent: ConsensusEvent = {
      transactionId: event.transactionId,
      type: event.eventType,
      payload: event.payload,
      timestamp: new Date(event.timestamp)
    };

    switch (consensusEvent.type) {
      case 'CONFIRMATION_SENT':
        await this.processSentConfirmation(consensusEvent);
        break;
        
      case 'CONFIRMATION_RECEIVED':
        await this.processReceivedConfirmation(consensusEvent);
        break;
        
      case 'TIMEOUT_WARNING':
        await this.processTimeoutWarning(consensusEvent);
        break;
        
      case 'AUTO_CONFIRMATION':
        await this.processAutoConfirmation(consensusEvent);
        break;
        
      default:
        console.warn(`Unknown consensus event type: ${consensusEvent.type}`);
    }

    this.emit('consensus_event', consensusEvent);
  }

  private async handleDisputeEvent(event: any): Promise<void> {
    const disputeData = {
      disputeId: event.disputeId,
      transactionId: event.transactionId,
      type: event.disputeType,
      parties: event.parties,
      timestamp: new Date(event.timestamp)
    };

    await this.disputeResolution.handleDisputeEvent(disputeData);
    this.emit('dispute_event', disputeData);
  }

  private async handleTrustEvent(event: any): Promise<void> {
    const trustData = {
      partyId: event.partyId,
      oldScore: event.oldScore,
      newScore: event.newScore,
      reason: event.reason,
      timestamp: new Date(event.timestamp)
    };

    // Update local trust cache
    await this.trustSystem.syncScore(trustData.partyId, trustData.newScore);
    this.emit('trust_event', trustData);
  }

  // Transaction submission methods
  public async submitTransaction(transaction: Transaction): Promise<string> {
    try {
      // Validate transaction locally first
      const validationResult = await this.validationEngine.validate(transaction);
      if (!validationResult.isValid) {
        throw new Error(`Transaction validation failed: ${validationResult.errors?.join(', ') || 'Unknown error'}`);
      }

      // Submit to chaincode
      const result = await this.invokeChaincode('submitTransaction', {
        transactionId: transaction.id,
        sender: transaction.sender,
        receiver: transaction.receiver,
        itemType: transaction.itemType,
        timestamp: transaction.timestamp.toISOString(),
        metadata: transaction.metadata
      });

      // Update local state
      await this.stateManager.updateState(transaction.id, TransactionState.INITIATED);
      
      // Start timeout monitoring
      await this.timeoutHandler.startTimeout(transaction.id);

      return result.transactionId;
    } catch (error) {
      console.error('Failed to submit transaction:', error);
      throw error;
    }
  }

  public async confirmSent(transactionId: string, sender: string): Promise<void> {
    try {
      // Submit confirmation to chaincode
      await this.invokeChaincode('confirmSent', {
        transactionId,
        sender,
        timestamp: new Date().toISOString()
      });

      // Update local state
      await this.stateManager.updateState(transactionId, TransactionState.SENT);
      
      // Update timeout (reset with new phase)
      await this.timeoutHandler.updateTimeout(transactionId, 'sent');

    } catch (error) {
      console.error('Failed to confirm sent:', error);
      throw error;
    }
  }

  public async confirmReceived(transactionId: string, receiver: string): Promise<void> {
    try {
      // Submit confirmation to chaincode
      await this.invokeChaincode('confirmReceived', {
        transactionId,
        receiver,
        timestamp: new Date().toISOString()
      });

      // Update local state
      await this.stateManager.updateState(transactionId, TransactionState.RECEIVED);
      
      // Clear timeout
      await this.timeoutHandler.clearTimeout(transactionId);
      
      // Trigger validation
      const transaction = await this.getTransaction(transactionId);
      const validationResult = await this.validationEngine.performConsensus(transaction);
      
      if (validationResult.consensus) {
        await this.stateManager.updateState(transactionId, TransactionState.VALIDATED);
        
        // Update trust scores positively
        await this.trustSystem.updateScore(transaction.sender, 0.01, 'successful_transaction');
        await this.trustSystem.updateScore(transaction.receiver, 0.01, 'successful_transaction');
      }

    } catch (error) {
      console.error('Failed to confirm received:', error);
      throw error;
    }
  }

  // Query methods
  public async getTransaction(transactionId: string): Promise<Transaction> {
    try {
      const result = await this.queryChaincode('getTransaction', { transactionId });
      
      return {
        id: result.transactionId,
        sender: result.sender,
        receiver: result.receiver,
        state: result.state as TransactionState,
        timestamp: new Date(result.timestamp),
        itemType: result.itemType,
        itemId: result.itemId || '',
        value: result.value || 0,
        created: new Date(result.created || result.timestamp),
        updated: new Date(result.updated || result.timestamp),
        timeoutAt: new Date(result.timeoutAt || Date.now() + 86400000),
        stateHistory: result.stateHistory || [],
        metadata: result.metadata
      };
    } catch (error) {
      console.error('Failed to get transaction:', error);
      throw error;
    }
  }

  public async getTransactionHistory(transactionId: string): Promise<any[]> {
    try {
      const result = await this.queryChaincode('getTransactionHistory', { transactionId });
      return result.history;
    } catch (error) {
      console.error('Failed to get transaction history:', error);
      throw error;
    }
  }

  private async processSentConfirmation(event: ConsensusEvent): Promise<void> {
    const { transactionId, payload } = event;
    
    // Update local state
    await this.stateManager.updateState(transactionId, TransactionState.SENT);
    
    // Reset timeout for receiver confirmation
    await this.timeoutHandler.updateTimeout(transactionId, 'awaiting_receiver');
  }

  private async processReceivedConfirmation(event: ConsensusEvent): Promise<void> {
    const { transactionId, payload } = event;
    
    // Update local state
    await this.stateManager.updateState(transactionId, TransactionState.RECEIVED);
    
    // Clear timeout
    await this.timeoutHandler.clearTimeout(transactionId);
    
    // Perform validation
    const transaction = await this.getTransaction(transactionId);
    await this.validationEngine.performConsensus(transaction);
  }

  private async processTimeoutWarning(event: ConsensusEvent): Promise<void> {
    const { transactionId, payload } = event;
    
    // Trigger escalation
    const transaction = await this.getTransaction(transactionId);
    const timeoutPercent = payload.timeoutPercent || 80;
    
    this.emit('timeout_warning', {
      transactionId,
      timeoutPercent,
      transaction
    });
  }

  private async processAutoConfirmation(event: ConsensusEvent): Promise<void> {
    const { transactionId, payload } = event;
    
    // Auto-confirmation based on trust score
    await this.stateManager.updateState(transactionId, TransactionState.VALIDATED);
    
    this.emit('auto_confirmed', {
      transactionId,
      trustScore: payload.trustScore,
      reason: payload.reason
    });
  }

  // Helper methods for chaincode interaction
  private async invokeChaincode(functionName: string, args: any): Promise<any> {
    // In production, this would use contract.submit
    console.log(`Invoking chaincode function: ${functionName}`, args);
    
    // Simulate chaincode response
    return {
      success: true,
      transactionId: args.transactionId || 'tx_' + Date.now(),
      ...args
    };
  }

  private async queryChaincode(functionName: string, args: any): Promise<any> {
    // In production, this would use contract.evaluate
    console.log(`Querying chaincode function: ${functionName}`, args);
    
    // Simulate chaincode response
    return {
      success: true,
      ...args,
      // Mock data
      state: TransactionState.INITIATED,
      timestamp: new Date().toISOString(),
      history: []
    };
  }

  // Batch operations
  public async submitBatch(transactions: Transaction[]): Promise<string[]> {
    const results: string[] = [];
    
    // Process in chunks to avoid overwhelming the network
    const chunkSize = 50;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      
      const chunkResults = await Promise.all(
        chunk.map(tx => this.submitTransaction(tx))
      );
      
      results.push(...chunkResults);
    }
    
    return results;
  }

  // Analytics and reporting
  public async getNetworkStats(): Promise<any> {
    try {
      const stats = await this.queryChaincode('getNetworkStats', {});
      
      return {
        totalTransactions: stats.totalTransactions || 0,
        pendingTransactions: stats.pendingTransactions || 0,
        disputedTransactions: stats.disputedTransactions || 0,
        averageConfirmationTime: stats.averageConfirmationTime || 0,
        trustScoreAverage: stats.trustScoreAverage || 0
      };
    } catch (error) {
      console.error('Failed to get network stats:', error);
      throw error;
    }
  }
}