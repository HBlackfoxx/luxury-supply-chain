// consensus/2check/core/trust/trust-scoring-system.ts
// Manages trust scores for all participants

import { EventEmitter } from 'events';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface TrustScore {
  participantId: string;
  score: number;
  level: TrustLevel;
  lastUpdated: Date;
  history: TrustEvent[];
  statistics: TrustStatistics;
}

export interface TrustLevel {
  name: string;
  minScore: number;
  maxScore: number;
  color: string;
  benefits: string[];
}

export interface TrustEvent {
  timestamp: Date;
  action: string;
  points: number;
  description: string;
  transactionId?: string;
}

export interface TrustStatistics {
  totalTransactions: number;
  successfulTransactions: number;
  disputes: number;
  disputesWon: number;
  disputesLost: number;
  averageConfirmationTime: number;
  lastActivityDate: Date;
}

export interface TrustUpdate {
  participant: string;
  action: string;
  value?: number;
  transactionId?: string;
}

export class TrustScoringSystem extends EventEmitter {
  private config: any;
  private scores: Map<string, TrustScore> = new Map();
  private decayCheckInterval: NodeJS.Timeout | null = null;

  constructor(configPath?: string) {
    super();
    this.loadConfig(configPath);
    this.startDecayMonitoring();
  }

  private loadConfig(configPath?: string) {
    const defaultPath = path.join(__dirname, '../../config/trust-scoring.yaml');
    const configFile = configPath || defaultPath;
    
    const configContent = fs.readFileSync(configFile, 'utf8');
    this.config = yaml.load(configContent) as any;
  }

  /**
   * Get or create trust score for participant
   */
  public getTrustScore(participantId: string): TrustScore {
    if (!this.scores.has(participantId)) {
      this.initializeTrustScore(participantId);
    }
    return this.scores.get(participantId)!;
  }

  /**
   * Initialize trust score for new participant
   */
  private initializeTrustScore(participantId: string): void {
    const initialScore = this.config.trust_scoring.initial_score;
    const level = this.calculateTrustLevel(initialScore);

    const trustScore: TrustScore = {
      participantId,
      score: initialScore,
      level,
      lastUpdated: new Date(),
      history: [{
        timestamp: new Date(),
        action: 'account_created',
        points: initialScore,
        description: 'Initial trust score assigned'
      }],
      statistics: {
        totalTransactions: 0,
        successfulTransactions: 0,
        disputes: 0,
        disputesWon: 0,
        disputesLost: 0,
        averageConfirmationTime: 0,
        lastActivityDate: new Date()
      }
    };

    this.scores.set(participantId, trustScore);
    this.emit('trust:initialized', trustScore);
  }

  /**
   * Update trust score based on action
   */
  public async updateTrustScore(update: TrustUpdate): Promise<TrustScore> {
    const trustScore = this.getTrustScore(update.participant);
    const oldScore = trustScore.score;
    const oldLevel = trustScore.level.name;

    // Calculate points change
    const points = this.calculatePoints(update);
    
    // Apply transaction value multiplier if applicable
    const multiplier = this.getValueMultiplier(update.value);
    const adjustedPoints = points * multiplier;

    // Update score
    trustScore.score += adjustedPoints;
    trustScore.score = Math.max(
      this.config.trust_scoring.min_score,
      Math.min(this.config.trust_scoring.max_score, trustScore.score)
    );

    // Update level
    trustScore.level = this.calculateTrustLevel(trustScore.score);
    trustScore.lastUpdated = new Date();

    // Add to history
    trustScore.history.push({
      timestamp: new Date(),
      action: update.action,
      points: adjustedPoints,
      description: this.getActionDescription(update.action),
      transactionId: update.transactionId
    });

    // Update statistics
    this.updateStatistics(trustScore, update);

    // Check for level change
    if (oldLevel !== trustScore.level.name) {
      this.emit('trust:level_changed', {
        participant: update.participant,
        oldLevel,
        newLevel: trustScore.level.name,
        oldScore,
        newScore: trustScore.score
      });
    }

    this.emit('trust:updated', {
      trustScore,
      update,
      pointsChange: adjustedPoints
    });

    return trustScore;
  }

  /**
   * Calculate points for an action
   */
  private calculatePoints(update: TrustUpdate): number {
    const scoreChanges = this.config.trust_scoring.score_changes;
    
    // Check positive actions
    const positiveAction = scoreChanges.positive[update.action];
    if (positiveAction) {
      let points = positiveAction.base_points;
      
      // Apply multipliers if any
      if (positiveAction.multiplier) {
        // Simple multiplier logic - would be more complex in production
        points *= positiveAction.multiplier[0]?.value || 1;
      }
      
      return points;
    }

    // Check negative actions
    const negativeAction = scoreChanges.negative[update.action];
    if (negativeAction) {
      let points = negativeAction.base_points;
      
      // Apply multipliers if any
      if (negativeAction.multiplier) {
        points *= negativeAction.multiplier[0]?.value || 1;
      }
      
      return points;
    }

    return 0;
  }

