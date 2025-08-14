import { EventEmitter } from 'events';
import { TransactionStateManager as StateManager } from '../core/state/state-manager';
import { ValidationEngine } from '../core/validation/validation-engine';
import { TimeoutHandler } from '../core/timeout/timeout-handler';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';
import { DisputeResolution } from '../exceptions/disputes/dispute-resolution';
import { EscalationHandler } from '../exceptions/escalation/escalation-handler';
import { EvidenceManager } from '../exceptions/evidence/evidence-manager';
import { Transaction, TransactionState } from '../core/types';

export interface EventBus {
  emit(event: string, data: any): void;
  on(event: string, handler: (data: any) => void): void;
  off(event: string, handler: (data: any) => void): void;
}

export interface IntegrationEvent {
  id: string;
  type: string;
  source: string;
  timestamp: Date;
  data: any;
  metadata?: any;
}

export class EventIntegration {
  private eventBus: EventBus;
  private components: Map<string, EventEmitter>;
  private eventHistory: IntegrationEvent[];
  private eventHandlers: Map<string, Set<(event: IntegrationEvent) => void>>;

  constructor() {
    this.eventBus = new EventEmitter();
    this.components = new Map();
    this.eventHistory = [];
    this.eventHandlers = new Map();
  }

  public registerComponent(name: string, component: EventEmitter): void {
    this.components.set(name, component);
    this.setupComponentListeners(name, component);
  }

  private setupComponentListeners(name: string, component: EventEmitter): void {
    // State Manager events
    if (name === 'stateManager') {
      component.on('state_changed', (data) => {
        this.publishEvent('state_changed', name, data);
      });

      component.on('state_transition_failed', (data) => {
        this.publishEvent('state_transition_failed', name, data);
      });
    }

    // Validation Engine events
    if (name === 'validationEngine') {
      component.on('validation_started', (data) => {
        this.publishEvent('validation_started', name, data);
      });

      component.on('validation_completed', (data) => {
        this.publishEvent('validation_completed', name, data);
      });

      component.on('consensus_achieved', (data) => {
        this.publishEvent('consensus_achieved', name, data);
      });

      component.on('consensus_failed', (data) => {
        this.publishEvent('consensus_failed', name, data);
      });
    }

    // Timeout Handler events
    if (name === 'timeoutHandler') {
      component.on('timeout_started', (data) => {
        this.publishEvent('timeout_started', name, data);
      });

      component.on('timeout_warning', (data) => {
        this.publishEvent('timeout_warning', name, data);
      });

      component.on('timeout_expired', (data) => {
        this.publishEvent('timeout_expired', name, data);
      });

      component.on('timeout_cleared', (data) => {
        this.publishEvent('timeout_cleared', name, data);
      });
    }

    // Trust System events
    if (name === 'trustSystem') {
      component.on('score_updated', (data) => {
        this.publishEvent('trust_score_updated', name, data);
      });

      component.on('trust_threshold_crossed', (data) => {
        this.publishEvent('trust_threshold_crossed', name, data);
      });

      component.on('party_flagged', (data) => {
        this.publishEvent('party_flagged', name, data);
      });
    }

    // Dispute Resolution events
    if (name === 'disputeResolution') {
      component.on('dispute_created', (data) => {
        this.publishEvent('dispute_created', name, data);
      });

      component.on('dispute_resolved', (data) => {
        this.publishEvent('dispute_resolved', name, data);
      });

      component.on('arbitration_required', (data) => {
        this.publishEvent('arbitration_required', name, data);
      });
    }

    // Escalation Handler events
    if (name === 'escalationHandler') {
      component.on('escalation', (data) => {
        this.publishEvent('escalation_triggered', name, data);
      });

      component.on('support_ticket_required', (data) => {
        this.publishEvent('support_ticket_required', name, data);
      });

      component.on('production_halt_required', (data) => {
        this.publishEvent('production_halt_required', name, data);
      });

      component.on('security_alert', (data) => {
        this.publishEvent('security_alert', name, data);
      });
    }

    // Evidence Manager events
    if (name === 'evidenceManager') {
      component.on('evidence_requested', (data) => {
        this.publishEvent('evidence_requested', name, data);
      });

      component.on('evidence_submitted', (data) => {
        this.publishEvent('evidence_submitted', name, data);
      });

      component.on('evidence_request_fulfilled', (data) => {
        this.publishEvent('evidence_request_fulfilled', name, data);
      });
    }
  }

