import { EventEmitter } from 'events';
import { TransactionStateManager as StateManager } from '../core/state/state-manager';
import { ValidationEngine } from '../core/validation/validation-engine';
import { TimeoutHandler } from '../core/timeout/timeout-handler';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';
import { DisputeResolution } from '../exceptions/disputes/dispute-resolution';
import { EscalationHandler } from '../exceptions/escalation/escalation-handler';
import { EvidenceManager } from '../exceptions/evidence/evidence-manager';
import { NotificationService } from '../services/notification-service';
import { FabricIntegration } from './fabric-integration';
import { EventIntegration } from './event-integration';
import { Transaction, TransactionState } from '../core/types';
import { trustScoreConverter } from './state-mapping';
import { AnomalyDetector } from '../security/anomaly-detector';
import { EmergencyStopSystem } from '../exceptions/emergency-stop';
import { CompensationRuleEngine } from '../exceptions/compensation-rules';
import { ProgressiveAutomation } from '../optimization/progressive-automation';
import { PerformanceAnalytics } from '../analytics/performance-analytics';

export interface OrchestratorConfig {
  fabricConfig: any;
  consensusConfig: any;
  notificationConfig?: any;
}

export class ConsensusOrchestrator extends EventEmitter {
  private stateManager!: StateManager;
  private validationEngine!: ValidationEngine;
  private timeoutHandler!: TimeoutHandler;
  private trustSystem!: TrustScoringSystem;
  private disputeResolution!: DisputeResolution;
  private escalationHandler!: EscalationHandler;
  private evidenceManager!: EvidenceManager;
  private notificationService!: NotificationService;
  private fabricIntegration!: FabricIntegration;
  private eventIntegration!: EventIntegration;
  private anomalyDetector!: AnomalyDetector;
  private emergencyStop!: EmergencyStopSystem;
  private compensationEngine!: CompensationRuleEngine;
  private progressiveAutomation!: ProgressiveAutomation;
  private performanceAnalytics!: PerformanceAnalytics;
  private isInitialized: boolean = false;

  constructor(private config: OrchestratorConfig) {
    super();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Orchestrator already initialized');
    }

