// Automated Compensation Rules for 2-Check Consensus
// Handles automatic refunds, credits, and compensation calculations

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../core/types';
import { DisputeResolution, DisputeOutcome } from './disputes/dispute-resolution';

export interface CompensationRule {
  id: string;
  name: string;
  triggerConditions: CompensationTrigger[];
  calculationMethod: 'percentage' | 'fixed' | 'custom';
  value: number;
  maxCompensation?: number;
  autoApprove: boolean;
  requiresEvidence: boolean;
}

export interface CompensationTrigger {
  type: 'timeout' | 'dispute_resolved' | 'quality_issue' | 'delivery_delay' | 'wrong_item';
  condition: string;
  severity: 'low' | 'medium' | 'high';
}

export interface CompensationCalculation {
  transactionId: string;
  baseAmount: number;
  compensationType: string;
  compensationAmount: number;
  reason: string;
  approved: boolean;
  approvedBy?: string;
  timestamp: Date;
}

export interface CompensationConfig {
  autoCompensationEnabled: boolean;
  maxAutoApprovalAmount: number;
  requireManagerApproval: boolean;
  compensationAccount: string;
}

export class CompensationRuleEngine extends EventEmitter {
  private rules: Map<string, CompensationRule>;
  private compensations: Map<string, CompensationCalculation>;
  private config: CompensationConfig;
  
  constructor(config?: Partial<CompensationConfig>) {
    super();
    this.rules = new Map();
    this.compensations = new Map();
    
    this.config = {
      autoCompensationEnabled: true,
      maxAutoApprovalAmount: 5000,
      requireManagerApproval: true,
      compensationAccount: 'brand_compensation_pool',
      ...config
    };
    
    this.initializeDefaultRules();
  }
  
  /**
   * Initialize default compensation rules
   */
  private initializeDefaultRules(): void {
    // Timeout compensation
    this.addRule({
      id: 'timeout_compensation',
      name: 'Transaction Timeout Compensation',
      triggerConditions: [{
        type: 'timeout',
        condition: 'transaction.state === TIMEOUT',
        severity: 'medium'
      }],
      calculationMethod: 'percentage',
      value: 0.02, // 2% of transaction value
      maxCompensation: 1000,
      autoApprove: true,
      requiresEvidence: false
    });
    
    // Late delivery compensation
    this.addRule({
      id: 'late_delivery',
      name: 'Late Delivery Compensation',
      triggerConditions: [{
        type: 'delivery_delay',
        condition: 'delivery_time > promised_time + 24h',
        severity: 'low'
      }],
      calculationMethod: 'percentage',
      value: 0.05, // 5% for each day late
      maxCompensation: 5000,
      autoApprove: true,
      requiresEvidence: true
    });
    
    // Wrong item compensation
    this.addRule({
      id: 'wrong_item',
      name: 'Wrong Item Compensation',
      triggerConditions: [{
        type: 'wrong_item',
        condition: 'item_received !== item_ordered',
        severity: 'high'
      }],
      calculationMethod: 'fixed',
      value: 500, // Fixed compensation + return shipping
      autoApprove: false,
      requiresEvidence: true
    });
    
    // Quality issue compensation
    this.addRule({
      id: 'quality_issue',
      name: 'Quality Issue Compensation',
      triggerConditions: [{
        type: 'quality_issue',
        condition: 'quality_check_failed',
        severity: 'high'
      }],
      calculationMethod: 'custom',
      value: 0, // Custom calculation based on severity
      autoApprove: false,
      requiresEvidence: true
    });
    
    // Dispute resolution compensation
    this.addRule({
      id: 'dispute_compensation',
      name: 'Dispute Resolution Compensation',
      triggerConditions: [{
        type: 'dispute_resolved',
        condition: 'dispute.outcome === BUYER_FAVORED',
        severity: 'high'
      }],
      calculationMethod: 'percentage',
      value: 1.0, // 100% refund if buyer wins dispute
      autoApprove: false,
      requiresEvidence: true
    });
  }
  
  /**
   * Add compensation rule
   */
  public addRule(rule: CompensationRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule_added', { rule });
  }
  