  /**
   * Get value-based multiplier
   */
  private getValueMultiplier(value?: number): number {
    if (!value) return 1.0;

    const multipliers = this.config.trust_scoring.transaction_value_multipliers;
    
    for (const range of multipliers) {
      if (value >= range.min_value && 
          (range.max_value === null || value <= range.max_value)) {
        return range.multiplier;
      }
    }

    return 1.0;
  }

  /**
   * Calculate trust level from score
   */
  private calculateTrustLevel(score: number): TrustLevel {
    const levels = this.config.trust_scoring.trust_levels;
    
    for (const level of levels) {
      if (score >= level.min_score && score <= level.max_score) {
        return level;
      }
    }

    // Default to lowest level
    return levels[0];
  }

  /**
   * Get action description
   */
  private getActionDescription(action: string): string {
    const descriptions: Record<string, string> = {
      successful_transaction: 'Completed transaction successfully',
      on_time_confirmation: 'Confirmed transaction on time',
      dispute_won: 'Dispute resolved in your favor',
      dispute_lost: 'Dispute resolved against you',
      false_claim: 'Made a false or invalid claim',
      timeout_caused: 'Failed to confirm transaction in time',
      emergency_stop_justified: 'Used emergency stop appropriately',
      emergency_stop_unjustified: 'Misused emergency stop feature'
    };

    return descriptions[action] || action;
  }

  /**
   * Update participant statistics
   */
  private updateStatistics(trustScore: TrustScore, update: TrustUpdate): void {
    const stats = trustScore.statistics;
    stats.lastActivityDate = new Date();

    switch (update.action) {
      case 'successful_transaction':
        stats.totalTransactions++;
        stats.successfulTransactions++;
        break;
        
      case 'dispute_created':
        stats.disputes++;
        break;
        
      case 'dispute_won':
        stats.disputesWon++;
        break;
        
      case 'dispute_lost':
        stats.disputesLost++;
        break;
    }
  }

  /**
   * Check if participant qualifies for benefits
   */
  public checkBenefits(participantId: string): string[] {
    const trustScore = this.getTrustScore(participantId);
    return trustScore.level.benefits;
  }

  /**
   * Check if participant can perform action
   */
  public canPerformAction(participantId: string, action: string): boolean {
    const trustScore = this.getTrustScore(participantId);
    const benefits = trustScore.level.benefits;

    const actionBenefitMap: Record<string, string> = {
      'batch_operations': 'batch_operations_allowed',
      'auto_approval': 'transactions_auto_approved',
      'extended_timeout': 'extended_timeouts',
      'api_access': 'api_access_granted'
    };

    const requiredBenefit = actionBenefitMap[action];
    return requiredBenefit ? benefits.includes(requiredBenefit) : false;
  }

  /**
   * Get automation rules for participant
   */
  public getAutomationRules(participantId: string): any[] {
    const trustScore = this.getTrustScore(participantId);
    const rules = this.config.trust_scoring.automation_rules;

    return rules.filter((rule: any) => 
      trustScore.score >= rule.condition.trust_score
    );
  }

  /**
   * Start trust score decay monitoring
   */
  private startDecayMonitoring(): void {
    if (!this.config.trust_scoring.decay.enabled) return;

    const checkInterval = this.config.trust_scoring.decay.check_interval * 24 * 60 * 60 * 1000; // days to ms
    
    this.decayCheckInterval = setInterval(() => {
      this.applyDecay();
    }, checkInterval);
  }

  /**
   * Apply trust score decay for inactive participants
   */
  private applyDecay(): void {
    const now = new Date();
    const inactivityThreshold = this.config.trust_scoring.decay.inactivity_threshold * 24 * 60 * 60 * 1000;
    const decayRate = this.config.trust_scoring.decay.decay_rate;
    const minScore = this.config.trust_scoring.decay.min_score_after_decay;

    for (const [participantId, trustScore] of this.scores) {
      const inactiveDuration = now.getTime() - trustScore.statistics.lastActivityDate.getTime();
      
      if (inactiveDuration > inactivityThreshold) {
        const oldScore = trustScore.score;
        trustScore.score = Math.max(minScore, trustScore.score * decayRate);
        trustScore.level = this.calculateTrustLevel(trustScore.score);
        trustScore.lastUpdated = now;

        trustScore.history.push({
          timestamp: now,
          action: 'inactivity_decay',
          points: trustScore.score - oldScore,
          description: 'Trust score reduced due to inactivity'
        });

        this.emit('trust:decay_applied', {
          participantId,
          oldScore,
          newScore: trustScore.score,
          inactiveDays: Math.floor(inactiveDuration / (24 * 60 * 60 * 1000))
        });
      }
    }
  }

