// consensus/2check/core/types.ts
// Shared types for the 2-Check consensus system

export { 
  Transaction, 
  TransactionState, 
  StateTransition 
} from './state/state-manager';

export interface TransactionParty {
  id: string;
  name: string;
  role: 'sender' | 'receiver' | 'observer';
  trustScore?: number;
}

export interface ConsensusResult {
  consensus: boolean;
  timestamp: Date;
  validators: string[];
  confidence: number;
  reason?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  metadata?: any;
  reason?: string;
  requiredActions?: string[];
  confidence?: number;
}

export interface ConsensusConfig {
  timeoutMinutes: number;
  requireBothParties: boolean;
  autoValidateOnConfirmation: boolean;
  trustThresholdForAutoApproval: number;
}