  private publishEvent(type: string, source: string, data: any): void {
    const event: IntegrationEvent = {
      id: this.generateEventId(),
      type,
      source,
      timestamp: new Date(),
      data
    };

    // Store in history
    this.eventHistory.push(event);

    // Emit to event bus
    this.eventBus.emit(type, event);

    // Call registered handlers
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error in event handler for ${type}:`, error);
        }
      });
    }

    // Log critical events
    if (this.isCriticalEvent(type)) {
      console.log(`[CRITICAL EVENT] ${type} from ${source}:`, data);
    }
  }

  public subscribe(eventType: string, handler: (event: IntegrationEvent) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  public unsubscribe(eventType: string, handler: (event: IntegrationEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  // Cross-component orchestration
  public setupOrchestration(): void {
    // When consensus is achieved, update trust scores
    this.subscribe('consensus_achieved', async (event) => {
      const { transaction } = event.data;
      const trustSystem = this.components.get('trustSystem') as TrustScoringSystem;
      
      if (trustSystem && transaction) {
        await trustSystem.updateScore(transaction.sender, 0.01, 'successful_consensus');
        await trustSystem.updateScore(transaction.receiver, 0.01, 'successful_consensus');
      }
    });

    // When timeout expires, trigger escalation
    this.subscribe('timeout_expired', async (event) => {
      const { transactionId, timeoutPercent } = event.data;
      const escalationHandler = this.components.get('escalationHandler') as EscalationHandler;
      
      if (escalationHandler) {
        const transaction = await this.getTransaction(transactionId);
        await escalationHandler.handleEscalation(transaction, timeoutPercent, 'standard');
      }
    });

    // When dispute is created, request evidence
    this.subscribe('dispute_created', async (event) => {
      const { transactionId, parties } = event.data;
      const evidenceManager = this.components.get('evidenceManager') as EvidenceManager;
      
      if (evidenceManager) {
        await evidenceManager.requestEvidence(
          transactionId,
          ['shipping_document', 'photo_proof', 'timestamp_verification'],
          parties,
          'dispute_investigation'
        );
      }
    });

    // When evidence is fulfilled, update dispute
    this.subscribe('evidence_request_fulfilled', async (event) => {
      const { transactionId, evidence } = event.data;
      const disputeResolution = this.components.get('disputeResolution') as DisputeResolution;
      
      if (disputeResolution) {
        await disputeResolution.updateDisputeWithEvidence(transactionId, evidence);
      }
    });

    // When security alert is raised, halt related transactions
    this.subscribe('security_alert', async (event) => {
      const { transactionId, parties } = event.data;
      const stateManager = this.components.get('stateManager') as StateManager;
      
      if (stateManager) {
        // Halt all pending transactions for the parties
        for (const party of parties) {
          await this.haltPartyTransactions(party);
        }
      }
    });
  }

  // Analytics and monitoring
  public getEventMetrics(timeWindow?: { start: Date; end: Date }): any {
    let events = this.eventHistory;
    
    if (timeWindow) {
      events = events.filter(e => 
        e.timestamp >= timeWindow.start && e.timestamp <= timeWindow.end
      );
    }

    const metrics = {
      totalEvents: events.length,
      byType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      criticalEvents: 0,
      errorEvents: 0
    };

    for (const event of events) {
      // Count by type
      metrics.byType[event.type] = (metrics.byType[event.type] || 0) + 1;
      
      // Count by source
      metrics.bySource[event.source] = (metrics.bySource[event.source] || 0) + 1;
      
      // Count critical events
      if (this.isCriticalEvent(event.type)) {
        metrics.criticalEvents++;
      }
      
      // Count error events
      if (event.type.includes('failed') || event.type.includes('error')) {
        metrics.errorEvents++;
      }
    }

    return metrics;
  }

  public getEventHistory(
    filter?: {
      type?: string;
      source?: string;
      startTime?: Date;
      endTime?: Date;
    },
    limit?: number
  ): IntegrationEvent[] {
    let filtered = this.eventHistory;

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter(e => e.type === filter.type);
      }
      if (filter.source) {
        filtered = filtered.filter(e => e.source === filter.source);
      }
      if (filter.startTime) {
        filtered = filtered.filter(e => e.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filtered = filtered.filter(e => e.timestamp <= filter.endTime!);
      }
    }

    return limit ? filtered.slice(-limit) : filtered;
  }

  // Event correlation
  public correlateEvents(transactionId: string): IntegrationEvent[] {
    return this.eventHistory.filter(event => {
      if (event.data && event.data.transactionId === transactionId) {
        return true;
      }
      if (event.data && event.data.transaction && event.data.transaction.id === transactionId) {
        return true;
      }
      return false;
    });
  }

  // Workflow tracking
  public async trackTransactionWorkflow(transactionId: string): Promise<any> {
    const events = this.correlateEvents(transactionId);
    
    const workflow = {
      transactionId,
      stages: [] as any[],
      currentStage: null as string | null,
      startTime: null as Date | null,
      endTime: null as Date | null,
      duration: null as number | null,
      issues: [] as any[]
    };

    // Sort events by timestamp
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (events.length > 0) {
      workflow.startTime = events[0].timestamp;
      workflow.endTime = events[events.length - 1].timestamp;
      workflow.duration = workflow.endTime.getTime() - workflow.startTime.getTime();
    }

    // Build workflow stages
    for (const event of events) {
      const stage = {
        type: event.type,
        timestamp: event.timestamp,
        source: event.source,
        data: event.data
      };

      workflow.stages.push(stage);

      // Track issues
      if (event.type.includes('failed') || event.type.includes('error') || event.type.includes('dispute')) {
        workflow.issues.push(stage);
      }
    }

    // Determine current stage
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      workflow.currentStage = this.mapEventToStage(lastEvent.type);
    }

    return workflow;
  }

  private mapEventToStage(eventType: string): string {
    const stageMapping: Record<string, string> = {
      'state_changed': 'processing',
      'validation_completed': 'validated',
      'consensus_achieved': 'confirmed',
      'dispute_created': 'disputed',
      'dispute_resolved': 'resolved',
      'timeout_expired': 'timeout',
      'escalation_triggered': 'escalated'
    };

    return stageMapping[eventType] || 'unknown';
  }

  private isCriticalEvent(type: string): boolean {
    const criticalEvents = [
      'security_alert',
      'production_halt_required',
      'dispute_created',
      'timeout_expired',
      'consensus_failed',
      'state_transition_failed'
    ];

    return criticalEvents.includes(type);
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getTransaction(transactionId: string): Promise<Transaction> {
    // This would integrate with the state manager or fabric integration
    // Placeholder implementation
    return {
      id: transactionId,
      sender: 'unknown',
      receiver: 'unknown',
      state: TransactionState.INITIATED,
      timestamp: new Date(),
      itemId: 'placeholder',
      value: 0,
      created: new Date(),
      updated: new Date(),
      timeoutAt: new Date(Date.now() + 3600000), // 1 hour default timeout
      stateHistory: []
    };
  }

  private async haltPartyTransactions(party: string): Promise<void> {
    // This would integrate with the state manager to halt transactions
    console.log(`Halting all transactions for party: ${party}`);
  }

  // Health monitoring
  public getSystemHealth(): any {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const recentEvents = this.eventHistory.filter(e => e.timestamp >= fiveMinutesAgo);
    const recentErrors = recentEvents.filter(e => 
      e.type.includes('failed') || e.type.includes('error')
    );
    
    return {
      status: recentErrors.length > 10 ? 'unhealthy' : 'healthy',
      eventsPerMinute: recentEvents.length / 5,
      errorRate: recentEvents.length > 0 ? recentErrors.length / recentEvents.length : 0,
      activeComponents: Array.from(this.components.keys()),
      lastEvent: this.eventHistory[this.eventHistory.length - 1],
      criticalEvents: recentEvents.filter(e => this.isCriticalEvent(e.type)).length
    };
  }
}