    try {
      // Initialize core components
      this.initializeCoreComponents();
      
      // Initialize exception handling components
      this.initializeExceptionComponents();
      
      // Initialize integration layer
      await this.initializeIntegrations();
      
      // Set up event orchestration
      this.setupEventOrchestration();
      
      // Connect to Fabric network
      await this.fabricIntegration.connect();
      
      this.isInitialized = true;
      this.emit('initialized');
      
      console.log('2-Check Consensus Orchestrator initialized successfully');
    } catch (error) {
      console.error('Failed to initialize orchestrator:', error);
      throw error;
    }
  }

  private initializeCoreComponents(): void {
    // Initialize state manager
    this.stateManager = new StateManager();
    
    // Initialize validation engine
    this.validationEngine = new ValidationEngine();
    
    // Initialize timeout handler
    this.timeoutHandler = new TimeoutHandler(this.validationEngine);
    
    // Initialize trust scoring system
    this.trustSystem = new TrustScoringSystem();
    
    // Initialize AI anomaly detector
    this.anomalyDetector = new AnomalyDetector(this.trustSystem);
    
    // Initialize emergency stop system
    this.emergencyStop = new EmergencyStopSystem(
      this.stateManager,
      this.anomalyDetector
    );
    
    // Initialize compensation engine
    this.compensationEngine = new CompensationRuleEngine();
    
    // Initialize progressive automation
    this.progressiveAutomation = new ProgressiveAutomation(
      this.trustSystem,
      this.stateManager
    );
    
    // Initialize performance analytics
    this.performanceAnalytics = new PerformanceAnalytics(
      this.stateManager,
      this.trustSystem
    );
  }

  private initializeExceptionComponents(): void {
    // Initialize notification service
    this.notificationService = new NotificationService();
    
    // Initialize evidence manager
    this.evidenceManager = new EvidenceManager();
    
    // Initialize dispute resolution
    this.disputeResolution = new DisputeResolution(
      this.validationEngine,
      this.evidenceManager,
      this.trustSystem
    );
    
    // Initialize escalation handler
    this.escalationHandler = new EscalationHandler(
      this.notificationService,
      this.disputeResolution,
      this.evidenceManager,
      this.trustSystem
    );
  }

  private async initializeIntegrations(): Promise<void> {
    // Initialize Fabric integration
    this.fabricIntegration = new FabricIntegration(
      this.config.fabricConfig,
      this.stateManager,
      this.validationEngine,
      this.timeoutHandler,
      this.trustSystem,
      this.disputeResolution
    );
    
    // Initialize event integration
    this.eventIntegration = new EventIntegration();
    
    // Register all components with event integration
    this.eventIntegration.registerComponent('stateManager', this.stateManager);
    this.eventIntegration.registerComponent('validationEngine', this.validationEngine);
    this.eventIntegration.registerComponent('timeoutHandler', this.timeoutHandler);
    this.eventIntegration.registerComponent('trustSystem', this.trustSystem);
    this.eventIntegration.registerComponent('disputeResolution', this.disputeResolution);
    this.eventIntegration.registerComponent('escalationHandler', this.escalationHandler);
    this.eventIntegration.registerComponent('evidenceManager', this.evidenceManager);
    this.eventIntegration.registerComponent('fabricIntegration', this.fabricIntegration);
    this.eventIntegration.registerComponent('anomalyDetector', this.anomalyDetector);
    this.eventIntegration.registerComponent('emergencyStop', this.emergencyStop);
    this.eventIntegration.registerComponent('compensationEngine', this.compensationEngine);
    this.eventIntegration.registerComponent('progressiveAutomation', this.progressiveAutomation);
    this.eventIntegration.registerComponent('performanceAnalytics', this.performanceAnalytics);
  }

  private setupEventOrchestration(): void {
    // Set up cross-component event orchestration
    this.eventIntegration.setupOrchestration();
    
    // Additional orchestration rules
    this.setupTimeoutOrchestration();
    this.setupTrustOrchestration();
    this.setupNotificationOrchestration();
    this.setupAnomalyOrchestration();
    this.setupCompensationOrchestration();
  }

  private setupTimeoutOrchestration(): void {
    // When timeout warning occurs, send notifications
    this.eventIntegration.subscribe('timeout_warning', async (event) => {
      const { transactionId, timeoutPercent, remainingTime } = event.data;
      
      const transaction = await this.fabricIntegration.getTransaction(transactionId);
      
      // Determine who needs to be notified
      const parties = this.determineNotificationParties(transaction, timeoutPercent);
      
      // Send notifications
      for (const party of parties) {
        await this.notificationService.send({
          to: party,
          subject: `Action Required: Transaction ${transactionId} timeout warning`,
          priority: timeoutPercent >= 80 ? 'high' : 'normal',
          transactionId,
          additionalInfo: {
            timeoutPercent,
            remainingTime
          }
        });
      }
    });
  }

  private setupTrustOrchestration(): void {
    // When trust threshold is crossed, adjust timeout rules
    this.eventIntegration.subscribe('trust_threshold_crossed', async (event) => {
      const { partyId, newLevel, oldLevel } = event.data;
      
      // If trust increased to high level, enable auto-confirmation
      if (newLevel === 'high' && oldLevel !== 'high') {
        console.log(`Enabling auto-confirmation for high-trust party: ${partyId}`);
        // Update validation rules for this party
      }
      
      // If trust decreased significantly, require additional evidence
      if (newLevel === 'low' && oldLevel !== 'low') {
        console.log(`Requiring additional evidence for low-trust party: ${partyId}`);
        // Update evidence requirements
      }
    });
  }

  private setupAnomalyOrchestration(): void {
    // When anomalies are detected, take appropriate action
    this.anomalyDetector.on('anomaly_detected', async (event) => {
      const { transactionId, result } = event;
      
      // Log critical anomalies
      if (result.riskScore >= 80) {
        console.log(`[CRITICAL ANOMALY] Transaction ${transactionId}: ${result.reasons.join(', ')}`);
      }
      
      // Check if compensation might be needed
      if (result.patterns.some((p: any) => p.type === 'value' && p.severity === 'high')) {
        await this.compensationEngine.calculateCompensation(
          await this.fabricIntegration.getTransaction(transactionId),
          'anomaly_detected',
          { anomalyResult: result }
        );
      }
    });
    
    // When party is blacklisted, halt their transactions
    this.anomalyDetector.on('party_blacklisted', async (event) => {
      const { partyId, reason } = event;
      await this.emergencyStop.triggerEmergencyStop(
        'security_system',
        `Party blacklisted: ${reason}`,
        []
      );
    });
  }
  
  private setupCompensationOrchestration(): void {
    // When dispute is resolved, check for compensation
    this.disputeResolution.on('dispute_resolved', async (event) => {
      const { dispute, resolution } = event;
      if (resolution.outcome) {
        await this.compensationEngine.handleDisputeOutcome(
          dispute.transactionId,
          resolution.outcome,
          resolution
        );
      }
    });
    
    // When timeout occurs, calculate compensation
    this.eventIntegration.subscribe('timeout_expired', async (event) => {
      const { transactionId } = event.data;
      const transaction = await this.fabricIntegration.getTransaction(transactionId);
      await this.compensationEngine.calculateCompensation(
        transaction,
        'timeout',
        { timeoutData: event.data }
      );
    });
    
    // Handle compensation approvals
    this.compensationEngine.on('approval_required', (event) => {
      this.emit('compensation_approval_required', event);
    });
  }
  
  private setupNotificationOrchestration(): void {
    // Aggregate related events for batch notifications
    let notificationQueue: Map<string, any[]> = new Map();
    let notificationTimer: NodeJS.Timeout | null = null;
    
    const queueNotification = (recipient: string, notification: any) => {
      if (!notificationQueue.has(recipient)) {
        notificationQueue.set(recipient, []);
      }
      notificationQueue.get(recipient)!.push(notification);
      
      // Set timer to send batch notifications
      if (!notificationTimer) {
        notificationTimer = setTimeout(async () => {
          await this.sendBatchNotifications(notificationQueue);
          notificationQueue.clear();
          notificationTimer = null;
        }, 5000); // 5 second batching window
      }
    };
    
    // Queue various notification events
    this.eventIntegration.subscribe('validation_completed', (event) => {
      if (event.data.requiresNotification) {
        queueNotification(event.data.receiver, {
          type: 'validation_completed',
          data: event.data
        });
      }
    });
  }

  // Public API methods
  public async submitTransaction(transaction: Transaction): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }
    
    try {
      // Check for anomalies before submission
      const anomalyResult = await this.anomalyDetector.analyzeTransaction(transaction);
      
      // Check if emergency stop should be triggered
      const shouldStop = await this.emergencyStop.checkTransaction(transaction, anomalyResult);
      if (shouldStop) {
        throw new Error('Transaction halted by emergency stop system');
      }
      
      // Check for progressive automation
      const automationDecision = await this.progressiveAutomation.evaluateTransaction(transaction);
      if (automationDecision.shouldAutomate) {
        await this.progressiveAutomation.applyAutomation(transaction, automationDecision);
      }
      
      // Adjust timeout dynamically based on trust
      const dynamicTimeout = await this.progressiveAutomation.adjustTimeoutDynamically(transaction);
      transaction.timeoutAt = new Date(Date.now() + dynamicTimeout * 3600000);
      
      // Submit through Fabric integration
      const transactionId = await this.fabricIntegration.submitTransaction(transaction);
      
      // Start monitoring
      await this.startTransactionMonitoring(transactionId);
      
      this.emit('transaction_submitted', { transactionId, transaction, anomalyResult, automationDecision });
      
      return transactionId;
    } catch (error) {
      console.error('Failed to submit transaction:', error);
      throw error;
    }
  }

  public async confirmSent(transactionId: string, sender: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }
    
    try {
      await this.fabricIntegration.confirmSent(transactionId, sender);
      this.emit('confirmation_sent', { transactionId, sender });
    } catch (error) {
      console.error('Failed to confirm sent:', error);
      throw error;
    }
  }

  public async confirmReceived(transactionId: string, receiver: string): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }
    
    try {
      await this.fabricIntegration.confirmReceived(transactionId, receiver);
      this.emit('confirmation_received', { transactionId, receiver });
    } catch (error) {
      console.error('Failed to confirm received:', error);
      throw error;
    }
  }

  public async raiseDispute(
    transactionId: string,
    initiator: string,
    reason: string,
    evidence?: any[]
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }
    
    try {
      // First raise dispute in chaincode
      await this.fabricIntegration.raiseDispute(transactionId, initiator, reason);
      
      // Then create local dispute record
      const transaction = await this.fabricIntegration.getTransaction(transactionId);
      const dispute = await this.disputeResolution.createDispute({
        transactionId,
        transaction,
        type: reason as any, // Would map reason to DisputeType
        creator: initiator,
        reason,
        initiator: initiator,
        timestamp: new Date()
      });
      
      // Submit evidence if provided
      if (evidence && evidence.length > 0) {
        for (const item of evidence) {
          await this.evidenceManager.submitEvidence(
            transactionId,
            item.type,
            item.data,
            item.submittedBy
          );
        }
      }
      
      this.emit('dispute_raised', { disputeId: dispute.id, transactionId });
      
      return dispute.id;
    } catch (error) {
      console.error('Failed to raise dispute:', error);
      throw error;
    }
  }

  // Monitoring and analytics
  private async startTransactionMonitoring(transactionId: string): Promise<void> {
    // Set up monitoring for this transaction
    const monitoringInterval = setInterval(async () => {
      try {
        const transaction = await this.fabricIntegration.getTransaction(transactionId);
        
        // Check if transaction is complete
        if (transaction.state === TransactionState.VALIDATED ||
            transaction.state === TransactionState.DISPUTED) {
          clearInterval(monitoringInterval);
          return;
        }
        
        // Check for anomalies
        await this.checkTransactionAnomalies(transaction);
        
      } catch (error) {
        console.error(`Error monitoring transaction ${transactionId}:`, error);
        clearInterval(monitoringInterval);
      }
    }, 30000); // Check every 30 seconds
  }

  private async checkTransactionAnomalies(transaction: Transaction): Promise<void> {
    // Check for suspicious patterns
    const anomalies: string[] = [];
    
    // Check if transaction is stuck
    const ageInMinutes = (Date.now() - transaction.timestamp.getTime()) / (1000 * 60);
    if ((transaction.state === TransactionState.CREATED || transaction.state === TransactionState.INITIATED) && ageInMinutes > 60) {
      anomalies.push('transaction_stuck');
    }
    
    // Check trust scores
    const senderTrust = await this.trustSystem.getScore(transaction.sender);
    const receiverTrust = await this.trustSystem.getScore(transaction.receiver);
    
    // Trust scores in TypeScript are 0-200, so check for low trust (< 60 out of 200)
    if (senderTrust < 60 || receiverTrust < 60) {
      anomalies.push('low_trust_party');
    }
    
    if (anomalies.length > 0) {
      this.emit('anomalies_detected', {
        transactionId: transaction.id,
        anomalies,
        transaction
      });
    }
  }

  private determineNotificationParties(
    transaction: Transaction,
    timeoutPercent: number
  ): string[] {
    const parties: string[] = [];
    
    // Always notify receiver if waiting for their confirmation
    if (transaction.state === TransactionState.SENT) {
      parties.push(transaction.receiver);
    }
    
    // Notify sender if waiting for their confirmation
    if (transaction.state === TransactionState.CREATED || transaction.state === TransactionState.INITIATED) {
      parties.push(transaction.sender);
    }
    
    // Notify administrators for high timeout percentages
    if (timeoutPercent >= 80) {
      parties.push('admin@brand.com'); // Would be configured
    }
    
    return parties;
  }

  private async sendBatchNotifications(queue: Map<string, any[]>): Promise<void> {
    for (const [recipient, notifications] of queue) {
      if (notifications.length === 1) {
        // Single notification
        const notif = notifications[0];
        await this.notificationService.send({
          to: recipient,
          subject: this.getNotificationSubject(notif.type),
          priority: 'normal',
          additionalInfo: notif.data
        });
      } else {
        // Batch notification
        await this.notificationService.send({
          to: recipient,
          subject: `${notifications.length} updates for your transactions`,
          priority: 'normal',
          additionalInfo: {
            notifications: notifications.map(n => ({
              type: n.type,
              summary: this.getNotificationSummary(n)
            }))
          }
        });
      }
    }
  }

  private getNotificationSubject(type: string): string {
    const subjects: Record<string, string> = {
      'validation_completed': 'Transaction Validated Successfully',
      'dispute_created': 'Dispute Created for Transaction',
      'timeout_warning': 'Action Required: Transaction Timeout Warning',
      'evidence_requested': 'Evidence Required for Transaction'
    };
    
    return subjects[type] || 'Transaction Update';
  }

  private getNotificationSummary(notification: any): string {
    // Generate concise summary for batch notifications
    return `${notification.type}: ${notification.data.transactionId || 'N/A'}`;
  }

  // Analytics and reporting
  public async getSystemMetrics(): Promise<any> {
    const eventMetrics = this.eventIntegration.getEventMetrics();
    const networkStats = await this.fabricIntegration.getNetworkStats();
    const systemHealth = this.eventIntegration.getSystemHealth();
    const performanceMetrics = await this.performanceAnalytics.calculatePerformanceMetrics();
    const emergencyStats = this.emergencyStop.getStatistics();
    const compensationStats = this.compensationEngine.getStatistics();
    const automationStats = this.progressiveAutomation.getStatistics();
    
    return {
      consensus: {
        totalTransactions: networkStats.totalTransactions,
        pendingTransactions: networkStats.pendingTransactions,
        disputedTransactions: networkStats.disputedTransactions,
        averageConfirmationTime: networkStats.averageConfirmationTime
      },
      trust: {
        averageScore: networkStats.trustScoreAverage,
        flaggedParties: await this.trustSystem.getFlaggedParties()
      },
      performance: performanceMetrics,
      emergency: emergencyStats,
      compensation: compensationStats,
      automation: automationStats,
      events: eventMetrics,
      health: systemHealth,
      insights: this.performanceAnalytics.getInsights(),
      timestamp: new Date()
    };
  }

  public async getTransactionReport(transactionId: string): Promise<any> {
    const transaction = await this.fabricIntegration.getTransaction(transactionId);
    const history = await this.fabricIntegration.getTransactionHistory(transactionId);
    const workflow = await this.eventIntegration.trackTransactionWorkflow(transactionId);
    const evidenceReport = await this.evidenceManager.generateEvidenceReport(transactionId);
    
    return {
      transaction,
      history,
      workflow,
      evidence: evidenceReport,
      currentState: transaction.state,
      age: Date.now() - transaction.timestamp.getTime(),
      issues: workflow.issues
    };
  }

  // Emergency stop operations
  public async triggerEmergencyStop(
    triggeredBy: string,
    reason: string,
    transactionIds?: string[]
  ): Promise<void> {
    return this.emergencyStop.triggerEmergencyStop(triggeredBy, reason, transactionIds);
  }
  
  public async resumeEmergencyStop(
    stopId: string,
    approvedBy: string,
    transactionIds?: string[]
  ): Promise<void> {
    return this.emergencyStop.resumeTransactions(stopId, approvedBy, transactionIds);
  }
  
  // Compensation operations
  public async approveCompensation(
    transactionId: string,
    approvedBy: string
  ): Promise<void> {
    return this.compensationEngine.approveCompensation(transactionId, approvedBy);
  }
  
  public async rejectCompensation(
    transactionId: string,
    rejectedBy: string,
    reason: string
  ): Promise<void> {
    return this.compensationEngine.rejectCompensation(transactionId, rejectedBy, reason);
  }
  
  // Performance analytics
  public async getPerformanceReport(
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    return this.performanceAnalytics.generateReport(startDate, endDate);
  }
  
  public async getPartyMetrics(partyId: string): Promise<any> {
    return this.performanceAnalytics.getPartyMetrics(partyId);
  }
  
  // Cleanup
  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }
    
    try {
      // Stop analytics collection
      this.performanceAnalytics.stopMetricsCollection();
      
      // Disconnect from Fabric
      await this.fabricIntegration.disconnect();
      
      // Clean up timers and listeners
      this.removeAllListeners();
      
      this.isInitialized = false;
      this.emit('shutdown');
      
      console.log('2-Check Consensus Orchestrator shut down successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
      throw error;
    }
  }
}