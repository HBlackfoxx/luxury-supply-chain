// State mapping utilities for converting between TypeScript and Go chaincode states

import { TransactionState } from '../core/state/state-manager';

// Map TypeScript states to Go chaincode states
export const tsToGoStateMap: Record<TransactionState, string> = {
  [TransactionState.INITIATED]: 'INITIATED',
  [TransactionState.CREATED]: 'INITIATED', // TypeScript CREATED maps to Go INITIATED
  [TransactionState.SENT]: 'SENT',
  [TransactionState.RECEIVED]: 'RECEIVED',
  [TransactionState.VALIDATED]: 'VALIDATED',
  [TransactionState.DISPUTED]: 'DISPUTED',
  [TransactionState.TIMEOUT]: 'TIMEOUT',
  [TransactionState.ESCALATED]: 'ESCALATED',
  [TransactionState.RESOLVED]: 'RESOLVED',
  [TransactionState.CANCELLED]: 'CANCELLED'
};

// Map Go chaincode states to TypeScript states
export const goToTsStateMap: Record<string, TransactionState> = {
  'INITIATED': TransactionState.CREATED,
  'SENT': TransactionState.SENT,
  'RECEIVED': TransactionState.RECEIVED,
  'VALIDATED': TransactionState.VALIDATED,
  'DISPUTED': TransactionState.DISPUTED,
  'TIMEOUT': TransactionState.TIMEOUT,
  'ESCALATED': TransactionState.ESCALATED,
  'RESOLVED': TransactionState.RESOLVED,
  'CANCELLED': TransactionState.CANCELLED
};

// Convert TypeScript state to Go state
export function mapTsStateToGo(tsState: TransactionState): string {
  return tsToGoStateMap[tsState] || tsState;
}

// Convert Go state to TypeScript state
export function mapGoStateToTs(goState: string): TransactionState {
  return goToTsStateMap[goState] || TransactionState.INITIATED;
}

// Trust score conversion utilities
export interface TrustScoreConversion {
  // Convert TypeScript score (0-200) to Go score (0-1)
  tsToGo(tsScore: number): number;
  // Convert Go score (0-1) to TypeScript score (0-200)
  goToTs(goScore: number): number;
}

export const trustScoreConverter: TrustScoreConversion = {
  tsToGo(tsScore: number): number {
    // TypeScript uses 0-200, Go uses 0-1
    // Clamp to valid range and convert
    const clamped = Math.max(0, Math.min(200, tsScore));
    return clamped / 200;
  },
  
  goToTs(goScore: number): number {
    // Go uses 0-1, TypeScript uses 0-200
    // Clamp to valid range and convert
    const clamped = Math.max(0, Math.min(1, goScore));
    return Math.round(clamped * 200);
  }
};

// Time conversion utilities
export interface TimeConversion {
  // Convert hours to seconds
  hoursToSeconds(hours: number): number;
  // Convert seconds to hours
  secondsToHours(seconds: number): number;
  // Convert timeout config from TypeScript (hours) to Go (seconds)
  timeoutConfigToGo(hoursTimeout: number): number;
}

export const timeConverter: TimeConversion = {
  hoursToSeconds(hours: number): number {
    return hours * 3600;
  },
  
  secondsToHours(seconds: number): number {
    return seconds / 3600;
  },
  
  timeoutConfigToGo(hoursTimeout: number): number {
    // TypeScript config uses hours, Go expects seconds
    return hoursTimeout * 3600;
  }
};

// Evidence type mapping
export const evidenceTypeMap: Record<string, string> = {
  'shipping_document': 'SHIPPING_DOCUMENT',
  'photo_proof': 'PHOTO_PROOF',
  'timestamp_verification': 'TIMESTAMP_VERIFICATION',
  'gps_location': 'GPS_LOCATION',
  'witness_confirmation': 'WITNESS_CONFIRMATION',
  'video_proof': 'VIDEO_PROOF',
  'multi_signature': 'MULTI_SIGNATURE',
  'insurance_confirmation': 'INSURANCE_CONFIRMATION'
};

// Convert evidence type from TypeScript to Go format
export function mapEvidenceType(tsType: string): string {
  return evidenceTypeMap[tsType] || tsType.toUpperCase().replace(/_/g, '_');
}