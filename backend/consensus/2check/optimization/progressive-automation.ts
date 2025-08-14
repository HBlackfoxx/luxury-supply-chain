// Progressive Automation System for 2-Check Consensus
// Implements automatic approval based on trust history and patterns

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../core/types';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';
import { TransactionStateManager } from '../core/state/state-manager';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface AutomationRule {
  id: string;
  name: string;
  conditions: AutomationCondition[];
  action: AutomationAction;
  priority: number;
  enabled: boolean;
}

export interface AutomationCondition {
  type: 'trust_score' | 'transaction_count' | 'relationship_age' | 'value_threshold' | 'pattern_match';
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'in';
  value: any;
  target?: 'sender' | 'receiver' | 'both';
}

export interface AutomationAction {
  type: 'auto_approve' | 'reduce_timeout' | 'skip_evidence' | 'batch_approve' | 'instant_validate';
  parameters?: any;
}

export interface AutomationDecision {
  shouldAutomate: boolean;
  rule?: AutomationRule;
  confidence: number;
  reason: string;
}

export interface RelationshipMetrics {
  transactionCount: number;
  successRate: number;
  averageTime: number;
  lastTransaction: Date;
  relationshipAge: number; // days
  totalValue: number;
}

export class ProgressiveAutomation extends EventEmitter {
  private rules: Map<string, AutomationRule>;
  private trustSystem: TrustScoringSystem;
  private stateManager: TransactionStateManager;
  private relationshipCache: Map<string, RelationshipMetrics>;
  private config: any;
  
  constructor(
    trustSystem: TrustScoringSystem,
    stateManager: TransactionStateManager,
    configPath?: string
  ) {
    super();
    this.trustSystem = trustSystem;
    this.stateManager = stateManager;
    this.rules = new Map();
    this.relationshipCache = new Map();
    
    this.loadConfig(configPath);
    this.initializeRules();
  }
  
  private loadConfig(configPath?: string): void {
    const defaultPath = path.join(__dirname, '../config/trust-scoring.yaml');
    const configFile = configPath || defaultPath;
    
    try {
      const configContent = fs.readFileSync(configFile, 'utf8');
      this.config = yaml.load(configContent) as any;
    } catch (error) {
      console.warn('Could not load config, using defaults');
      this.config = { automation_rules: [] };
    }
  }
  
  /**
   * Initialize automation rules
   */
  private initializeRules(): void {
    // High trust instant approval
    this.addRule({
      id: 'high_trust_instant',
      name: 'High Trust Instant Approval',
      conditions: [
        {
          type: 'trust_score',
          operator: 'gte',
          value: 180, // Out of 200
          target: 'both'
        },
        {
          type: 'transaction_count',
          operator: 'gte',
          value: 50,
          target: 'both'
        }
      ],
      action: {
        type: 'instant_validate'
      },
      priority: 100,
      enabled: true
    });
    
    // Trusted relationship auto-approval
    this.addRule({
      id: 'trusted_relationship',
      name: 'Trusted Relationship Auto-Approval',
      conditions: [
        {
          type: 'trust_score',
          operator: 'gte',
          value: 150,
          target: 'both'
        },
        {
          type: 'relationship_age',
          operator: 'gte',
          value: 90 // days
        },
        {
          type: 'value_threshold',
          operator: 'lte',
          value: 50000
        }
      ],
      action: {
        type: 'auto_approve',
        parameters: {
          delay: 3600 // 1 hour delay before auto-approval
        }
      },
      priority: 90,
      enabled: true
    });
    
    // Medium trust reduced timeout
    this.addRule({
      id: 'medium_trust_timeout',
      name: 'Medium Trust Reduced Timeout',
      conditions: [
        {
          type: 'trust_score',
          operator: 'gte',
          value: 100,
          target: 'both'
        }
      ],
      action: {
        type: 'reduce_timeout',
        parameters: {
          multiplier: 1.5 // 50% more time
        }
      },
      priority: 80,
      enabled: true
    });
    
    // Pattern-based batch approval
    this.addRule({
      id: 'pattern_batch',
      name: 'Pattern-Based Batch Approval',
      conditions: [
        {
          type: 'pattern_match',
          operator: 'eq',
          value: 'repeat_shipment'
        },
        {
          type: 'trust_score',
          operator: 'gte',
          value: 120,
          target: 'both'
        }
      ],
      action: {
        type: 'batch_approve'
      },
      priority: 70,
      enabled: true
    });
    
    // Skip evidence for trusted parties
    this.addRule({
      id: 'skip_evidence',
      name: 'Skip Evidence Requirement',
      conditions: [
        {
          type: 'trust_score',
          operator: 'gte',
          value: 160,
          target: 'both'
        },
        {
          type: 'transaction_count',
          operator: 'gte',
          value: 20,
          target: 'both'
        }
      ],
      action: {
        type: 'skip_evidence'
      },
      priority: 60,
      enabled: true
    });
    
    // Load custom rules from config
    if (this.config.automation_rules) {
      for (const rule of this.config.automation_rules) {
        this.addRule(rule);
      }
    }
  }
  
