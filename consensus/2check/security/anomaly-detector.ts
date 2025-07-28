// AI Anomaly Detection for 2-Check Consensus
// Detects unusual patterns, fraud, and routing anomalies

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../core/types';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';

export interface AnomalyPattern {
  type: 'routing' | 'timing' | 'value' | 'frequency' | 'relationship';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-1
  description: string;
}

export interface AnomalyDetectionResult {
  hasAnomalies: boolean;
  patterns: AnomalyPattern[];
  riskScore: number; // 0-100
  recommendedAction: 'proceed' | 'review' | 'flag' | 'block';
  reasons: string[];
}

export interface HistoricalData {
  averageTransactionTime: number;
  typicalValue: number;
  commonRoutes: Map<string, number>;
  fraudIncidents: number;
}

export class AnomalyDetector extends EventEmitter {
  private trustSystem: TrustScoringSystem;
  private historicalData: Map<string, HistoricalData>;
  private blacklistedParties: Set<string>;
  private suspiciousPatterns: Map<string, number>;
  
  // Thresholds
  private readonly VALUE_DEVIATION_THRESHOLD = 3; // 3x standard deviation
  private readonly TIME_DEVIATION_THRESHOLD = 2.5;
  private readonly MIN_TRUST_SCORE = 30; // Out of 200
  private readonly VELOCITY_THRESHOLD = 10; // Max transactions per hour
  
  constructor(trustSystem: TrustScoringSystem) {
    super();
    this.trustSystem = trustSystem;
    this.historicalData = new Map();
    this.blacklistedParties = new Set();
    this.suspiciousPatterns = new Map();
    
    this.loadHistoricalData();
  }
  
  /**
   * Analyze transaction for anomalies
   */
  public async analyzeTransaction(transaction: Transaction): Promise<AnomalyDetectionResult> {
    const patterns: AnomalyPattern[] = [];
    
    // Check routing anomalies
    const routingCheck = await this.checkRoutingAnomalies(transaction);
    if (routingCheck) patterns.push(routingCheck);
    
    // Check timing anomalies
    const timingCheck = await this.checkTimingAnomalies(transaction);
    if (timingCheck) patterns.push(timingCheck);
    
    // Check value anomalies
    const valueCheck = await this.checkValueAnomalies(transaction);
    if (valueCheck) patterns.push(valueCheck);
    
    // Check velocity (frequency) anomalies
    const velocityCheck = await this.checkVelocityAnomalies(transaction);
    if (velocityCheck) patterns.push(velocityCheck);
    
    // Check relationship anomalies
    const relationshipCheck = await this.checkRelationshipAnomalies(transaction);
    if (relationshipCheck) patterns.push(relationshipCheck);
    
    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(patterns);
    
    // Determine recommended action
    const recommendedAction = this.determineAction(riskScore, patterns);
    
    const result: AnomalyDetectionResult = {
      hasAnomalies: patterns.length > 0,
      patterns,
      riskScore,
      recommendedAction,
      reasons: patterns.map(p => p.description)
    };
    
    // Emit event if anomalies detected
    if (result.hasAnomalies) {
      this.emit('anomaly_detected', {
        transactionId: transaction.id,
        result
      });
      
      // Log pattern for future detection
      this.updateSuspiciousPatterns(transaction, patterns);
    }
    
    return result;
  }
  
  /**
   * Check for routing anomalies
   */
  private async checkRoutingAnomalies(transaction: Transaction): Promise<AnomalyPattern | null> {
    // Check if parties are blacklisted
    if (this.blacklistedParties.has(transaction.sender) || 
        this.blacklistedParties.has(transaction.receiver)) {
      return {
        type: 'routing',
        severity: 'critical',
        confidence: 1.0,
        description: 'Transaction involves blacklisted party'
      };
    }
    
    // Check for unusual routing patterns
    const route = `${transaction.sender}->${transaction.receiver}`;
    const historical = this.historicalData.get(route);
    
    if (!historical || historical.commonRoutes.get(route) === 0) {
      // New route - could be suspicious
      const senderTrust = await this.trustSystem.getScore(transaction.sender);
      const receiverTrust = await this.trustSystem.getScore(transaction.receiver);
      
      if (senderTrust < this.MIN_TRUST_SCORE || receiverTrust < this.MIN_TRUST_SCORE) {
        return {
          type: 'routing',
          severity: 'high',
          confidence: 0.8,
          description: 'Unusual route with low trust parties'
        };
      }
    }
    
    // Check for circular routing
    if (await this.detectCircularRouting(transaction)) {
      return {
        type: 'routing',
        severity: 'high',
        confidence: 0.9,
        description: 'Potential circular routing detected'
      };
    }
    
    return null;
  }
  
