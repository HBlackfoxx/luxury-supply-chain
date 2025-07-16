// consensus/2check/core/state/state-manager.ts
// State management for 2-Check consensus transactions

import { EventEmitter } from 'events';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export enum TransactionState {
  INITIATED = 'INITIATED',
  CREATED = 'CREATED',
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  VALIDATED = 'VALIDATED',
  DISPUTED = 'DISPUTED',
  TIMEOUT = 'TIMEOUT',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED'
}

export interface StateTransition {
  from: TransactionState;
  to: TransactionState;
  timestamp: Date;
  actor: string;
  reason?: string;
  evidence?: any;
}

export interface Transaction {
  id: string;
  state: TransactionState;
  sender: string;
  receiver: string;
  itemId: string;
  itemType?: string;
  value: number;
  created: Date;
  updated: Date;
  timestamp: Date;
  senderConfirmed?: Date;
  receiverConfirmed?: Date;
  timeoutAt: Date;
  stateHistory: StateTransition[];
  metadata?: Record<string, any>;
  brand?: string;
  batchId?: string;
  stakeholders?: string[];
}

export interface StateConfig {
  initial: string;
  terminal: string[];
  transitions: Record<string, string[]>;
}

export class TransactionStateManager extends EventEmitter {
  private config: any;
  private stateConfig!: StateConfig;
  private transactions: Map<string, Transaction> = new Map();

  constructor(configPath?: string) {
    super();
    this.loadConfig(configPath);
    this.startTimeoutChecker();
  }

  private loadConfig(configPath?: string) {
    const defaultPath = path.join(__dirname, '../../config/2check-config.yaml');
    const configFile = configPath || defaultPath;
    
    const configContent = fs.readFileSync(configFile, 'utf8');
    this.config = yaml.load(configContent) as any;
    this.stateConfig = this.config.consensus.states;
  }

  /**
   * Create a new transaction
   */
  public async createTransaction(params: {
    id: string;
    sender: string;
    receiver: string;
    itemId: string;
    value: number;
    metadata?: Record<string, any>;
  }): Promise<Transaction> {
    if (this.transactions.has(params.id)) {
      throw new Error(`Transaction ${params.id} already exists`);
    }

    const timeout = this.calculateTimeout(params);
    const now = new Date();

    const transaction: Transaction = {
      id: params.id,
      state: TransactionState.CREATED,
      sender: params.sender,
      receiver: params.receiver,
      itemId: params.itemId,
      itemType: params.metadata?.itemType,
      value: params.value,
      created: now,
      updated: now,
      timestamp: now,
      timeoutAt: new Date(now.getTime() + timeout * 60 * 60 * 1000),
      stateHistory: [{
        from: TransactionState.CREATED,
        to: TransactionState.CREATED,
        timestamp: now,
        actor: params.sender
      }],
      metadata: params.metadata,
      brand: params.metadata?.brand,
      batchId: params.metadata?.batchId,
      stakeholders: params.metadata?.stakeholders
    };

    this.transactions.set(params.id, transaction);
    this.emit('transaction:created', transaction);
    
    return transaction;
  }

  /**
   * Transition transaction to new state
   */
  public async transitionState(
    transactionId: string,
    newState: TransactionState,
    actor: string,
    data?: {
      reason?: string;
      evidence?: any;
    }
  ): Promise<Transaction> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Check if transition is valid
    if (!this.isValidTransition(transaction.state, newState)) {
      throw new Error(
        `Invalid transition from ${transaction.state} to ${newState}`
      );
    }

    // Check if state is terminal
    if (this.isTerminalState(transaction.state)) {
      throw new Error(
        `Cannot transition from terminal state ${transaction.state}`
      );
    }

    // Record the transition
    const transition: StateTransition = {
      from: transaction.state,
      to: newState,
      timestamp: new Date(),
      actor,
      reason: data?.reason,
      evidence: data?.evidence
    };

