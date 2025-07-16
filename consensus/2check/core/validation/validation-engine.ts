// consensus/2check/core/validation/validation-engine.ts
// Core validation logic for 2-Check consensus

import { Transaction, TransactionState } from '../state/state-manager';
import { EventEmitter } from 'events';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  requiredActions?: string[];
  confidence?: number;
  errors?: string[];
}

export interface AnomalyCheck {
  type: string;
  check: (transaction: Transaction) => Promise<boolean>;
  confidence: number;
  description: string;
}

export class ValidationEngine extends EventEmitter {
  private config: any;
  private anomalyChecks: Map<string, AnomalyCheck> = new Map();

  constructor(configPath?: string) {
    super();
    this.loadConfig(configPath);
    this.registerAnomalyChecks();
  }

  private loadConfig(configPath?: string) {
    const defaultPath = path.join(__dirname, '../../config/2check-config.yaml');
    const configFile = configPath || defaultPath;
    
    const configContent = fs.readFileSync(configFile, 'utf8');
    this.config = yaml.load(configContent) as any;
  }

  /**
   * Validate a transaction for automatic approval
   */
  public async validateForAutoApproval(transaction: Transaction): Promise<ValidationResult> {
    // Check if both parties have confirmed
    if (!transaction.senderConfirmed || !transaction.receiverConfirmed) {
      return {
        isValid: false,
        reason: 'Both sender and receiver must confirm',
        requiredActions: [
          !transaction.senderConfirmed ? 'sender_confirmation' : null,
          !transaction.receiverConfirmed ? 'receiver_confirmation' : null
        ].filter(Boolean) as string[]
      };
    }

    // Check for anomalies
    const anomalies = await this.checkForAnomalies(transaction);
    if (anomalies.length > 0) {
      const highConfidenceAnomalies = anomalies.filter(a => a.confidence > 0.8);
      
      if (highConfidenceAnomalies.length > 0) {
        return {
          isValid: false,
          reason: 'High confidence anomalies detected',
          requiredActions: ['manual_review', 'ai_analysis'],
          confidence: Math.max(...highConfidenceAnomalies.map(a => a.confidence))
        };
      }

      // Low confidence anomalies - flag but allow
      this.emit('warning:anomalies_detected', {
        transaction,
        anomalies
      });
    }

    // Check business rules
    const businessRuleViolations = await this.checkBusinessRules(transaction);
    if (businessRuleViolations.length > 0) {
      return {
        isValid: false,
        reason: 'Business rule violations',
        requiredActions: businessRuleViolations.map(v => v.action)
      };
    }

    // All checks passed
    return {
      isValid: true,
      confidence: 1.0
    };
  }

  /**
   * Register anomaly detection checks
   */
  private registerAnomalyChecks(): void {
    // Geographic anomaly check
    this.anomalyChecks.set('geographic', {
      type: 'geographic',
      description: 'Check for impossible geographic movements',
      confidence: 0.95,
      check: async (transaction: Transaction) => {
        // Example: Check if item moved too fast between locations
        const previousLocation = transaction.metadata?.previousLocation;
        const currentLocation = transaction.metadata?.currentLocation;
        const timeDiff = transaction.updated.getTime() - transaction.created.getTime();
        
        if (previousLocation && currentLocation) {
          const distance = this.calculateDistance(previousLocation, currentLocation);
          const speed = distance / (timeDiff / 3600000); // km/h
          
          // If speed > 1000 km/h, it's likely impossible
          return speed > 1000;
        }
        
        return false;
      }
    });

    // Price anomaly check
    this.anomalyChecks.set('price', {
      type: 'price',
      description: 'Check for unusual pricing',
      confidence: 0.85,
      check: async (transaction: Transaction) => {
        const historicalAverage = await this.getHistoricalAveragePrice(transaction.itemId);
        if (!historicalAverage) return false;
        
        const deviation = Math.abs(transaction.value - historicalAverage) / historicalAverage;
        
        // Flag if price deviates more than 50%
        return deviation > 0.5;
      }
    });

    // Pattern anomaly check
    this.anomalyChecks.set('pattern', {
      type: 'pattern',
      description: 'Check for unusual transaction patterns',
      confidence: 0.80,
      check: async (transaction: Transaction) => {
        // Check for unusual patterns like:
        // - Same item transacted multiple times in short period
        // - New relationship with high value transaction
        // - Unusual time of transaction
        
        const recentTransactions = await this.getRecentTransactions(
          transaction.sender,
          transaction.receiver
        );
        
        // New relationship with high value
        if (recentTransactions.length === 0 && transaction.value > 10000) {
          return true;
        }
        
        // Multiple transactions of same item
        const sameItemCount = recentTransactions.filter(
          tx => tx.itemId === transaction.itemId
        ).length;
        
        if (sameItemCount > 2) {
          return true;
        }
        
        return false;
      }
    });

    // Velocity anomaly check
    this.anomalyChecks.set('velocity', {
      type: 'velocity',
      description: 'Check for unusual transaction velocity',
      confidence: 0.75,
      check: async (transaction: Transaction) => {
        const recentCount = await this.getTransactionCount(
          transaction.sender,
          24 // hours
        );
        
        // Flag if more than 50 transactions in 24 hours
        return recentCount > 50;
      }
    });
  }

