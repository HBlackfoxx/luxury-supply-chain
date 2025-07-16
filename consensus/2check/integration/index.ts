export { ConsensusOrchestrator, OrchestratorConfig } from './consensus-orchestrator';
export { FabricIntegration, FabricConfig, ConsensusEvent } from './fabric-integration';
export { EventIntegration, EventBus, IntegrationEvent } from './event-integration';

// Re-export core types for convenience
export {
  Transaction,
  TransactionState,
  TransactionParty,
  ConsensusResult,
  ValidationResult
} from '../core/types';