    transaction.state = newState;
    transaction.updated = new Date();
    transaction.stateHistory.push(transition);

    // Handle specific state logic
    await this.handleStateChange(transaction, newState, actor);

    this.emit('transaction:state_changed', {
      transaction,
      transition
    });

    return transaction;
  }

  /**
   * Confirm sending (sender action)
   */
  public async confirmSent(
    transactionId: string,
    senderId: string,
    evidence?: any
  ): Promise<Transaction> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.sender !== senderId) {
      throw new Error('Only sender can confirm sending');
    }

    if (transaction.state !== TransactionState.CREATED) {
      throw new Error('Transaction must be in CREATED state');
    }

    transaction.senderConfirmed = new Date();
    
    return this.transitionState(
      transactionId,
      TransactionState.SENT,
      senderId,
      { evidence }
    );
  }

  /**
   * Confirm receipt (receiver action)
   */
  public async confirmReceived(
    transactionId: string,
    receiverId: string,
    evidence?: any
  ): Promise<Transaction> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.receiver !== receiverId) {
      throw new Error('Only receiver can confirm receipt');
    }

    if (transaction.state !== TransactionState.SENT) {
      throw new Error('Transaction must be in SENT state');
    }

    transaction.receiverConfirmed = new Date();
    
    await this.transitionState(
      transactionId,
      TransactionState.RECEIVED,
      receiverId,
      { evidence }
    );

    // Auto-validate if both confirmed
    if (this.config.consensus.validation.auto_validate_on_both_confirmations) {
      return this.transitionState(
        transactionId,
        TransactionState.VALIDATED,
        'system',
        { reason: 'Auto-validated after both confirmations' }
      );
    }

    return transaction;
  }

  /**
   * Create a dispute
   */
  public async createDispute(
    transactionId: string,
    disputeCreator: string,
    disputeType: string,
    evidence: any
  ): Promise<Transaction> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Check if dispute creator is involved
    if (transaction.sender !== disputeCreator && 
        transaction.receiver !== disputeCreator) {
      throw new Error('Only participants can create disputes');
    }

    // Check if state allows disputes
    const disputeableStates = [
      TransactionState.SENT,
      TransactionState.RECEIVED
    ];
    
    if (!disputeableStates.includes(transaction.state)) {
      throw new Error(`Cannot dispute transaction in ${transaction.state} state`);
    }

    return this.transitionState(
      transactionId,
      TransactionState.DISPUTED,
      disputeCreator,
      {
        reason: disputeType,
        evidence
      }
    );
  }

  /**
   * Check if a state transition is valid
   */
  private isValidTransition(
    from: TransactionState,
    to: TransactionState
  ): boolean {
    const allowedTransitions = this.stateConfig.transitions[from];
    return allowedTransitions ? allowedTransitions.includes(to) : false;
  }

  /**
   * Check if state is terminal
   */
  private isTerminalState(state: TransactionState): boolean {
    return this.stateConfig.terminal.includes(state);
  }

  /**
   * Calculate timeout based on transaction parameters
   */
  private calculateTimeout(params: any): number {
    const categories = this.config.consensus.timeouts.categories;
    
    // Check each category
    for (const category of categories) {
      if (this.matchesCondition(params, category.condition)) {
        return category.timeout;
      }
    }
    
    // Return default timeout
    return this.config.consensus.timeouts.default;
  }

  /**
   * Check if parameters match a condition
   */
  private matchesCondition(params: any, condition: any): boolean {
    const value = this.getNestedValue(params, condition.field);
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'greater_than':
        return value > condition.value;
      case 'less_than':
        return value < condition.value;
      default:
        return false;
    }
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }

  /**
   * Handle specific state change logic
   */
  private async handleStateChange(
    transaction: Transaction,
    newState: TransactionState,
    _actor: string
  ): Promise<void> {
    switch (newState) {
      case TransactionState.SENT:
        // Notify receiver
        this.emit('notification:required', {
          type: 'transaction_sent',
          transaction,
          recipients: [transaction.receiver]
        });
        break;
        
      case TransactionState.DISPUTED:
        // Notify both parties and brand owner
        this.emit('notification:required', {
          type: 'dispute_created',
          transaction,
          recipients: [
            transaction.sender,
            transaction.receiver,
            'brand_owner'
          ]
        });
        break;
        
      case TransactionState.TIMEOUT:
        // Auto-escalate based on config
        this.emit('notification:required', {
          type: 'timeout',
          transaction,
          recipients: [
            transaction.sender,
            transaction.receiver,
            'brand_owner'
          ]
        });
        break;
        
      case TransactionState.VALIDATED:
        // Update trust scores
        this.emit('trust:update_required', {
          transaction,
          updates: [
            {
              participant: transaction.sender,
              action: 'successful_transaction',
              value: transaction.value
            },
            {
              participant: transaction.receiver,
              action: 'successful_transaction',
              value: transaction.value
            }
          ]
        });
        break;
    }
  }

  /**
   * Periodic timeout checker
   */
  private startTimeoutChecker(): void {
    setInterval(() => {
      const now = new Date();
      
      for (const [id, transaction] of this.transactions) {
        // Skip if already in terminal state
        if (this.isTerminalState(transaction.state)) {
          continue;
        }
        
        // Check for timeout
        if (transaction.timeoutAt < now) {
          this.transitionState(
            id,
            TransactionState.TIMEOUT,
            'system',
            { reason: 'Transaction timeout exceeded' }
          ).catch(err => {
            console.error(`Failed to timeout transaction ${id}:`, err);
          });
        } else {
          // Check for reminders
          this.checkReminders(transaction);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Check if reminders need to be sent
   */
  private checkReminders(transaction: Transaction): void {
    const now = new Date();
    const timeUntilTimeout = transaction.timeoutAt.getTime() - now.getTime();
    const hoursUntilTimeout = timeUntilTimeout / (1000 * 60 * 60);
    
    const reminders = this.config.consensus.timeouts.reminders;
    
    // Determine which party needs reminder
    let recipientNeedsReminder = null;
    if (transaction.state === TransactionState.CREATED) {
      recipientNeedsReminder = transaction.sender;
    } else if (transaction.state === TransactionState.SENT) {
      recipientNeedsReminder = transaction.receiver;
    }
    
    if (!recipientNeedsReminder) return;
    
    // Check each reminder threshold
    for (const [reminderType, hours] of Object.entries(reminders)) {
      if (hoursUntilTimeout <= (hours as number) && hoursUntilTimeout > (hours as number) - 1) {
        this.emit('notification:required', {
          type: 'reminder',
          reminderType,
          transaction,
          recipients: [recipientNeedsReminder],
          hoursRemaining: Math.floor(hoursUntilTimeout)
        });
      }
    }
  }

  /**
   * Get transaction by ID
   */
  public getTransaction(transactionId: string): Transaction | undefined {
    return this.transactions.get(transactionId);
  }

  /**
   * Get transactions by state
   */
  public getTransactionsByState(state: TransactionState): Transaction[] {
    return Array.from(this.transactions.values())
      .filter(tx => tx.state === state);
  }

  /**
   * Get pending transactions for a participant
   */
  public getPendingTransactions(participantId: string): Transaction[] {
    return Array.from(this.transactions.values())
      .filter(tx => {
        if (tx.state === TransactionState.CREATED && tx.sender === participantId) {
          return true;
        }
        if (tx.state === TransactionState.SENT && tx.receiver === participantId) {
          return true;
        }
        return false;
      });
  }

  /**
   * Update transaction state (simple version for integration)
   */
  public async updateState(transactionId: string, newState: TransactionState): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.state = newState;
      transaction.updated = new Date();
      this.emit('state:updated', { transactionId, newState });
    }
  }
}

// Export alias for convenience
export { TransactionStateManager as StateManager };