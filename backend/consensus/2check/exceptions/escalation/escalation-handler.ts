import { EventEmitter } from 'events';
import { Transaction, TransactionState, TransactionParty } from '../../core/types';
import { NotificationService } from '../../services/notification-service';
import { DisputeResolution } from '../disputes/dispute-resolution';
import { EvidenceManager } from '../evidence/evidence-manager';
import { TrustScoringSystem } from '../../core/trust/trust-scoring-system';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface EscalationLevel {
  level: number;
  at_percent: number;
  action: string;
  notify: string[];
  channel?: string;
}

export interface EscalationEvent {
  transactionId: string;
  level: number;
  action: string;
  timestamp: Date;
  reason: string;
  notifiedParties: string[];
}

export interface EscalationCondition {
  type: string;
  action: string;
  severity?: string;
  count?: number;
  window?: number;
}

export interface AutoEscalationConfig {
  enabled: boolean;
  conditions: EscalationCondition[];
}

export interface EscalationConfig {
  escalation_levels: EscalationLevel[];
  business_hours_only: boolean;
  timezone: string;
  auto_escalation?: AutoEscalationConfig;
}

export class EscalationHandler extends EventEmitter {
  private notificationService: NotificationService;
  private disputeResolution: DisputeResolution;
  private evidenceManager: EvidenceManager;
  private trustSystem: TrustScoringSystem;
  private escalationHistory: Map<string, EscalationEvent[]>;
  private config: any;

  constructor(
    notificationService: NotificationService,
    disputeResolution: DisputeResolution,
    evidenceManager: EvidenceManager,
    trustSystem: TrustScoringSystem
  ) {
    super();
    this.notificationService = notificationService;
    this.disputeResolution = disputeResolution;
    this.evidenceManager = evidenceManager;
    this.trustSystem = trustSystem;
    this.escalationHistory = new Map();
    this.loadConfig();
  }

