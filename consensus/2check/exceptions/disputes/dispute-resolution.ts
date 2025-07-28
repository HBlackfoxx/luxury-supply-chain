// consensus/2check/exceptions/disputes/dispute-resolution.ts
// Handles dispute creation, evidence collection, and resolution

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../../core/state/state-manager';
import { ValidationEngine } from '../../core/validation/validation-engine';
import { EvidenceManager } from '../evidence/evidence-manager';
import { TrustScoringSystem } from '../../core/trust/trust-scoring-system';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export enum DisputeStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  AWAITING_EVIDENCE = 'AWAITING_EVIDENCE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED'
}

export enum DisputeType {
  NOT_RECEIVED = 'not_received',
  WRONG_ITEM = 'wrong_item',
  DAMAGED = 'damaged',
  QUANTITY_MISMATCH = 'quantity_mismatch',
  QUALITY_ISSUE = 'quality_issue',
  COUNTERFEIT_SUSPECTED = 'counterfeit_suspected'
}

export interface Dispute {
  id: string;
  transactionId: string;
  type: DisputeType;
  status: DisputeStatus;
  creator: string;
  respondent: string;
  created: Date;
  updated: Date;
  evidence: Evidence[];
  resolution?: Resolution;
  escalationLevel: number;
  deadline: Date;
}

export interface Evidence {
  id: string;
  submittedBy: string;
  submittedAt: Date;
  type: 'photo' | 'document' | 'tracking' | 'testimony' | 'system_log';
  description: string;
  data: any;
  verified: boolean;
}

export type DisputeOutcome = 'buyer_favored' | 'seller_favored' | 'partial_refund' | 'no_action';

export interface Resolution {
  decidedBy: string;
  decidedAt: Date;
  decision: 'favor_creator' | 'favor_respondent' | 'split' | 'void';
  outcome?: DisputeOutcome;
  reasoning: string;
  actions: ResolutionAction[];
  compensation?: Compensation;
}

export interface ResolutionAction {
  type: 'refund' | 'replacement' | 'credit' | 'penalty' | 'warning';
  target: string;
  details: any;
}

export interface Compensation {
  amount: number;
  payer: string;
  payee: string;
  deadline: Date;
}

export class DisputeResolution extends EventEmitter {
  private config: any;
  private disputes: Map<string, Dispute> = new Map();
  private evidenceStore: Map<string, Evidence> = new Map();
  private validationEngine?: ValidationEngine;
  private evidenceManager?: EvidenceManager;
  private trustSystem?: TrustScoringSystem;

  constructor(
    validationEngine?: ValidationEngine,
    evidenceManager?: EvidenceManager,
    trustSystem?: TrustScoringSystem,
    configPath?: string
  ) {
    super();
    this.validationEngine = validationEngine;
    this.evidenceManager = evidenceManager;
    this.trustSystem = trustSystem;
    this.loadConfig(configPath);
  }

  private loadConfig(configPath?: string) {
    const defaultPath = path.join(__dirname, '../../config/2check-config.yaml');
    const configFile = configPath || defaultPath;
    
    const configContent = fs.readFileSync(configFile, 'utf8');
    this.config = yaml.load(configContent) as any;
  }

  /**
   * Create a new dispute
   */
  public async createDispute(params: {
    transactionId: string;
    transaction?: Transaction;
    type: DisputeType;
    creator: string;
    reason?: string;
    initiator?: string;
    timestamp?: Date;
    initialEvidence?: any;
  }): Promise<Dispute> {
    const disputeId = this.generateDisputeId();
    const disputeConfig = this.getDisputeConfig(params.type);
    
    const dispute: Dispute = {
      id: disputeId,
      transactionId: params.transactionId,
      type: params.type,
      status: DisputeStatus.OPEN,
      creator: params.creator || params.initiator || 'unknown',
      respondent: params.transaction 
        ? (params.creator === params.transaction.sender 
          ? params.transaction.receiver 
          : params.transaction.sender)
        : 'unknown',
      created: params.timestamp || new Date(),
      updated: new Date(),
      evidence: [],
      escalationLevel: 0,
      deadline: this.calculateDeadline(disputeConfig)
    };

    // Add initial evidence
    if (params.initialEvidence) {
      const evidence = await this.addEvidence(dispute, {
        submittedBy: params.creator,
        type: 'testimony',
        description: 'Initial dispute claim',
        data: params.initialEvidence
      });
      dispute.evidence.push(evidence);
    }

    this.disputes.set(disputeId, dispute);
    
    // Emit events
    this.emit('dispute:created', dispute);
    this.emit('notification:required', {
      type: 'dispute_created',
      recipients: [dispute.respondent, 'brand_owner'],
      dispute
    });

    // Start automatic processes
    this.scheduleDeadlineCheck(dispute);
    
    return dispute;
  }

