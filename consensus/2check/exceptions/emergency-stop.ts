// Emergency Stop System for 2-Check Consensus
// Provides immediate transaction halting capabilities

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../core/types';
import { TransactionStateManager } from '../core/state/state-manager';
import { AnomalyDetector, AnomalyDetectionResult } from '../security/anomaly-detector';

export interface EmergencyStopReason {
  type: 'manual' | 'automatic' | 'ai_triggered' | 'threshold_breach';
  description: string;
  triggeredBy: string;
  severity: 'high' | 'critical';
  affectedTransactions: string[];
  timestamp: Date;
}

export interface EmergencyStopConfig {
  autoTriggerEnabled: boolean;
  riskScoreThreshold: number;
  maxTransactionValue: number;
  blacklistCheckEnabled: boolean;
  requireApprovalToResume: boolean;
}

export class EmergencyStopSystem extends EventEmitter {
  private stateManager: TransactionStateManager;
  private anomalyDetector: AnomalyDetector;
  private config: EmergencyStopConfig;
  private activeStops: Map<string, EmergencyStopReason>;
  private haltedTransactions: Set<string>;
  private approvedParties: Set<string>;
  
  constructor(
    stateManager: TransactionStateManager,
    anomalyDetector: AnomalyDetector,
    config?: Partial<EmergencyStopConfig>
  ) {
    super();
    this.stateManager = stateManager;
    this.anomalyDetector = anomalyDetector;
    this.activeStops = new Map();
    this.haltedTransactions = new Set();
    this.approvedParties = new Set(['brand_owner', 'security_team']);
    
    this.config = {
      autoTriggerEnabled: true,
      riskScoreThreshold: 85,
      maxTransactionValue: 100000,
      blacklistCheckEnabled: true,
      requireApprovalToResume: true,
      ...config
    };
    
    this.setupEventListeners();
  }
  
  /**
   * Manual emergency stop trigger
   */
  public async triggerEmergencyStop(
    triggeredBy: string,
    reason: string,
    transactionIds?: string[]
  ): Promise<void> {
    // Verify authority
    if (!this.approvedParties.has(triggeredBy) && triggeredBy !== 'system') {
      throw new Error('Unauthorized to trigger emergency stop');
    }
    
    const stopReason: EmergencyStopReason = {
      type: 'manual',
      description: reason,
      triggeredBy,
      severity: 'critical',
      affectedTransactions: transactionIds || [],
      timestamp: new Date()
    };
    
    await this.executeEmergencyStop(stopReason);
  }
  
  /**
   * Check if transaction should be auto-stopped
   */
  public async checkTransaction(
    transaction: Transaction,
    anomalyResult?: AnomalyDetectionResult
  ): Promise<boolean> {
    if (!this.config.autoTriggerEnabled) return false;
    
    // Check if already halted
    if (this.haltedTransactions.has(transaction.id)) return true;
    
    // Check value threshold
    if (transaction.value > this.config.maxTransactionValue) {
      await this.autoStop(transaction, 'Transaction exceeds maximum allowed value');
      return true;
    }
    
    // Check anomaly detection results
    if (anomalyResult && anomalyResult.riskScore >= this.config.riskScoreThreshold) {
      await this.autoStop(transaction, `High risk score: ${anomalyResult.riskScore}`);
      return true;
    }
    
    // Check if parties are involved in active stops
    if (this.isPartyHalted(transaction.sender) || this.isPartyHalted(transaction.receiver)) {
      await this.autoStop(transaction, 'Party involved in active emergency stop');
      return true;
    }
    
    return false;
  }
  
  /**
   * Execute emergency stop
   */
  private async executeEmergencyStop(reason: EmergencyStopReason): Promise<void> {
    const stopId = this.generateStopId();
    this.activeStops.set(stopId, reason);
    
    // Halt specific transactions
    if (reason.affectedTransactions.length > 0) {
      for (const txId of reason.affectedTransactions) {
        await this.haltTransaction(txId, reason);
      }
    }
    
    // Emit emergency stop event
    this.emit('emergency_stop_triggered', {
      stopId,
      reason,
      timestamp: new Date()
    });
    
    // Notify relevant parties
    await this.notifyEmergencyStop(stopId, reason);
    
    // Log for audit
    console.log(`[EMERGENCY STOP] ${stopId}: ${reason.description}`);
  }
  
  /**
   * Auto-trigger emergency stop
   */
  private async autoStop(transaction: Transaction, reason: string): Promise<void> {
    const stopReason: EmergencyStopReason = {
      type: 'automatic',
      description: reason,
      triggeredBy: 'system',
      severity: 'high',
      affectedTransactions: [transaction.id],
      timestamp: new Date()
    };
    
    await this.executeEmergencyStop(stopReason);
  }
  
  /**
   * Halt a specific transaction
   */
  private async haltTransaction(
    transactionId: string,
    reason: EmergencyStopReason
  ): Promise<void> {
    try {
      const transaction = this.stateManager.getTransaction(transactionId);
      if (!transaction) return;
      
      // Only halt if not in terminal state
      const terminalStates = [
        TransactionState.VALIDATED,
        TransactionState.CANCELLED,
        TransactionState.RESOLVED
      ];
      
      if (!terminalStates.includes(transaction.state)) {
        // Transition to ESCALATED state
        await this.stateManager.transitionState(
          transactionId,
          TransactionState.ESCALATED,
          'emergency_stop_system',
          {
            reason: reason.description,
            evidence: { emergencyStop: true, stopReason: reason }
          }
        );
        
        this.haltedTransactions.add(transactionId);
      }
    } catch (error) {
      console.error(`Failed to halt transaction ${transactionId}:`, error);
    }
  }
  