  /**
   * Check for timing anomalies
   */
  private async checkTimingAnomalies(transaction: Transaction): Promise<AnomalyPattern | null> {
    const route = `${transaction.sender}->${transaction.receiver}`;
    const historical = this.historicalData.get(route);
    
    if (!historical) return null;
    
    // Check if transaction is happening at unusual time
    const hour = new Date(transaction.timestamp).getHours();
    const isBusinessHours = hour >= 8 && hour <= 18;
    
    if (!isBusinessHours && transaction.value > 10000) {
      return {
        type: 'timing',
        severity: 'medium',
        confidence: 0.7,
        description: 'High-value transaction outside business hours'
      };
    }
    
    // Check for rush patterns (too many transactions too quickly)
    const recentTransactions = await this.getRecentTransactionCount(transaction.sender, 60); // Last hour
    if (recentTransactions > this.VELOCITY_THRESHOLD) {
      return {
        type: 'timing',
        severity: 'high',
        confidence: 0.85,
        description: 'Unusual transaction velocity detected'
      };
    }
    
    return null;
  }
  
  /**
   * Check for value anomalies
   */
  private async checkValueAnomalies(transaction: Transaction): Promise<AnomalyPattern | null> {
    const route = `${transaction.sender}->${transaction.receiver}`;
    const historical = this.historicalData.get(route);
    
    if (!historical) return null;
    
    // Check if value deviates significantly from typical
    const deviation = Math.abs(transaction.value - historical.typicalValue) / historical.typicalValue;
    
    if (deviation > this.VALUE_DEVIATION_THRESHOLD) {
      return {
        type: 'value',
        severity: 'high',
        confidence: 0.9,
        description: `Transaction value deviates ${(deviation * 100).toFixed(0)}% from typical`
      };
    }
    
    // Check for round number patterns (potential money laundering)
    if (this.isRoundNumber(transaction.value) && transaction.value > 50000) {
      return {
        type: 'value',
        severity: 'medium',
        confidence: 0.6,
        description: 'Large round number transaction'
      };
    }
    
    // Check for smurfing (breaking large amounts into smaller ones)
    if (await this.detectSmurfing(transaction)) {
      return {
        type: 'value',
        severity: 'critical',
        confidence: 0.95,
        description: 'Potential smurfing pattern detected'
      };
    }
    
    return null;
  }
  
  /**
   * Check for velocity/frequency anomalies
   */
  private async checkVelocityAnomalies(transaction: Transaction): Promise<AnomalyPattern | null> {
    // Check transaction frequency between parties
    const recentCount = await this.getTransactionCountBetweenParties(
      transaction.sender,
      transaction.receiver,
      24 // Last 24 hours
    );
    
    if (recentCount > 20) {
      return {
        type: 'frequency',
        severity: 'high',
        confidence: 0.8,
        description: `${recentCount} transactions in 24 hours between same parties`
      };
    }
    
    // Check for burst patterns
    const hourlyPattern = await this.getHourlyTransactionPattern(transaction.sender);
    if (this.detectBurstPattern(hourlyPattern)) {
      return {
        type: 'frequency',
        severity: 'medium',
        confidence: 0.75,
        description: 'Burst transaction pattern detected'
      };
    }
    
    return null;
  }
  
  /**
   * Check for relationship anomalies
   */
  private async checkRelationshipAnomalies(transaction: Transaction): Promise<AnomalyPattern | null> {
    // Check for new relationship with high value
    const hasHistory = await this.hasTransactionHistory(transaction.sender, transaction.receiver);
    
    if (!hasHistory && transaction.value > 25000) {
      return {
        type: 'relationship',
        severity: 'medium',
        confidence: 0.7,
        description: 'High-value transaction with no prior relationship'
      };
    }
    
    // Check trust score mismatch
    const senderTrust = await this.trustSystem.getScore(transaction.sender);
    const receiverTrust = await this.trustSystem.getScore(transaction.receiver);
    const trustGap = Math.abs(senderTrust - receiverTrust);
    
    if (trustGap > 100) { // Large trust score gap
      return {
        type: 'relationship',
        severity: 'medium',
        confidence: 0.65,
        description: 'Large trust score disparity between parties'
      };
    }
    
    return null;
  }
  
  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(patterns: AnomalyPattern[]): number {
    if (patterns.length === 0) return 0;
    
    let score = 0;
    const weights = {
      low: 10,
      medium: 25,
      high: 50,
      critical: 100
    };
    
    for (const pattern of patterns) {
      const baseScore = weights[pattern.severity];
      const adjustedScore = baseScore * pattern.confidence;
      score += adjustedScore;
    }
    
    // Normalize to 0-100
    return Math.min(100, score);
  }
  