  /**
   * Add evidence to a dispute
   */
  public async addEvidence(
    dispute: Dispute,
    evidenceData: {
      submittedBy: string;
      type: Evidence['type'];
      description: string;
      data: any;
    }
  ): Promise<Evidence> {
    const evidenceId = this.generateEvidenceId();
    
    const evidence: Evidence = {
      id: evidenceId,
      submittedBy: evidenceData.submittedBy,
      submittedAt: new Date(),
      type: evidenceData.type,
      description: evidenceData.description,
      data: evidenceData.data,
      verified: false
    };

    // Auto-verify certain evidence types
    if (evidenceData.type === 'system_log' || evidenceData.type === 'tracking') {
      evidence.verified = await this.verifySystemEvidence(evidence);
    }

    this.evidenceStore.set(evidenceId, evidence);
    dispute.evidence.push(evidence);
    dispute.updated = new Date();
    dispute.status = DisputeStatus.UNDER_REVIEW;

    this.emit('evidence:added', {
      dispute,
      evidence
    });

    // Check if we have sufficient evidence
    await this.checkEvidenceSufficiency(dispute);

    return evidence;
  }

  /**
   * Update dispute status
   */
  public async updateStatus(
    disputeId: string,
    newStatus: DisputeStatus,
    actor: string,
    reason?: string
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const oldStatus = dispute.status;
    dispute.status = newStatus;
    dispute.updated = new Date();

    this.emit('dispute:status_changed', {
      dispute,
      oldStatus,
      newStatus,
      actor,
      reason
    });

    // Handle status-specific actions
    switch (newStatus) {
      case DisputeStatus.ESCALATED:
        await this.handleEscalation(dispute, actor, reason);
        break;
      case DisputeStatus.RESOLVED:
        await this.finalizeResolution(dispute);
        break;
    }
  }

  /**
   * Resolve a dispute
   */
  public async resolveDispute(
    disputeId: string,
    resolution: {
      decidedBy: string;
      decision: Resolution['decision'];
      reasoning: string;
      actions?: ResolutionAction[];
      compensation?: Compensation;
    }
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    dispute.resolution = {
      decidedBy: resolution.decidedBy,
      decidedAt: new Date(),
      decision: resolution.decision,
      reasoning: resolution.reasoning,
      actions: resolution.actions || [],
      compensation: resolution.compensation
    };

    dispute.status = DisputeStatus.RESOLVED;
    dispute.updated = new Date();

    this.emit('dispute:resolved', {
      dispute,
      resolution: dispute.resolution
    });

    // Update trust scores based on resolution
    await this.updateTrustScores(dispute);

    // Execute resolution actions
    await this.executeResolutionActions(dispute);
  }

  /**
   * Escalate a dispute
   */
  private async handleEscalation(
    dispute: Dispute,
    escalatedBy: string,
    reason?: string
  ): Promise<void> {
    dispute.escalationLevel++;

    const escalationRules = this.config.consensus.disputes.escalation.rules;
    const applicableRule = this.findApplicableEscalationRule(dispute);

    if (applicableRule) {
      this.emit('dispute:escalated', {
        dispute,
        escalatedBy,
        reason,
        handler: applicableRule.handler,
        priority: applicableRule.priority
      });

      // Notify escalation handler
      this.emit('notification:required', {
        type: 'dispute_escalated',
        recipients: [applicableRule.handler],
        dispute,
        priority: applicableRule.priority
      });
    }
  }

