// backend/consensus/fabric-consensus-adapter.ts
// Integrates 2-Check consensus with existing Fabric Gateway

import { Contract } from '@hyperledger/fabric-gateway';
import { GatewayManager } from '../gateway/src/fabric/gateway-manager';
import { TransactionHandler } from '../gateway/src/fabric/transaction-handler';
import { EventListenerManager } from '../gateway/src/fabric/event-listener';
import { TransactionStateManager, TransactionState, Transaction } from '../../consensus/2check/core/state/state-manager';
import { EventEmitter } from 'events';
import { mapTsStateToGo, trustScoreConverter } from '../../consensus/2check/integration/state-mapping';

export interface ConsensusTransaction {
  id: string;
  sender: string;
  receiver: string;
  itemId: string;
  value: number;
  state: string;
  senderConfirmed: boolean;
  receiverConfirmed: boolean;
  created: string;
  updated: string;
  timeoutAt: string;
  metadata?: any;
}

export class FabricConsensusAdapter extends EventEmitter {
  private stateManager: TransactionStateManager;
  private gatewayManager: GatewayManager;
  private transactionHandler: TransactionHandler;
  private eventListener: EventListenerManager;
  private contract?: Contract;
  private channelName: string;
  private chaincodeName: string;

  constructor(
    stateManager: TransactionStateManager,
    gatewayManager: GatewayManager,
    transactionHandler: TransactionHandler,
    eventListener: EventListenerManager,
    channelName: string = 'luxury-supply-chain',
    chaincodeName: string = 'consensus'
  ) {
    super();
    this.stateManager = stateManager;
    this.gatewayManager = gatewayManager;
    this.transactionHandler = transactionHandler;
    this.eventListener = eventListener;
    this.channelName = channelName;
    this.chaincodeName = chaincodeName;

    // Listen to state manager events
    this.setupEventListeners();
  }

  /**
   * Initialize connection to chaincode
   */
  public async initialize(orgId: string, userId: string): Promise<void> {
    try {
      const gateway = await this.gatewayManager.connect({ orgId, userId });
      const network = await this.gatewayManager.getNetwork(gateway, this.channelName);
      this.contract = await this.gatewayManager.getContract(network, this.chaincodeName);

      // Start listening to chaincode events
      await this.startChaincodeEventListeners(network);

      console.log('Fabric consensus adapter initialized');
    } catch (error) {
      console.error('Failed to initialize Fabric consensus adapter:', error);
      throw error;
    }
  }

  /**
   * Create transaction on blockchain
   */
  public async createTransactionOnChain(transaction: Transaction): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const chaincodeTransaction: ConsensusTransaction = {
      id: transaction.id,
      sender: transaction.sender,
      receiver: transaction.receiver,
      itemId: transaction.itemId,
      value: transaction.value,
      state: mapTsStateToGo(transaction.state),
      senderConfirmed: false,
      receiverConfirmed: false,
      created: transaction.created.toISOString(),
      updated: transaction.updated.toISOString(),
      timeoutAt: transaction.timeoutAt.toISOString(),
      metadata: transaction.metadata
    };

    const result = await this.transactionHandler.submitTransaction(
      this.contract,
      'SubmitTransaction',
      {
        arguments: [
          transaction.id,
          transaction.sender,
          transaction.receiver,
          transaction.itemType || 'product_transfer',
          transaction.itemId,
          JSON.stringify(transaction.metadata || {})
        ]
      }
    );

    if (!result.success) {
      throw new Error(`Failed to create transaction on chain: ${result.error}`);
    }