  /**
   * Calculate compensation for a transaction
   */
  public async calculateCompensation(
    transaction: Transaction,
    triggerType: string,
    evidence?: any
  ): Promise<CompensationCalculation | null> {
    if (!this.config.autoCompensationEnabled) {
      return null;
    }
    
    // Find applicable rules
    const applicableRules = this.findApplicableRules(transaction, triggerType);
    
    if (applicableRules.length === 0) {
      return null;
    }
    
    // Use the first applicable rule (or combine multiple rules)
    const rule = applicableRules[0];
    
    // Check evidence requirement
    if (rule.requiresEvidence && !evidence) {
      this.emit('evidence_required', {
        transactionId: transaction.id,
        rule: rule.id,
        reason: 'Evidence required for compensation'
      });
      return null;
    }
    
    // Calculate compensation amount
    const compensationAmount = this.calculateAmount(transaction, rule, evidence);
    
    const calculation: CompensationCalculation = {
      transactionId: transaction.id,
      baseAmount: transaction.value,
      compensationType: rule.name,
      compensationAmount,
      reason: `${rule.name}: ${triggerType}`,
      approved: false,
      timestamp: new Date()
    };
    
    // Check auto-approval
    if (rule.autoApprove && compensationAmount <= this.config.maxAutoApprovalAmount) {
      calculation.approved = true;
      calculation.approvedBy = 'system';
      
      // Process compensation
      await this.processCompensation(calculation);
    } else {
      // Queue for manual approval
      await this.queueForApproval(calculation);
    }
    
    this.compensations.set(calculation.transactionId, calculation);
    return calculation;
  }
  
  /**
   * Find applicable compensation rules
   */
  private findApplicableRules(
    transaction: Transaction,
    triggerType: string
  ): CompensationRule[] {
    const applicable: CompensationRule[] = [];
    
    for (const rule of this.rules.values()) {
      for (const trigger of rule.triggerConditions) {
        if (trigger.type === triggerType) {
          // Evaluate condition (simplified for POC)
          if (this.evaluateCondition(transaction, trigger.condition)) {
            applicable.push(rule);
            break;
          }
        }
      }
    }
    
    return applicable;
  }
  
  /**
   * Calculate compensation amount
   */
  private calculateAmount(
    transaction: Transaction,
    rule: CompensationRule,
    evidence?: any
  ): number {
    let amount = 0;
    
    switch (rule.calculationMethod) {
      case 'percentage':
        amount = transaction.value * rule.value;
        break;
        
      case 'fixed':
        amount = rule.value;
        break;
        
      case 'custom':
        amount = this.customCalculation(transaction, rule, evidence);
        break;
    }
    
    // Apply maximum compensation limit
    if (rule.maxCompensation && amount > rule.maxCompensation) {
      amount = rule.maxCompensation;
    }
    
    return Math.round(amount * 100) / 100; // Round to 2 decimal places
  }
  
  /**
   * Custom compensation calculation
   */
  private customCalculation(
    transaction: Transaction,
    rule: CompensationRule,
    evidence?: any
  ): number {
    // Custom logic based on rule type
    switch (rule.id) {
      case 'quality_issue':
        // Calculate based on severity
        const severity = evidence?.severity || 'medium';
        const severityMultipliers = {
          low: 0.1,
          medium: 0.3,
          high: 0.5
        };
        return transaction.value * severityMultipliers[severity as keyof typeof severityMultipliers];
        
      default:
        return 0;
    }
  }
  
  /**
   * Process approved compensation
   */
  private async processCompensation(calculation: CompensationCalculation): Promise<void> {
    try {
      // Integration point for financial system
      this.emit('compensation_processing', {
        calculation,
        timestamp: new Date()
      });
      
      // Simulate compensation processing
      await this.executeFinancialTransaction(calculation);
      
      // Update compensation status
      calculation.approved = true;
      
      // Emit completion event
      this.emit('compensation_completed', {
        calculation,
        timestamp: new Date()
      });
      
      // Notify parties
      await this.notifyCompensation(calculation);
      
    } catch (error) {
      this.emit('compensation_failed', {
        calculation,
        error: (error as Error).message,
        timestamp: new Date()
      });
    }
  }
  