  /**
   * Check if sufficient evidence has been provided
   */
  private async checkEvidenceSufficiency(dispute: Dispute): Promise<void> {
    const disputeConfig = this.getDisputeConfig(dispute.type);
    const requiredEvidence = disputeConfig.evidence_required;
    
    const providedTypes = dispute.evidence.map(e => e.type);
    const missingEvidence = requiredEvidence.filter(
      (req: string) => !providedTypes.includes(req as any)
    );

    if (missingEvidence.length === 0) {
      // All evidence provided
      this.emit('evidence:complete', {
        dispute,
        readyForDecision: true
      });

      // Auto-resolve if possible
      if (disputeConfig.auto_resolution_possible) {
        await this.attemptAutoResolution(dispute);
      }
    } else {
      // Still waiting for evidence
      this.emit('evidence:pending', {
        dispute,
        missing: missingEvidence
      });
    }
  }

  /**
   * Attempt automatic resolution
   */
  private async attemptAutoResolution(dispute: Dispute): Promise<void> {
    // Analyze evidence
    const analysis = await this.analyzeEvidence(dispute);
    
    if (analysis.confidence > 0.9) {
      await this.resolveDispute(dispute.id, {
        decidedBy: 'system_auto_resolution',
        decision: analysis.recommendedDecision,
        reasoning: analysis.reasoning,
        actions: analysis.recommendedActions
      });
    } else {
      // Not confident enough for auto-resolution
      this.emit('resolution:manual_review_required', {
        dispute,
        analysis
      });
    }
  }

  /**
   * Analyze evidence using AI/rules
   */
  private async analyzeEvidence(dispute: Dispute): Promise<{
    confidence: number;
    recommendedDecision: Resolution['decision'];
    reasoning: string;
    recommendedActions: ResolutionAction[];
  }> {
    // Simplified analysis logic
    // In production, this would use AI models and complex rules
    
    const verifiedEvidence = dispute.evidence.filter(e => e.verified);
    const confidence = verifiedEvidence.length / dispute.evidence.length;

    // Example logic for NOT_RECEIVED disputes
    if (dispute.type === DisputeType.NOT_RECEIVED) {
      const hasTrackingProof = dispute.evidence.some(
        e => e.type === 'tracking' && e.verified
      );
      
      if (hasTrackingProof) {
        return {
          confidence: 0.95,
          recommendedDecision: 'favor_creator',
          reasoning: 'Verified tracking shows delivery completed',
          recommendedActions: []
        };
      }
    }

    // Default to manual review
    return {
      confidence: 0.5,
      recommendedDecision: 'split',
      reasoning: 'Insufficient evidence for automatic resolution',
      recommendedActions: []
    };
  }

  /**
   * Update trust scores based on dispute resolution
   */
  private async updateTrustScores(dispute: Dispute): Promise<void> {
    if (!dispute.resolution) return;

    const updates = [];

    switch (dispute.resolution.decision) {
      case 'favor_creator':
        updates.push({
          participant: dispute.creator,
          action: 'dispute_won',
          value: 2
        });
        updates.push({
          participant: dispute.respondent,
          action: 'dispute_lost',
          value: -5
        });
        break;
        
      case 'favor_respondent':
        updates.push({
          participant: dispute.respondent,
          action: 'dispute_won',
          value: 2
        });
        updates.push({
          participant: dispute.creator,
          action: 'false_claim',
          value: -10
        });
        break;
        
      case 'split':
        // No trust score changes for split decisions
        break;
    }

    if (updates.length > 0) {
      this.emit('trust:update_required', { updates });
    }
  }

  /**
   * Execute resolution actions
   */
  private async executeResolutionActions(dispute: Dispute): Promise<void> {
    if (!dispute.resolution) return;

    for (const action of dispute.resolution.actions) {
      this.emit('action:execute', {
        dispute,
        action
      });

      // Log action execution
      this.emit('action:executed', {
        disputeId: dispute.id,
        action,
        executedAt: new Date()
      });
    }

    // Handle compensation if any
    if (dispute.resolution.compensation) {
      this.emit('compensation:required', {
        dispute,
        compensation: dispute.resolution.compensation
      });
    }
  }