  /**
   * Determine recommended action based on risk
   */
  private determineAction(
    riskScore: number,
    patterns: AnomalyPattern[]
  ): 'proceed' | 'review' | 'flag' | 'block' {
    // Check for critical patterns
    const hasCritical = patterns.some(p => p.severity === 'critical');
    if (hasCritical) return 'block';
    
    // Check risk score thresholds
    if (riskScore >= 80) return 'block';
    if (riskScore >= 50) return 'flag';
    if (riskScore >= 25) return 'review';
    
    return 'proceed';
  }
  
  /**
   * Fraud detection methods
   */
  public async detectFraudPattern(transactions: Transaction[]): Promise<boolean> {
    // Implement ML-based fraud detection
    // For POC, using rule-based detection
    
    // Pattern 1: Rapid fire transactions
    const timestamps = transactions.map(t => t.timestamp.getTime());
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i-1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval < 60000) return true; // Less than 1 minute average
    
    // Pattern 2: Value laddering
    const values = transactions.map(t => t.value);
    const isLaddering = this.detectValueLaddering(values);
    if (isLaddering) return true;
    
    return false;
  }
  
  /**
   * Emergency stop trigger
   */
  public async shouldTriggerEmergencyStop(
    transaction: Transaction,
    anomalyResult: AnomalyDetectionResult
  ): Promise<boolean> {
    // Trigger conditions
    if (anomalyResult.riskScore >= 90) return true;
    if (anomalyResult.recommendedAction === 'block') return true;
    if (this.blacklistedParties.has(transaction.sender)) return true;
    if (this.blacklistedParties.has(transaction.receiver)) return true;
    
    // Check cumulative risk
    const recentRisk = await this.getCumulativeRisk(transaction.sender, 24);
    if (recentRisk > 200) return true;
    
    return false;
  }
  
  // Helper methods
  private loadHistoricalData(): void {
    // In production, load from database
    // For POC, using mock data
    this.historicalData.set('supplier->manufacturer', {
      averageTransactionTime: 3600000, // 1 hour
      typicalValue: 5000,
      commonRoutes: new Map([['supplier->manufacturer', 100]]),
      fraudIncidents: 0
    });
  }
  
  private async detectCircularRouting(transaction: Transaction): Promise<boolean> {
    // Simplified circular routing detection
    return false; // Implement graph analysis
  }
  
  private async getRecentTransactionCount(party: string, minutes: number): Promise<number> {
    // Query transaction history
    return 0; // Implement database query
  }
  
  private isRoundNumber(value: number): boolean {
    return value % 1000 === 0;
  }
  
  private async detectSmurfing(transaction: Transaction): Promise<boolean> {
    // Detect if large amount is being broken into smaller transactions
    return false; // Implement pattern detection
  }
  
  private async getTransactionCountBetweenParties(
    sender: string,
    receiver: string,
    hours: number
  ): Promise<number> {
    return 0; // Implement database query
  }
  
  private async getHourlyTransactionPattern(party: string): Promise<number[]> {
    return new Array(24).fill(0); // Implement pattern analysis
  }
  
  private detectBurstPattern(hourlyPattern: number[]): boolean {
    // Detect unusual spikes in activity
    const avg = hourlyPattern.reduce((a, b) => a + b, 0) / hourlyPattern.length;
    const maxHour = Math.max(...hourlyPattern);
    return maxHour > avg * 5;
  }
  
  private async hasTransactionHistory(sender: string, receiver: string): Promise<boolean> {
    return true; // Implement history check
  }
  
  private detectValueLaddering(values: number[]): boolean {
    // Detect incremental value increases
    for (let i = 1; i < values.length; i++) {
      if (values[i] <= values[i-1]) return false;
    }
    return values.length > 3;
  }
  
  private updateSuspiciousPatterns(transaction: Transaction, patterns: AnomalyPattern[]): void {
    const key = `${transaction.sender}-${transaction.receiver}`;
    const count = this.suspiciousPatterns.get(key) || 0;
    this.suspiciousPatterns.set(key, count + 1);
  }
  
  private async getCumulativeRisk(party: string, hours: number): Promise<number> {
    return 0; // Implement risk aggregation
  }
  
  /**
   * Add party to blacklist
   */
  public blacklistParty(partyId: string, reason: string): void {
    this.blacklistedParties.add(partyId);
    this.emit('party_blacklisted', { partyId, reason });
  }
  
  /**
   * Machine learning integration point
   */
  public async trainModel(historicalTransactions: Transaction[]): Promise<void> {
    // Integration point for ML model training
    // For POC, we're using rule-based detection
    console.log('Training anomaly detection model with', historicalTransactions.length, 'transactions');
  }
}