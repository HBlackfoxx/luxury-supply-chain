// Core exports
export * from './core/types';
export { TransactionStateManager, StateManager } from './core/state/state-manager';
export { ValidationEngine } from './core/validation/validation-engine';
export { TimeoutHandler } from './core/timeout/timeout-handler';
export { TrustScoringSystem } from './core/trust/trust-scoring-system';

// Exception handling exports
export { DisputeResolution } from './exceptions/disputes/dispute-resolution';
export { EscalationHandler } from './exceptions/escalation/escalation-handler';
export { EvidenceManager, Evidence, EvidenceType } from './exceptions/evidence/evidence-manager';

// Service exports
export { NotificationService, NotificationOptions, NotificationResult } from './services/notification-service';

// Integration exports
export { ConsensusOrchestrator, OrchestratorConfig } from './integration/consensus-orchestrator';
export { FabricIntegration, FabricConfig } from './integration/fabric-integration';
export { EventIntegration, IntegrationEvent } from './integration/event-integration';

// Version
export const VERSION = '1.0.0';