  /**
   * Check for anomalies in the transaction
   */
  private async checkForAnomalies(transaction: Transaction): Promise<Array<{
    type: string;
    confidence: number;
    description: string;
  }>> {
    const detectedAnomalies = [];
    
    for (const [type, check] of this.anomalyChecks) {
      try {
        const isAnomaly = await check.check(transaction);
        if (isAnomaly) {
          detectedAnomalies.push({
            type: check.type,
            confidence: check.confidence,
            description: check.description
          });
        }
      } catch (error) {
        console.error(`Error in anomaly check ${type}:`, error);
      }
    }
    
    return detectedAnomalies;
  }

  /**
   * Check business rules
   */
  private async checkBusinessRules(transaction: Transaction): Promise<Array<{
    rule: string;
    violated: boolean;
    action: string;
  }>> {
    const violations = [];
    
    // Check minimum value rules
    if (transaction.value < 0) {
      violations.push({
        rule: 'positive_value',
        violated: true,
        action: 'reject_transaction'
      });
    }
    
    // Check participant eligibility
    const senderEligible = await this.isParticipantEligible(transaction.sender);
    if (!senderEligible) {
      violations.push({
        rule: 'sender_eligibility',
        violated: true,
        action: 'verify_sender_identity'
      });
    }
    
    const receiverEligible = await this.isParticipantEligible(transaction.receiver);
    if (!receiverEligible) {
      violations.push({
        rule: 'receiver_eligibility',
        violated: true,
        action: 'verify_receiver_identity'
      });
    }
    
    // Check item eligibility
    const itemEligible = await this.isItemEligible(transaction.itemId);
    if (!itemEligible) {
      violations.push({
        rule: 'item_eligibility',
        violated: true,
        action: 'verify_item_authenticity'
      });
    }
    
    return violations;
  }

  /**
   * Validate dispute
   */
  public async validateDispute(
    transaction: Transaction,
    disputeType: string,
    evidence: any
  ): Promise<ValidationResult> {
    // Check if dispute is allowed in current state
    const disputeableStates = [TransactionState.SENT, TransactionState.RECEIVED];
    if (!disputeableStates.includes(transaction.state)) {
      return {
        isValid: false,
        reason: `Cannot dispute transaction in ${transaction.state} state`
      };
    }
    
    // Validate dispute type
    const validDisputeTypes = this.config.consensus.disputes.types.map((t: any) => t.id);
    if (!validDisputeTypes.includes(disputeType)) {
      return {
        isValid: false,
        reason: 'Invalid dispute type',
        requiredActions: ['select_valid_dispute_type']
      };
    }
    
    // Check required evidence
    const disputeConfig = this.config.consensus.disputes.types.find(
      (t: any) => t.id === disputeType
    );
    
    if (disputeConfig) {
      const missingEvidence = disputeConfig.evidence_required.filter(
        (req: string) => !evidence[req]
      );
      
      if (missingEvidence.length > 0) {
        return {
          isValid: false,
          reason: 'Missing required evidence',
          requiredActions: missingEvidence.map((e: string) => `provide_${e}`)
        };
      }
    }
    
    return {
      isValid: true
    };
  }