  /**
   * Resume halted transactions
   */
  public async resumeTransactions(
    stopId: string,
    approvedBy: string,
    transactionIds?: string[]
  ): Promise<void> {
    const stopReason = this.activeStops.get(stopId);
    if (!stopReason) {
      throw new Error('Invalid stop ID');
    }
    
    // Verify approval
    if (this.config.requireApprovalToResume && !this.approvedParties.has(approvedBy)) {
      throw new Error('Unauthorized to resume transactions');
    }
    
    const txsToResume = transactionIds || stopReason.affectedTransactions;
    
    for (const txId of txsToResume) {
      if (this.haltedTransactions.has(txId)) {
        this.haltedTransactions.delete(txId);
        
        // Emit resume event
        this.emit('transaction_resumed', {
          transactionId: txId,
          stopId,
          approvedBy,
          timestamp: new Date()
        });
      }
    }
    
    // Remove stop if all transactions resumed
    const remainingHalted = stopReason.affectedTransactions.filter(
      txId => this.haltedTransactions.has(txId)
    );
    
    if (remainingHalted.length === 0) {
      this.activeStops.delete(stopId);
      this.emit('emergency_stop_cleared', {
        stopId,
        clearedBy: approvedBy,
        timestamp: new Date()
      });
    }
  }
  
  /**
   * Get active emergency stops
   */
  public getActiveStops(): Array<{ id: string; reason: EmergencyStopReason }> {
    return Array.from(this.activeStops.entries()).map(([id, reason]) => ({
      id,
      reason
    }));
  }
  
  /**
   * Check if a party is involved in halted transactions
   */
  private isPartyHalted(partyId: string): boolean {
    // Check all halted transactions
    for (const txId of this.haltedTransactions) {
      const tx = this.stateManager.getTransaction(txId);
      if (tx && (tx.sender === partyId || tx.receiver === partyId)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for high-risk anomalies
    this.anomalyDetector.on('anomaly_detected', async (data) => {
      const { transactionId, result } = data;
      
      if (await this.anomalyDetector.shouldTriggerEmergencyStop(
        this.stateManager.getTransaction(transactionId)!,
        result
      )) {
        await this.triggerEmergencyStop(
          'ai_system',
          `AI detected critical anomaly: ${result.reasons.join(', ')}`,
          [transactionId]
        );
      }
    });
    
    // Listen for blacklist events
    this.anomalyDetector.on('party_blacklisted', async (data) => {
      const { partyId, reason } = data;
      
      // Find all pending transactions involving this party
      const affectedTxs = this.findTransactionsByParty(partyId);
      
      if (affectedTxs.length > 0) {
        await this.triggerEmergencyStop(
          'security_system',
          `Party blacklisted: ${reason}`,
          affectedTxs
        );
      }
    });
  }
  
  /**
   * Find transactions involving a specific party
   */
  private findTransactionsByParty(partyId: string): string[] {
    const transactions: string[] = [];
    
    // In production, query from database
    // For now, check in-memory transactions
    const pendingStates = [
      TransactionState.INITIATED,
      TransactionState.CREATED,
      TransactionState.SENT,
      TransactionState.RECEIVED
    ];
    
    for (const state of pendingStates) {
      const txs = this.stateManager.getTransactionsByState(state);
      for (const tx of txs) {
        if (tx.sender === partyId || tx.receiver === partyId) {
          transactions.push(tx.id);
        }
      }
    }
    
    return transactions;
  }
  
  /**
   * Notify relevant parties about emergency stop
   */
  private async notifyEmergencyStop(
    stopId: string,
    reason: EmergencyStopReason
  ): Promise<void> {
    // Integration point for notification system
    this.emit('notification_required', {
      type: 'emergency_stop',
      priority: 'urgent',
      recipients: Array.from(this.approvedParties),
      data: {
        stopId,
        reason,
        affectedCount: reason.affectedTransactions.length
      }
    });
  }
  
  /**
   * Generate unique stop ID
   */
  private generateStopId(): string {
    return `STOP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get emergency stop statistics
   */
  public getStatistics(): any {
    const activeStops = this.getActiveStops();
    const totalHalted = this.haltedTransactions.size;
    
    const stopsByType = new Map<string, number>();
    for (const stop of activeStops) {
      const count = stopsByType.get(stop.reason.type) || 0;
      stopsByType.set(stop.reason.type, count + 1);
    }
    
    return {
      activeStops: activeStops.length,
      haltedTransactions: totalHalted,
      stopsByType: Object.fromEntries(stopsByType),
      autoTriggerEnabled: this.config.autoTriggerEnabled,
      riskThreshold: this.config.riskScoreThreshold
    };
  }
  
  /**
   * API endpoint configuration
   */
  public getAPIEndpoints(): any {
    return {
      trigger: {
        method: 'POST',
        path: '/api/emergency/stop',
        requiredRole: 'admin',
        params: ['reason', 'transactionIds?']
      },
      resume: {
        method: 'POST',
        path: '/api/emergency/resume',
        requiredRole: 'admin',
        params: ['stopId', 'transactionIds?']
      },
      status: {
        method: 'GET',
        path: '/api/emergency/status',
        requiredRole: 'user'
      },
      statistics: {
        method: 'GET',
        path: '/api/emergency/stats',
        requiredRole: 'admin'
      }
    };
  }
}