  /**
   * Verify system-generated evidence
   */
  private async verifySystemEvidence(evidence: Evidence): Promise<boolean> {
    // In production, this would verify against actual systems
    // For now, auto-verify system logs and tracking
    return evidence.type === 'system_log' || evidence.type === 'tracking';
  }

  /**
   * Get dispute configuration
   */
  private getDisputeConfig(type: DisputeType): any {
    return this.config.consensus.disputes.types.find(
      (t: any) => t.id === type
    ) || {};
  }

  /**
   * Find applicable escalation rule
   */
  private findApplicableEscalationRule(dispute: Dispute): any {
    const rules = this.config.consensus.disputes.escalation.rules;
    
    for (const rule of rules) {
      if (this.evaluateEscalationCondition(dispute, rule.condition)) {
        return rule;
      }
    }
    
    return null;
  }

  /**
   * Evaluate escalation condition
   */
  private evaluateEscalationCondition(dispute: Dispute, condition: string): boolean {
    // Simple condition evaluation
    // In production, use a proper expression evaluator
    
    if (condition.includes('elapsed_hours')) {
      const elapsed = (Date.now() - dispute.created.getTime()) / (1000 * 60 * 60);
      const match = condition.match(/elapsed_hours > (\d+)/);
      if (match) {
        return elapsed > parseInt(match[1]);
      }
    }
    
    return false;
  }

  /**
   * Calculate deadline for dispute resolution
   */
  private calculateDeadline(disputeConfig: any): Date {
    const hours = disputeConfig.escalation_timeout || 72;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Schedule deadline check
   */
  private scheduleDeadlineCheck(dispute: Dispute): void {
    setTimeout(() => {
      const currentDispute = this.disputes.get(dispute.id);
      if (currentDispute && 
          currentDispute.status !== DisputeStatus.RESOLVED &&
          new Date() > currentDispute.deadline) {
        this.updateStatus(
          dispute.id,
          DisputeStatus.ESCALATED,
          'system',
          'Deadline exceeded'
        ).catch(err => {
          console.error('Failed to escalate dispute:', err);
        });
      }
    }, dispute.deadline.getTime() - Date.now());
  }

  /**
   * Generate unique dispute ID
   */
  private generateDisputeId(): string {
    return `DISPUTE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique evidence ID
   */
  private generateEvidenceId(): string {
    return `EVIDENCE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get dispute by ID
   */
  public getDispute(disputeId: string): Dispute | undefined {
    return this.disputes.get(disputeId);
  }

  /**
   * Get disputes for a transaction
   */
  public getDisputesForTransaction(transactionId: string): Dispute[] {
    return Array.from(this.disputes.values())
      .filter(d => d.transactionId === transactionId);
  }

  /**
   * Get open disputes for a participant
   */
  public getOpenDisputes(participantId: string): Dispute[] {
    return Array.from(this.disputes.values())
      .filter(d => 
        (d.creator === participantId || d.respondent === participantId) &&
        d.status !== DisputeStatus.RESOLVED
      );
  }

  /**
   * Finalize resolution
   */
  private async finalizeResolution(dispute: Dispute): Promise<void> {
    // Mark related transaction appropriately
    this.emit('transaction:update_required', {
      transactionId: dispute.transactionId,
      newState: TransactionState.RESOLVED,
      reason: `Dispute resolved: ${dispute.resolution?.decision}`
    });
  }

  /**
   * Handle dispute event from external source
   */
  public async handleDisputeEvent(eventData: any): Promise<void> {
    const dispute = this.disputes.get(eventData.transactionId);
    if (dispute) {
      // Update dispute based on event
      this.emit('dispute:external_event', {
        dispute,
        event: eventData
      });
    }
  }

  /**
   * Update dispute with new evidence
   */
  public async updateDisputeWithEvidence(transactionId: string, evidence: any[]): Promise<void> {
    const disputes = this.getDisputesForTransaction(transactionId);
    for (const dispute of disputes) {
      if (dispute.status !== DisputeStatus.RESOLVED) {
        // Process new evidence
        for (const item of evidence) {
          await this.addEvidence(dispute, {
            submittedBy: item.submittedBy,
            type: item.type,
            description: item.description || 'Evidence from evidence manager',
            data: item.data
          });
        }
      }
    }
  }
}