  private loadConfig(): void {
    const configPath = path.join(__dirname, '../../config/timeout-rules.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configContent);
  }

  public async handleEscalation(
    transaction: Transaction,
    timeoutPercent: number,
    transactionType: string
  ): Promise<void> {
    const escalationConfig = this.getEscalationConfig(transactionType);
    if (!escalationConfig) {
      console.warn(`No escalation config found for transaction type: ${transactionType}`);
      return;
    }

    const applicableLevel = this.determineEscalationLevel(
      timeoutPercent,
      escalationConfig.escalation_levels
    );

    if (!applicableLevel) {
      return; // No escalation needed yet
    }

    // Check if we've already escalated to this level
    const history = this.escalationHistory.get(transaction.id) || [];
    const alreadyEscalated = history.some(e => e.level >= applicableLevel.level);

    if (alreadyEscalated) {
      return; // Already handled this level
    }

    // Execute escalation action
    await this.executeEscalationAction(transaction, applicableLevel, transactionType);

    // Record escalation event
    const event: EscalationEvent = {
      transactionId: transaction.id,
      level: applicableLevel.level,
      action: applicableLevel.action,
      timestamp: new Date(),
      reason: `Timeout reached ${timeoutPercent}%`,
      notifiedParties: applicableLevel.notify
    };

    history.push(event);
    this.escalationHistory.set(transaction.id, history);

    // Emit escalation event
    this.emit('escalation', {
      transaction,
      level: applicableLevel.level,
      action: applicableLevel.action
    });
  }

  private getEscalationConfig(transactionType: string): EscalationConfig | null {
    const typeConfig = this.config.transaction_types[transactionType];
    return typeConfig || null;
  }

  private determineEscalationLevel(
    timeoutPercent: number,
    levels: EscalationLevel[]
  ): EscalationLevel | null {
    // Sort levels by percentage in descending order
    const sortedLevels = [...levels].sort((a, b) => b.at_percent - a.at_percent);

    // Find the highest level that should be triggered
    for (const level of sortedLevels) {
      if (timeoutPercent >= level.at_percent) {
        return level;
      }
    }

    return null;
  }

  private async executeEscalationAction(
    transaction: Transaction,
    level: EscalationLevel,
    transactionType: string
  ): Promise<void> {
    switch (level.action) {
      case 'send_reminder':
        await this.sendReminder(transaction, level);
        break;

      case 'urgent_notification':
        await this.sendUrgentNotification(transaction, level);
        break;

      case 'auto_escalate':
        await this.autoEscalate(transaction, level);
        break;

      case 'support_ticket':
        await this.createSupportTicket(transaction, level);
        break;

      case 'halt_production':
        await this.haltProduction(transaction, level);
        break;

      case 'create_dispute':
        await this.createDispute(transaction);
        break;

      case 'security_alert':
        await this.raiseSecurityAlert(transaction);
        break;

      default:
        console.warn(`Unknown escalation action: ${level.action}`);
    }
  }

  private async sendReminder(
    transaction: Transaction,
    level: EscalationLevel
  ): Promise<void> {
    const template = this.config.notification_templates.reminder;
    const parties = this.resolveNotificationParties(transaction, level.notify);

    for (const party of parties) {
      await this.notificationService.send({
        to: party,
        subject: template.subject.replace('{item_type}', transaction.itemType || 'item'),
        priority: template.priority,
        channel: (level.channel as 'email' | 'sms' | 'push' | 'system' | 'all') || 'email',
        transactionId: transaction.id
      });
    }
  }

  private async sendUrgentNotification(
    transaction: Transaction,
    level: EscalationLevel
  ): Promise<void> {
    const template = this.config.notification_templates.urgent;
    const parties = this.resolveNotificationParties(transaction, level.notify);

    for (const party of parties) {
      await this.notificationService.send({
        to: party,
        subject: template.subject.replace('{item_type}', transaction.itemType || 'item'),
        priority: template.priority,
        channel: 'all', // Send through all available channels for urgent
        transactionId: transaction.id
      });
    }
  }

  private async autoEscalate(
    transaction: Transaction,
    level: EscalationLevel
  ): Promise<void> {
    const template = this.config.notification_templates.escalation;
    const parties = this.resolveNotificationParties(transaction, level.notify);

    // Create a dispute automatically
    await this.createDispute(transaction);

    // Notify all parties
    for (const party of parties) {
      await this.notificationService.send({
        to: party,
        subject: template.subject.replace('{item_type}', transaction.itemType || 'item'),
        priority: template.priority,
        channel: 'all',
        transactionId: transaction.id,
        additionalInfo: {
          disputeCreated: true,
          escalationLevel: level.level
        }
      });
    }

    // Update trust scores
    await this.updateTrustScores(transaction, 'escalation');
  }

  private async createSupportTicket(
    transaction: Transaction,
    level: EscalationLevel
  ): Promise<void> {
    // Integration point for support ticket system
    const ticket = {
      transactionId: transaction.id,
      type: 'timeout_escalation',
      priority: 'high',
      customer: transaction.receiver,
      created: new Date(),
      description: `Customer has not claimed ownership within timeout period`
    };

    // Emit event for external ticket system integration
    this.emit('support_ticket_required', ticket);

    // Notify customer service
    const csTeam = this.resolveNotificationParties(transaction, level.notify);
    for (const member of csTeam) {
      await this.notificationService.send({
        to: member,
        subject: `Support Ticket Created: Transaction ${transaction.id}`,
        priority: 'high',
        channel: 'system',
        transactionId: transaction.id,
        additionalInfo: ticket
      });
    }
  }

  private async haltProduction(
    transaction: Transaction,
    level: EscalationLevel
  ): Promise<void> {
    // Critical action for quality-related timeouts
    const haltOrder = {
      transactionId: transaction.id,
      reason: 'quality_inspection_timeout',
      timestamp: new Date(),
      affectedBatch: transaction.batchId,
      severity: 'critical'
    };

    // Emit halt event for production systems
    this.emit('production_halt_required', haltOrder);

    // Notify all critical stakeholders
    const stakeholders = this.resolveNotificationParties(transaction, level.notify);
    for (const stakeholder of stakeholders) {
      await this.notificationService.send({
        to: stakeholder,
        subject: `CRITICAL: Production Halt Required`,
        priority: 'critical',
        channel: 'all',
        transactionId: transaction.id,
        additionalInfo: haltOrder
      });
    }
  }

  private async createDispute(transaction: Transaction): Promise<void> {
    // Request evidence before creating dispute
    const requiredEvidence = this.config.evidence_requirements.dispute;
    await this.evidenceManager.requestEvidence(transaction.id, requiredEvidence);

    // Create formal dispute
    const dispute = await this.disputeResolution.createDispute({
      transactionId: transaction.id,
      transaction: transaction,
      type: 'not_received' as any, // Default dispute type for timeout
      creator: 'system',
      reason: 'timeout_exceeded',
      initiator: 'system',
      initialEvidence: await this.evidenceManager.getEvidence(transaction.id),
      timestamp: new Date()
    });

    // Update transaction state
    transaction.state = TransactionState.DISPUTED;
    
    this.emit('dispute_created', {
      transactionId: transaction.id,
      disputeId: dispute.id
    });
  }

  private async raiseSecurityAlert(transaction: Transaction): Promise<void> {
    const alert = {
      transactionId: transaction.id,
      type: 'pattern_anomaly',
      severity: 'critical',
      timestamp: new Date(),
      pattern: 'suspicious_routing',
      parties: [transaction.sender, transaction.receiver]
    };

    // Emit security event
    this.emit('security_alert', alert);

    // Notify security team
    await this.notificationService.send({
      to: 'security_team',
      subject: `SECURITY ALERT: Suspicious Pattern Detected`,
      priority: 'critical',
      channel: 'all',
      transactionId: transaction.id,
      additionalInfo: alert
    });

    // Update trust scores significantly
    await this.updateTrustScores(transaction, 'security_alert');
  }

  private resolveNotificationParties(
    transaction: Transaction,
    parties: string[]
  ): string[] {
    const resolved: string[] = [];

    for (const party of parties) {
      switch (party) {
        case 'sender':
          resolved.push(transaction.sender);
          break;
        case 'receiver':
          resolved.push(transaction.receiver);
          break;
        case 'all_stakeholders':
          resolved.push(transaction.sender, transaction.receiver);
          if (transaction.stakeholders) {
            resolved.push(...transaction.stakeholders);
          }
          break;
        case 'brand_admin':
          resolved.push('admin@' + this.extractBrandFromTransaction(transaction));
          break;
        case 'customer':
          resolved.push(transaction.receiver);
          break;
        case 'customer_service':
          resolved.push('support@' + this.extractBrandFromTransaction(transaction));
          break;
        default:
          // Assume it's a direct identifier
          resolved.push(party);
      }
    }

    return [...new Set(resolved)]; // Remove duplicates
  }

  private extractBrandFromTransaction(transaction: Transaction): string {
    // Extract brand from transaction metadata or use default
    return transaction.brand || 'luxury-brand.com';
  }

  private async updateTrustScores(
    transaction: Transaction,
    reason: string
  ): Promise<void> {
    const impact = {
      escalation: -0.05,
      security_alert: -0.20,
      dispute: -0.10
    };

    const scoreChange = impact[reason as keyof typeof impact] || -0.05;

    // Update sender's trust score
    await this.trustSystem.updateScore(transaction.sender, scoreChange, reason);
    
    // Update receiver's trust score (less impact)
    await this.trustSystem.updateScore(transaction.receiver, scoreChange * 0.5, reason);
  }

  public getEscalationHistory(transactionId: string): EscalationEvent[] {
    return this.escalationHistory.get(transactionId) || [];
  }

  public async checkAutoEscalationPatterns(party: string): Promise<void> {
    const autoEscalationConfig = this.config.auto_escalation;
    if (!autoEscalationConfig.enabled) {
      return;
    }

    // Check for multiple timeouts pattern
    const recentTransactions = await this.getRecentTransactionsForParty(party);
    const timeoutCount = recentTransactions.filter(t => 
      this.escalationHistory.has(t.id)
    ).length;

    const multipleTimeoutsRule = autoEscalationConfig.conditions.find(
      (c: EscalationCondition) => c.type === 'multiple_timeouts'
    );

    if (multipleTimeoutsRule && timeoutCount >= multipleTimeoutsRule.count) {
      await this.flagRelationship(party, 'multiple_timeouts');
    }
  }

  private async getRecentTransactionsForParty(party: string): Promise<Transaction[]> {
    // This would integrate with transaction storage
    // For now, returning empty array as placeholder
    return [];
  }

  private async flagRelationship(party: string, reason: string): Promise<void> {
    this.emit('relationship_flagged', {
      party,
      reason,
      timestamp: new Date()
    });

    await this.trustSystem.flagParty(party, reason);
  }
}