    this.emit('transaction:created_on_chain', {
      transaction,
      blockNumber: result.blockNumber,
      transactionId: result.transactionId
    });
  }

  /**
   * Update transaction state on blockchain
   */
  public async updateTransactionState(
    transactionId: string,
    newState: TransactionState,
    actor: string,
    evidence?: any
  ): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    // Map TypeScript state to Go state
    
    // The Go chaincode doesn't have a generic updateTransactionState
    // We need to use the specific functions based on the state
    let result;
    
    switch (newState) {
      case TransactionState.SENT:
        result = await this.transactionHandler.submitTransaction(
          this.contract,
          'ConfirmSent',
          {
            arguments: [transactionId, actor]
          }
        );
        break;
      case TransactionState.RECEIVED:
        result = await this.transactionHandler.submitTransaction(
          this.contract,
          'ConfirmReceived',
          {
            arguments: [transactionId, actor]
          }
        );
        break;
      case TransactionState.DISPUTED:
        result = await this.transactionHandler.submitTransaction(
          this.contract,
          'RaiseDispute',
          {
            arguments: [transactionId, actor, evidence?.reason || 'Dispute raised']
          }
        );
        break;
      default:
        // For other states, we might need to implement additional functions in the chaincode
        throw new Error(`State transition to ${newState} not supported via direct chaincode call`);
    }

    if (!result.success) {
      throw new Error(`Failed to update state on chain: ${result.error}`);
    }

    this.emit('state:updated_on_chain', {
      transactionId,
      newState,
      blockNumber: result.blockNumber
    });
  }

  /**
   * Confirm sending on blockchain
   */
  public async confirmSentOnChain(
    transactionId: string,
    senderId: string,
    evidence?: any
  ): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    // Direct call to chaincode with required parameters

    const result = await this.transactionHandler.submitTransaction(
      this.contract,
      'ConfirmSent',
      {
        arguments: [transactionId, senderId]
      }
    );

    if (!result.success) {
      throw new Error(`Failed to confirm sending on chain: ${result.error}`);
    }
  }

  /**
   * Confirm receipt on blockchain
   */
  public async confirmReceivedOnChain(
    transactionId: string,
    receiverId: string,
    evidence?: any
  ): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    // Direct call to chaincode with required parameters

    const result = await this.transactionHandler.submitTransaction(
      this.contract,
      'ConfirmReceived',
      {
        arguments: [transactionId, receiverId]
      }
    );

    if (!result.success) {
      throw new Error(`Failed to confirm receipt on chain: ${result.error}`);
    }
  }

  /**
   * Create dispute on blockchain
   */
  public async createDisputeOnChain(
    transactionId: string,
    disputeCreator: string,
    disputeType: string,
    evidence: any
  ): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    // Direct call to chaincode with required parameters

    const result = await this.transactionHandler.submitTransaction(
      this.contract,
      'RaiseDispute',
      {
        arguments: [transactionId, disputeCreator, disputeType]
      }
    );

    if (!result.success) {
      throw new Error(`Failed to create dispute on chain: ${result.error}`);
    }
  }

  /**
   * Query transaction from blockchain
   */
  public async queryTransaction(transactionId: string): Promise<ConsensusTransaction | null> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const result = await this.transactionHandler.evaluateTransaction(
      this.contract,
      'GetTransaction',
      transactionId
    );

    if (!result.success || !result.result) {
      return null;
    }

    return result.result as ConsensusTransaction;
  }

  /**
   * Query pending transactions for a participant
   */
  public async queryPendingTransactions(participantId: string): Promise<ConsensusTransaction[]> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const result = await this.transactionHandler.evaluateTransaction(
      this.contract,
      'queryPendingTransactions',
      participantId
    );

    if (!result.success || !result.result) {
      return [];
    }

    return result.result as ConsensusTransaction[];
  }

  /**
   * Setup event listeners for state manager
   */
  private setupEventListeners(): void {
    // When transaction is created locally, create on chain
    this.stateManager.on('transaction:created', async (transaction: Transaction) => {
      try {
        await this.createTransactionOnChain(transaction);
      } catch (error) {
        console.error('Failed to create transaction on chain:', error);
        this.emit('error', error);
      }
    });

    // When state changes locally, update on chain
    this.stateManager.on('transaction:state_changed', async (data: any) => {
      try {
        await this.updateTransactionState(
          data.transaction.id,
          data.transaction.state,
          data.transition.actor,
          data.transition.evidence
        );
      } catch (error) {
        console.error('Failed to update state on chain:', error);
        this.emit('error', error);
      }
    });

    // Handle notifications
    this.stateManager.on('notification:required', (data: any) => {
      this.emit('notification:send', data);
    });

    // Handle trust score updates
    this.stateManager.on('trust:update_required', async (data: any) => {
      try {
        await this.updateTrustScores(data.updates);
      } catch (error) {
        console.error('Failed to update trust scores:', error);
        this.emit('error', error);
      }
    });
  }

  /**
   * Start listening to chaincode events
   */
  private async startChaincodeEventListeners(network: any): Promise<void> {
    // Listen for consensus events from chaincode
    const events = [
      'TransactionCreated',
      'StateUpdated',
      'SenderConfirmed',
      'ReceiverConfirmed',
      'DisputeCreated',
      'TransactionValidated',
      'TransactionTimeout'
    ];

    for (const eventName of events) {
      await this.eventListener.addChaincodeListener(
        network,
        this.chaincodeName,
        eventName,
        async (event) => {
          await this.handleChaincodeEvent(eventName, event);
        }
      );
    }
  }

  /**
   * Handle events from chaincode
   */
  private async handleChaincodeEvent(eventName: string, event: any): Promise<void> {
    try {
      const payload = JSON.parse(new TextDecoder().decode(event.payload));
      
      switch (eventName) {
        case 'TransactionCreated':
          // Sync with local state if needed
          if (!this.stateManager.getTransaction(payload.transactionId)) {
            // Transaction created on chain but not locally
            this.emit('transaction:sync_required', payload);
          }
          break;
          
        case 'StateUpdated':
          // Verify local state matches chain state
          const localTx = this.stateManager.getTransaction(payload.transactionId);
          if (localTx && localTx.state !== payload.newState) {
            this.emit('state:sync_required', payload);
          }
          break;
          
        case 'TransactionTimeout':
          // Handle timeout from chain
          await this.stateManager.transitionState(
            payload.transactionId,
            TransactionState.TIMEOUT,
            'system',
            { reason: 'Timeout detected by chaincode' }
          );
          break;
      }
      
      // Emit event for external listeners
      this.emit(`chaincode:${eventName}`, payload);
    } catch (error) {
      console.error(`Error handling chaincode event ${eventName}:`, error);
    }
  }

  /**
   * Update trust scores on chain
   */
  private async updateTrustScores(updates: any[]): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    for (const update of updates) {
      const result = await this.transactionHandler.submitTransaction(
        this.contract,
        'updateTrustScore',
        {
          arguments: [JSON.stringify(update)]
        }
      );

      if (!result.success) {
        console.error(`Failed to update trust score for ${update.participant}:`, result.error);
      }
    }
  }

  /**
   * Batch operations for trusted partners
   */
  public async submitBatchTransactions(
    transactions: Transaction[],
    submitterId: string
  ): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    // Check if submitter is allowed batch operations
    const trustScore = await this.getTrustScore(submitterId);
    const minScore = 100; // TypeScript scale (0-200)
    
    if (trustScore < minScore) {
      throw new Error('Insufficient trust score for batch operations');
    }

    // Submit batch
    const batch = transactions.map(tx => ({
      id: tx.id,
      sender: tx.sender,
      receiver: tx.receiver,
      itemId: tx.itemId,
      value: tx.value,
      metadata: tx.metadata
    }));

    const result = await this.transactionHandler.submitTransaction(
      this.contract,
      'submitBatchTransactions',
      {
        arguments: [JSON.stringify(batch), submitterId]
      }
    );

    if (!result.success) {
      throw new Error(`Failed to submit batch transactions: ${result.error}`);
    }

    // Create local transactions
    for (const tx of transactions) {
      await this.stateManager.createTransaction(tx);
    }
  }

  /**
   * Get trust score for a participant
   */
  private async getTrustScore(participantId: string): Promise<number> {
    if (!this.contract) {
      throw new Error('Contract not initialized');
    }

    const result = await this.transactionHandler.evaluateTransaction(
      this.contract,
      'GetTrustScore',
      participantId
    );

    if (!result.success || !result.result) {
      return 0;
    }

    // Convert Go trust score (0-1) to TypeScript scale (0-200)
    const goScore = result.result as number;
    return trustScoreConverter.goToTs(goScore);
  }
}