  /**
   * Add automation rule
   */
  public addRule(rule: AutomationRule): void {
    this.rules.set(rule.id, rule);
    // Sort rules by priority
    this.rules = new Map(
      [...this.rules.entries()].sort((a, b) => b[1].priority - a[1].priority)
    );
  }
  
  /**
   * Evaluate transaction for automation
   */
  public async evaluateTransaction(transaction: Transaction): Promise<AutomationDecision> {
    // Get relationship metrics
    const metrics = await this.getRelationshipMetrics(
      transaction.sender,
      transaction.receiver
    );
    
    // Evaluate each rule in priority order
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      const matches = await this.evaluateRule(transaction, rule, metrics);
      if (matches) {
        return {
          shouldAutomate: true,
          rule,
          confidence: this.calculateConfidence(transaction, rule, metrics),
          reason: `Matched rule: ${rule.name}`
        };
      }
    }
    
    return {
      shouldAutomate: false,
      confidence: 0,
      reason: 'No automation rules matched'
    };
  }
  
  /**
   * Apply automation action
   */
  public async applyAutomation(
    transaction: Transaction,
    decision: AutomationDecision
  ): Promise<void> {
    if (!decision.shouldAutomate || !decision.rule) {
      return;
    }
    
    const action = decision.rule.action;
    
    switch (action.type) {
      case 'instant_validate':
        await this.instantValidate(transaction);
        break;
        
      case 'auto_approve':
        await this.scheduleAutoApproval(transaction, action.parameters);
        break;
        
      case 'reduce_timeout':
        await this.adjustTimeout(transaction, action.parameters);
        break;
        
      case 'batch_approve':
        await this.enableBatchApproval(transaction);
        break;
        
      case 'skip_evidence':
        await this.skipEvidenceRequirement(transaction);
        break;
    }
    
    this.emit('automation_applied', {
      transactionId: transaction.id,
      rule: decision.rule.id,
      action: action.type,
      confidence: decision.confidence
    });
  }
  
  /**
   * Evaluate rule conditions
   */
  private async evaluateRule(
    transaction: Transaction,
    rule: AutomationRule,
    metrics: RelationshipMetrics
  ): Promise<boolean> {
    for (const condition of rule.conditions) {
      const matches = await this.evaluateCondition(transaction, condition, metrics);
      if (!matches) return false;
    }
    return true;
  }
  
  /**
   * Evaluate single condition
   */
  private async evaluateCondition(
    transaction: Transaction,
    condition: AutomationCondition,
    metrics: RelationshipMetrics
  ): Promise<boolean> {
    let value: any;
    
    switch (condition.type) {
      case 'trust_score':
        if (condition.target === 'both') {
          const senderScore = await this.trustSystem.getScore(transaction.sender);
          const receiverScore = await this.trustSystem.getScore(transaction.receiver);
          value = Math.min(senderScore, receiverScore);
        } else if (condition.target === 'sender') {
          value = await this.trustSystem.getScore(transaction.sender);
        } else {
          value = await this.trustSystem.getScore(transaction.receiver);
        }
        break;
        
      case 'transaction_count':
        value = metrics.transactionCount;
        break;
        
      case 'relationship_age':
        value = metrics.relationshipAge;
        break;
        
      case 'value_threshold':
        value = transaction.value;
        break;
        
      case 'pattern_match':
        value = await this.detectPattern(transaction);
        break;
    }
    
    return this.compareValues(value, condition.operator, condition.value);
  }
  
  /**
   * Compare values based on operator
   */
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'gt': return actual > expected;
      case 'lt': return actual < expected;
      case 'eq': return actual === expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
      case 'in': return expected.includes(actual);
      default: return false;
    }
  }
  
  /**
   * Get relationship metrics
   */
  private async getRelationshipMetrics(
    sender: string,
    receiver: string
  ): Promise<RelationshipMetrics> {
    const key = `${sender}-${receiver}`;
    
    // Check cache
    if (this.relationshipCache.has(key)) {
      return this.relationshipCache.get(key)!;
    }
    
    // Calculate metrics (in production, query from database)
    const metrics: RelationshipMetrics = {
      transactionCount: 25, // Mock data
      successRate: 0.98,
      averageTime: 3600000, // 1 hour
      lastTransaction: new Date(Date.now() - 86400000), // 1 day ago
      relationshipAge: 120, // days
      totalValue: 250000
    };
    
    this.relationshipCache.set(key, metrics);
    return metrics;
  }
  
  /**
   * Calculate automation confidence
   */
  private calculateConfidence(
    transaction: Transaction,
    rule: AutomationRule,
    metrics: RelationshipMetrics
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Adjust based on success rate
    confidence += metrics.successRate * 0.2;
    
    // Adjust based on relationship age
    if (metrics.relationshipAge > 180) {
      confidence += 0.1;
    }
    
    // Adjust based on transaction count
    if (metrics.transactionCount > 100) {
      confidence += 0.1;
    }
    
    // Adjust based on rule priority
    confidence += (rule.priority / 1000);
    
    return Math.min(1, confidence);
  }
  
  /**
   * Automation actions
   */
  private async instantValidate(transaction: Transaction): Promise<void> {
    // Skip confirmation steps and validate immediately
    await this.stateManager.transitionState(
      transaction.id,
      TransactionState.VALIDATED,
      'automation_system',
      { reason: 'Instant validation based on high trust' }
    );
  }
  
  private async scheduleAutoApproval(
    transaction: Transaction,
    parameters: any
  ): Promise<void> {
    const delay = parameters?.delay || 3600000; // Default 1 hour
    
    setTimeout(async () => {
      // Check if still pending
      const current = this.stateManager.getTransaction(transaction.id);
      if (current && current.state === TransactionState.RECEIVED) {
        await this.stateManager.transitionState(
          transaction.id,
          TransactionState.VALIDATED,
          'automation_system',
          { reason: 'Auto-approved after delay' }
        );
      }
    }, delay);
    
    this.emit('auto_approval_scheduled', {
      transactionId: transaction.id,
      approvalTime: new Date(Date.now() + delay)
    });
  }
  
  private async adjustTimeout(transaction: Transaction, parameters: any): Promise<void> {
    const multiplier = parameters?.multiplier || 1.5;
    const newTimeout = new Date(
      transaction.timeoutAt.getTime() * multiplier
    );
    
    transaction.timeoutAt = newTimeout;
    
    this.emit('timeout_adjusted', {
      transactionId: transaction.id,
      newTimeout,
      multiplier
    });
  }
  
  private async enableBatchApproval(transaction: Transaction): Promise<void> {
    // Mark transaction as eligible for batch processing
    if (!transaction.metadata) transaction.metadata = {};
    transaction.metadata.batchEligible = true;
    
    this.emit('batch_approval_enabled', {
      transactionId: transaction.id
    });
  }
  
  private async skipEvidenceRequirement(transaction: Transaction): Promise<void> {
    // Mark that evidence is not required
    if (!transaction.metadata) transaction.metadata = {};
    transaction.metadata.evidenceRequired = false;
    
    this.emit('evidence_requirement_skipped', {
      transactionId: transaction.id
    });
  }
  
  /**
   * Pattern detection
   */
  private async detectPattern(transaction: Transaction): Promise<string> {
    // Detect transaction patterns
    if (transaction.metadata?.repeatShipment) {
      return 'repeat_shipment';
    }
    
    if (transaction.metadata?.itemType === 'standard_order') {
      return 'standard_order';
    }
    
    // Check historical patterns
    const metrics = await this.getRelationshipMetrics(
      transaction.sender,
      transaction.receiver
    );
    
    if (metrics.transactionCount > 10 && metrics.successRate > 0.95) {
      return 'regular_partner';
    }
    
    return 'none';
  }
  
  /**
   * Get automation statistics
   */
  public getStatistics(): any {
    const stats = {
      totalRules: this.rules.size,
      enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      ruleUsage: new Map<string, number>(),
      automationRate: 0
    };
    
    // In production, track actual usage
    return stats;
  }
  
  /**
   * Dynamic timeout adjustment
   */
  public async adjustTimeoutDynamically(transaction: Transaction): Promise<number> {
    const metrics = await this.getRelationshipMetrics(
      transaction.sender,
      transaction.receiver
    );
    
    // Base timeout (in hours)
    let timeout = 72;
    
    // Adjust based on trust
    const minTrust = Math.min(
      await this.trustSystem.getScore(transaction.sender),
      await this.trustSystem.getScore(transaction.receiver)
    );
    
    if (minTrust >= 150) {
      timeout *= 1.5; // 50% more time for trusted parties
    } else if (minTrust < 50) {
      timeout *= 0.7; // 30% less time for untrusted parties
    }
    
    // Adjust based on history
    if (metrics.successRate < 0.9) {
      timeout *= 0.8; // Less time if history of issues
    }
    
    // Adjust based on value
    if (transaction.value > 50000) {
      timeout *= 0.5; // Faster processing for high-value
    }
    
    return Math.max(24, Math.min(168, timeout)); // Between 1-7 days
  }
}