  /**
   * Check for recovery bonuses
   */
  public async checkRecoveryBonus(participantId: string): Promise<void> {
    const trustScore = this.getTrustScore(participantId);
    const recovery = this.config.trust_scoring.recovery;

    // Clean record recovery
    if (recovery.dispute_recovery.enabled) {
      const recentDisputes = trustScore.history
        .filter(h => h.action === 'dispute_lost' || h.action === 'false_claim')
        .filter(h => h.timestamp > new Date(Date.now() - recovery.dispute_recovery.clean_record_period * 24 * 60 * 60 * 1000));

      if (recentDisputes.length === 0 && trustScore.statistics.disputes > 0) {
        await this.updateTrustScore({
          participant: participantId,
          action: 'clean_record_bonus',
          value: recovery.dispute_recovery.bonus_points
        });
      }
    }

    // Volume recovery
    if (recovery.volume_recovery.enabled) {
      const recentSuccessful = trustScore.history
        .filter(h => h.action === 'successful_transaction')
        .filter(h => h.timestamp > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .length;

      if (recentSuccessful >= recovery.volume_recovery.threshold) {
        await this.updateTrustScore({
          participant: participantId,
          action: 'volume_bonus',
          value: recovery.volume_recovery.bonus_points
        });
      }
    }
  }

  /**
   * Get trust score history
   */
  public getTrustHistory(
    participantId: string,
    limit?: number,
    startDate?: Date,
    endDate?: Date
  ): TrustEvent[] {
    const trustScore = this.getTrustScore(participantId);
    let history = trustScore.history;

    if (startDate) {
      history = history.filter(h => h.timestamp >= startDate);
    }
    if (endDate) {
      history = history.filter(h => h.timestamp <= endDate);
    }
    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Get trust leaderboard
   */
  public getLeaderboard(limit: number = 10): Array<{
    participantId: string;
    score: number;
    level: string;
    rank: number;
  }> {
    const sorted = Array.from(this.scores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map((entry, index) => ({
        participantId: entry[0],
        score: entry[1].score,
        level: entry[1].level.name,
        rank: index + 1
      }));

    return sorted;
  }

  /**
   * Export trust data for analysis
   */
  public exportTrustData(): any {
    const data = {
      timestamp: new Date(),
      totalParticipants: this.scores.size,
      averageScore: 0,
      levelDistribution: {} as Record<string, number>,
      topPerformers: this.getLeaderboard(20),
      statistics: {
        totalTransactions: 0,
        totalDisputes: 0,
        averageDisputeRate: 0
      }
    };

    let totalScore = 0;
    for (const [_, trustScore] of this.scores) {
      totalScore += trustScore.score;
      data.levelDistribution[trustScore.level.name] = 
        (data.levelDistribution[trustScore.level.name] || 0) + 1;
      data.statistics.totalTransactions += trustScore.statistics.totalTransactions;
      data.statistics.totalDisputes += trustScore.statistics.disputes;
    }

    data.averageScore = totalScore / this.scores.size;
    data.statistics.averageDisputeRate = 
      data.statistics.totalDisputes / data.statistics.totalTransactions;

    return data;
  }

  /**
   * Stop decay monitoring
   */
  public stopDecayMonitoring(): void {
    if (this.decayCheckInterval) {
      clearInterval(this.decayCheckInterval);
      this.decayCheckInterval = null;
    }
  }

  /**
   * Get score for a participant (simplified method name)
   */
  public async getScore(participantId: string): Promise<number> {
    const trustScore = this.getTrustScore(participantId);
    return trustScore.score;
  }

  /**
   * Update score for a participant (simplified method)
   */
  public async updateScore(participantId: string, change: number, reason: string): Promise<void> {
    await this.updateTrustScore({
      participant: participantId,
      action: reason,
      value: Math.abs(change)
    });
  }

  /**
   * Sync score from external source
   */
  public async syncScore(participantId: string, newScore: number): Promise<void> {
    const trustScore = this.getTrustScore(participantId);
    trustScore.score = newScore;
    trustScore.level = this.calculateTrustLevel(newScore);
    trustScore.lastUpdated = new Date();
    
    this.emit('trust:synced', {
      participantId,
      score: newScore
    });
  }

  /**
   * Get flagged parties
   */
  public async getFlaggedParties(): Promise<string[]> {
    const flaggedThreshold = 30; // Low trust threshold
    const flagged: string[] = [];
    
    for (const [participantId, trustScore] of this.scores) {
      if (trustScore.score < flaggedThreshold) {
        flagged.push(participantId);
      }
    }
    
    return flagged;
  }

  /**
   * Flag a party for specific reason
   */
  public async flagParty(participantId: string, reason: string): Promise<void> {
    const trustScore = this.getTrustScore(participantId);
    
    trustScore.history.push({
      timestamp: new Date(),
      action: 'flagged',
      points: 0,
      description: `Flagged: ${reason}`
    });
    
    this.emit('party:flagged', {
      participantId,
      reason,
      currentScore: trustScore.score
    });
  }
}