  /**
   * Validate batch operation
   */
  public async validateBatchOperation(
    transactions: Transaction[],
    submitterId: string
  ): Promise<ValidationResult> {
    // Check batch size
    const maxBatchSize = this.config.consensus.batch_operations.max_batch_size;
    if (transactions.length > maxBatchSize) {
      return {
        isValid: false,
        reason: `Batch size exceeds maximum of ${maxBatchSize}`
      };
    }
    
    // Check if submitter is allowed batch operations
    const trustScore = await this.getTrustScore(submitterId);
    const minTrustScore = this.config.consensus.batch_operations.allowed_for[0].min_trust_score;
    
    if (trustScore < minTrustScore) {
      return {
        isValid: false,
        reason: `Trust score ${trustScore} below minimum ${minTrustScore} for batch operations`
      };
    }
    
    // Validate each transaction
    const invalidTransactions = [];
    for (const tx of transactions) {
      const validation = await this.validateTransaction(tx);
      if (!validation.isValid) {
        invalidTransactions.push({
          id: tx.id,
          reason: validation.reason
        });
      }
    }
    
    if (invalidTransactions.length > 0) {
      return {
        isValid: false,
        reason: 'Batch contains invalid transactions',
        requiredActions: ['fix_invalid_transactions']
      };
    }
    
    return {
      isValid: true
    };
  }

  /**
   * Basic transaction validation
   */
  private async validateTransaction(transaction: Transaction): Promise<ValidationResult> {
    // Check required fields
    if (!transaction.sender || !transaction.receiver) {
      return {
        isValid: false,
        reason: 'Missing sender or receiver'
      };
    }
    
    if (!transaction.itemId) {
      return {
        isValid: false,
        reason: 'Missing item ID'
      };
    }
    
    if (transaction.value === undefined || transaction.value < 0) {
      return {
        isValid: false,
        reason: 'Invalid transaction value'
      };
    }
    
    return {
      isValid: true
    };
  }

  // Helper methods (would connect to actual services in production)
  
  private calculateDistance(loc1: any, loc2: any): number {
    // Simplified distance calculation
    return Math.sqrt(
      Math.pow(loc2.lat - loc1.lat, 2) + 
      Math.pow(loc2.lng - loc1.lng, 2)
    ) * 111; // Convert to km
  }
  
  private async getHistoricalAveragePrice(_itemId: string): Promise<number | null> {
    // Would query historical data
    return 5000; // Mock average price
  }
  
  private async getRecentTransactions(_sender: string, _receiver: string): Promise<any[]> {
    // Would query transaction history
    return [];
  }
  
  private async getTransactionCount(_participantId: string, _hours: number): Promise<number> {
    // Would query transaction count
    return 0;
  }
  
  private async isParticipantEligible(_participantId: string): Promise<boolean> {
    // Would check participant status
    return true;
  }
  
  private async isItemEligible(_itemId: string): Promise<boolean> {
    // Would check item status (not stolen, authentic, etc.)
    return true;
  }
  
  private async getTrustScore(_participantId: string): Promise<number> {
    // Would query trust score service
    return 100;
  }

  /**
   * Validate a transaction (public method for integration)
   */
  public async validate(transaction: Transaction): Promise<ValidationResult> {
    const result = await this.validateTransaction(transaction);
    // Convert reason to errors array for compatibility
    if (!result.errors && result.reason) {
      result.errors = [result.reason];
    }
    return result;
  }

  /**
   * Perform consensus validation
   */
  public async performConsensus(transaction: Transaction): Promise<{
    consensus: boolean;
    reason?: string;
  }> {
    // Check if both parties have confirmed
    if (!transaction.senderConfirmed || !transaction.receiverConfirmed) {
      return {
        consensus: false,
        reason: 'Both parties must confirm'
      };
    }

    // Check for anomalies
    const anomalies = await this.checkForAnomalies(transaction);
    if (anomalies.filter(a => a.confidence > 0.9).length > 0) {
      return {
        consensus: false,
        reason: 'High confidence anomalies detected'
      };
    }

    // Consensus achieved
    this.emit('consensus_achieved', { transaction });
    
    return {
      consensus: true
    };
  }
}