  /**
   * Queue compensation for manual approval
   */
  private async queueForApproval(calculation: CompensationCalculation): Promise<void> {
    this.emit('approval_required', {
      calculation,
      reason: 'Exceeds auto-approval limit or requires manual review',
      timestamp: new Date()
    });
  }
  
  /**
   * Manually approve compensation
   */
  public async approveCompensation(
    transactionId: string,
    approvedBy: string
  ): Promise<void> {
    const calculation = this.compensations.get(transactionId);
    if (!calculation) {
      throw new Error('Compensation calculation not found');
    }
    
    if (calculation.approved) {
      throw new Error('Compensation already approved');
    }
    
    calculation.approved = true;
    calculation.approvedBy = approvedBy;
    
    await this.processCompensation(calculation);
  }
  
  /**
   * Reject compensation
   */
  public async rejectCompensation(
    transactionId: string,
    rejectedBy: string,
    reason: string
  ): Promise<void> {
    const calculation = this.compensations.get(transactionId);
    if (!calculation) {
      throw new Error('Compensation calculation not found');
    }
    
    this.emit('compensation_rejected', {
      calculation,
      rejectedBy,
      reason,
      timestamp: new Date()
    });
    
    // Remove from pending
    this.compensations.delete(transactionId);
  }
  
  /**
   * Handle dispute resolution outcomes
   */
  public async handleDisputeOutcome(
    transactionId: string,
    outcome: DisputeOutcome,
    resolution: any
  ): Promise<void> {
    const transaction = { 
      id: transactionId, 
      value: resolution.transactionValue 
    } as Transaction;
    
    if (outcome === 'buyer_favored' || outcome === 'partial_refund') {
      await this.calculateCompensation(
        transaction,
        'dispute_resolved',
        { outcome, resolution }
      );
    }
  }
  
  /**
   * Get compensation statistics
   */
  public getStatistics(): any {
    const stats = {
      totalCompensations: this.compensations.size,
      pendingApprovals: 0,
      approvedAmount: 0,
      rejectedCount: 0,
      byType: new Map<string, number>()
    };
    
    for (const comp of this.compensations.values()) {
      if (!comp.approved) {
        stats.pendingApprovals++;
      } else {
        stats.approvedAmount += comp.compensationAmount;
      }
      
      const typeCount = stats.byType.get(comp.compensationType) || 0;
      stats.byType.set(comp.compensationType, typeCount + 1);
    }
    
    return {
      ...stats,
      byType: Object.fromEntries(stats.byType),
      averageCompensation: stats.approvedAmount / (stats.totalCompensations || 1)
    };
  }
  
  // Helper methods
  private evaluateCondition(transaction: Transaction, condition: string): boolean {
    // Simplified condition evaluation for POC
    if (condition.includes('TIMEOUT')) {
      return transaction.state === TransactionState.TIMEOUT;
    }
    return true;
  }
  
  private async executeFinancialTransaction(calculation: CompensationCalculation): Promise<void> {
    // Integration point for actual financial system
    console.log(`Processing compensation: ${calculation.compensationAmount} for ${calculation.transactionId}`);
  }
  
  private async notifyCompensation(calculation: CompensationCalculation): Promise<void> {
    this.emit('notification_required', {
      type: 'compensation_processed',
      recipients: ['sender', 'receiver'],
      data: calculation
    });
  }
  
  /**
   * Get pending compensations
   */
  public getPendingCompensations(): CompensationCalculation[] {
    return Array.from(this.compensations.values()).filter(c => !c.approved);
  }
  
  /**
   * API endpoint configuration
   */
  public getAPIEndpoints(): any {
    return {
      calculate: {
        method: 'POST',
        path: '/api/compensation/calculate',
        params: ['transactionId', 'triggerType', 'evidence?']
      },
      approve: {
        method: 'POST',
        path: '/api/compensation/approve/:transactionId',
        requiredRole: 'manager'
      },
      reject: {
        method: 'POST',
        path: '/api/compensation/reject/:transactionId',
        requiredRole: 'manager',
        params: ['reason']
      },
      pending: {
        method: 'GET',
        path: '/api/compensation/pending',
        requiredRole: 'manager'
      },
      statistics: {
        method: 'GET',
        path: '/api/compensation/stats',
        requiredRole: 'admin'
      }
    };
  }
}