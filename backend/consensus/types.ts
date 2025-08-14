// consensus/types.ts
// Type definitions for consensus module

export interface Transaction {
  id: string;
  sender: string;
  receiver: string;
  itemId: string;
  value: number;
  state: TransactionStatus;
  createdAt: Date;
  updatedAt?: Date;
}

export enum TransactionStatus {
  INITIATED = 'INITIATED',
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  VALIDATED = 'VALIDATED',
  DISPUTED = 'DISPUTED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED'
}

export interface ConsensusConfig {
  timeout: number;
  minParticipants: number;
  maxRetries: number;
}

export interface ConsensusMetrics {
  totalTransactions: number;
  pendingTransactions: number;
  validatedTransactions: number;
  disputedTransactions: number;
  averageConfirmationTime: number;
}

export interface PartyMetrics {
  partyId: string;
  transactionCount: number;
  successRate: number;
  averageResponseTime: number;
  trustScore: number;
}