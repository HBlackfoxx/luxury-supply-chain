// Performance Analytics System for 2-Check Consensus
// Collects metrics and provides business insights

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../core/types';
import { TransactionStateManager } from '../core/state/state-manager';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';

export interface PerformanceMetrics {
  // Transaction metrics
  totalTransactions: number;
  completedTransactions: number;
  pendingTransactions: number;
  disputedTransactions: number;
  timeoutTransactions: number;
  
  // Time metrics
  averageConfirmationTime: number;
  averageCompletionTime: number;
  fastestTransaction: number;
  slowestTransaction: number;
  
  // Success metrics
  successRate: number;
  disputeRate: number;
  timeoutRate: number;
  autoApprovalRate: number;
  
  // Trust metrics
  averageTrustScore: number;
  trustScoreDistribution: Map<string, number>;
  
  // Value metrics
  totalTransactionValue: number;
  averageTransactionValue: number;
  highestTransactionValue: number;
}

export interface PartyMetrics {
  partyId: string;
  transactionCount: number;
  successRate: number;
  averageTime: number;
  trustScore: number;
  totalValue: number;
  disputeCount: number;
  relationships: number;
}

export interface RouteMetrics {
  route: string;
  transactionCount: number;
  averageTime: number;
  successRate: number;
  totalValue: number;
  commonIssues: string[];
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  metric: string;
}

export class PerformanceAnalytics extends EventEmitter {
  private stateManager: TransactionStateManager;
  private trustSystem: TrustScoringSystem;
  private metricsCache: Map<string, any>;
  private timeSeriesData: TimeSeriesData[];
  private updateInterval: NodeJS.Timeout | null = null;
  
  constructor(
    stateManager: TransactionStateManager,
    trustSystem: TrustScoringSystem
  ) {
    super();
    this.stateManager = stateManager;
    this.trustSystem = trustSystem;
    this.metricsCache = new Map();
    this.timeSeriesData = [];
    
    this.startMetricsCollection();
  }
  
  /**
   * Start collecting metrics periodically
   */
  private startMetricsCollection(): void {
    // Collect metrics every 5 minutes
    this.updateInterval = setInterval(() => {
      this.collectMetrics();
    }, 300000);
    
    // Initial collection
    this.collectMetrics();
  }
  
  /**
   * Stop metrics collection
   */
  public stopMetricsCollection(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<void> {
    const metrics = await this.calculatePerformanceMetrics();
    
    // Store in cache
    this.metricsCache.set('current', metrics);
    
    // Add to time series
    this.addTimeSeriesData('transaction_count', metrics.totalTransactions);
    this.addTimeSeriesData('success_rate', metrics.successRate);
    this.addTimeSeriesData('average_time', metrics.averageConfirmationTime);
    this.addTimeSeriesData('dispute_rate', metrics.disputeRate);
    
    // Emit metrics update
    this.emit('metrics_updated', metrics);
  }
  
  /**
   * Calculate performance metrics
   */
  public async calculatePerformanceMetrics(): Promise<PerformanceMetrics> {
    const allTransactions = this.getAllTransactions();
    const completedTxs = allTransactions.filter(
      tx => tx.state === TransactionState.VALIDATED
    );
    const pendingTxs = allTransactions.filter(
      tx => [TransactionState.INITIATED, TransactionState.CREATED, TransactionState.SENT, TransactionState.RECEIVED].includes(tx.state)
    );
    const disputedTxs = allTransactions.filter(
      tx => tx.state === TransactionState.DISPUTED
    );
    const timeoutTxs = allTransactions.filter(
      tx => tx.state === TransactionState.TIMEOUT
    );
    
    // Calculate time metrics
    const confirmationTimes = this.calculateConfirmationTimes(completedTxs);
    const completionTimes = this.calculateCompletionTimes(completedTxs);
    
    // Calculate trust metrics
    const trustScores = await this.calculateTrustMetrics(allTransactions);
    
    // Calculate value metrics
    const valueMetrics = this.calculateValueMetrics(allTransactions);
    
    return {
      // Transaction counts
      totalTransactions: allTransactions.length,
      completedTransactions: completedTxs.length,
      pendingTransactions: pendingTxs.length,
      disputedTransactions: disputedTxs.length,
      timeoutTransactions: timeoutTxs.length,
      
      // Time metrics
      averageConfirmationTime: this.average(confirmationTimes),
      averageCompletionTime: this.average(completionTimes),
      fastestTransaction: Math.min(...completionTimes) || 0,
      slowestTransaction: Math.max(...completionTimes) || 0,
      
      // Success metrics
      successRate: allTransactions.length > 0 ? completedTxs.length / allTransactions.length : 0,
      disputeRate: allTransactions.length > 0 ? disputedTxs.length / allTransactions.length : 0,
      timeoutRate: allTransactions.length > 0 ? timeoutTxs.length / allTransactions.length : 0,
      autoApprovalRate: this.calculateAutoApprovalRate(completedTxs),
      
      // Trust metrics
      averageTrustScore: trustScores.average,
      trustScoreDistribution: trustScores.distribution,
      
      // Value metrics
      totalTransactionValue: valueMetrics.total,
      averageTransactionValue: valueMetrics.average,
      highestTransactionValue: valueMetrics.highest
    };
  }
  
  /**
   * Get metrics by party
   */
  public async getPartyMetrics(partyId: string): Promise<PartyMetrics> {
    const transactions = this.getTransactionsByParty(partyId);
    const successfulTxs = transactions.filter(
      tx => tx.state === TransactionState.VALIDATED
    );
    const disputedTxs = transactions.filter(
      tx => tx.state === TransactionState.DISPUTED
    );
    
    const trustScore = await this.trustSystem.getScore(partyId);
    const relationships = this.getUniqueRelationships(partyId, transactions);
    
    return {
      partyId,
      transactionCount: transactions.length,
      successRate: transactions.length > 0 ? successfulTxs.length / transactions.length : 0,
      averageTime: this.average(this.calculateCompletionTimes(successfulTxs)),
      trustScore,
      totalValue: transactions.reduce((sum, tx) => sum + tx.value, 0),
      disputeCount: disputedTxs.length,
      relationships: relationships.size
    };
  }
  
  /**
   * Get metrics by route
   */
  public getRouteMetrics(sender: string, receiver: string): RouteMetrics {
    const route = `${sender}->${receiver}`;
    const transactions = this.getTransactionsByRoute(sender, receiver);
    const successfulTxs = transactions.filter(
      tx => tx.state === TransactionState.VALIDATED
    );
    
    const issues = this.analyzeRouteIssues(transactions);
    
    return {
      route,
      transactionCount: transactions.length,
      averageTime: this.average(this.calculateCompletionTimes(successfulTxs)),
      successRate: transactions.length > 0 ? successfulTxs.length / transactions.length : 0,
      totalValue: transactions.reduce((sum, tx) => sum + tx.value, 0),
      commonIssues: issues
    };
  }
  
  /**
   * Get performance insights
   */
  public getInsights(): any {
    const metrics = this.metricsCache.get('current') || {};
    const insights = [];
    
    // Success rate insights
    if (metrics.successRate < 0.9) {
      insights.push({
        type: 'warning',
        category: 'success_rate',
        message: `Success rate is ${(metrics.successRate * 100).toFixed(1)}%, below target of 90%`,
        recommendation: 'Review timeout settings and dispute resolution process'
      });
    }
    
    // Dispute rate insights
    if (metrics.disputeRate > 0.05) {
      insights.push({
        type: 'warning',
        category: 'disputes',
        message: `Dispute rate is ${(metrics.disputeRate * 100).toFixed(1)}%, above threshold of 5%`,
        recommendation: 'Analyze common dispute reasons and improve verification process'
      });
    }
    
    // Time insights
    if (metrics.averageConfirmationTime > 7200000) { // 2 hours
      insights.push({
        type: 'info',
        category: 'performance',
        message: `Average confirmation time is ${(metrics.averageConfirmationTime / 3600000).toFixed(1)} hours`,
        recommendation: 'Consider implementing progressive automation for trusted parties'
      });
    }
    
    // Trust insights
    if (metrics.averageTrustScore < 100) {
      insights.push({
        type: 'info',
        category: 'trust',
        message: `Average trust score is ${metrics.averageTrustScore.toFixed(0)}/200`,
        recommendation: 'Focus on building trust through successful transactions'
      });
    }
    
    return insights;
  }
  
  /**
   * Generate performance report
   */
  public generateReport(startDate: Date, endDate: Date): any {
    const timeSeriesInRange = this.timeSeriesData.filter(
      data => data.timestamp >= startDate && data.timestamp <= endDate
    );
    
    // Group by metric
    const metricGroups = new Map<string, TimeSeriesData[]>();
    for (const data of timeSeriesInRange) {
      const group = metricGroups.get(data.metric) || [];
      group.push(data);
      metricGroups.set(data.metric, group);
    }
    
    // Calculate trends
    const trends = new Map<string, any>();
    for (const [metric, data] of metricGroups) {
      trends.set(metric, this.calculateTrend(data));
    }
    
    // Get current metrics
    const currentMetrics = this.metricsCache.get('current') || {};
    
    return {
      period: {
        start: startDate,
        end: endDate
      },
      summary: currentMetrics,
      trends: Object.fromEntries(trends),
      insights: this.getInsights(),
      topPerformers: this.getTopPerformers(),
      problemAreas: this.getProblemAreas()
    };
  }
  
  /**
   * Get top performing parties
   */
  private async getTopPerformers(): Promise<PartyMetrics[]> {
    // In production, query from database
    // For POC, return mock data
    return [];
  }
  
  /**
   * Identify problem areas
   */
  private getProblemAreas(): any[] {
    const problems: any[] = [];
    const metrics = this.metricsCache.get('current') || {};
    
    // Identify problematic routes
    // In production, analyze actual route data
    
    // Identify parties with high dispute rates
    // In production, analyze party-specific metrics
    
    return problems;
  }
  
  // Helper methods
  private getAllTransactions(): Transaction[] {
    // Get all transactions from state manager
    const states = Object.values(TransactionState);
    const allTxs: Transaction[] = [];
    
    for (const state of states) {
      allTxs.push(...this.stateManager.getTransactionsByState(state));
    }
    
    return allTxs;
  }
  
  private getTransactionsByParty(partyId: string): Transaction[] {
    return this.getAllTransactions().filter(
      tx => tx.sender === partyId || tx.receiver === partyId
    );
  }
  
  private getTransactionsByRoute(sender: string, receiver: string): Transaction[] {
    return this.getAllTransactions().filter(
      tx => tx.sender === sender && tx.receiver === receiver
    );
  }
  
  private calculateConfirmationTimes(transactions: Transaction[]): number[] {
    return transactions
      .filter(tx => tx.senderConfirmed && tx.receiverConfirmed)
      .map(tx => {
        const sent = tx.senderConfirmed!.getTime();
        const received = tx.receiverConfirmed!.getTime();
        return received - sent;
      });
  }
  
  private calculateCompletionTimes(transactions: Transaction[]): number[] {
    return transactions.map(tx => {
      return tx.updated.getTime() - tx.created.getTime();
    });
  }
  
  private async calculateTrustMetrics(transactions: Transaction[]): Promise<any> {
    const parties = new Set<string>();
    transactions.forEach(tx => {
      parties.add(tx.sender);
      parties.add(tx.receiver);
    });
    
    const scores: number[] = [];
    const distribution = new Map<string, number>();
    
    for (const party of parties) {
      const score = await this.trustSystem.getScore(party);
      scores.push(score);
      
      // Categorize
      const category = this.getTrustCategory(score);
      distribution.set(category, (distribution.get(category) || 0) + 1);
    }
    
    return {
      average: this.average(scores),
      distribution
    };
  }
  
  private getTrustCategory(score: number): string {
    if (score >= 150) return 'premium';
    if (score >= 100) return 'trusted';
    if (score >= 50) return 'basic';
    return 'new';
  }
  
  private calculateValueMetrics(transactions: Transaction[]): any {
    const values = transactions.map(tx => tx.value);
    
    return {
      total: values.reduce((sum, val) => sum + val, 0),
      average: this.average(values),
      highest: Math.max(...values) || 0
    };
  }
  
  private calculateAutoApprovalRate(completedTxs: Transaction[]): number {
    const autoApproved = completedTxs.filter(
      tx => tx.metadata?.autoApproved === true
    );
    
    return completedTxs.length > 0 ? autoApproved.length / completedTxs.length : 0;
  }
  
  private getUniqueRelationships(partyId: string, transactions: Transaction[]): Set<string> {
    const relationships = new Set<string>();
    
    for (const tx of transactions) {
      if (tx.sender === partyId) {
        relationships.add(tx.receiver);
      } else if (tx.receiver === partyId) {
        relationships.add(tx.sender);
      }
    }
    
    return relationships;
  }
  
  private analyzeRouteIssues(transactions: Transaction[]): string[] {
    const issues: string[] = [];
    const disputedCount = transactions.filter(tx => tx.state === TransactionState.DISPUTED).length;
    const timeoutCount = transactions.filter(tx => tx.state === TransactionState.TIMEOUT).length;
    
    if (disputedCount > transactions.length * 0.1) {
      issues.push('High dispute rate');
    }
    
    if (timeoutCount > transactions.length * 0.05) {
      issues.push('Frequent timeouts');
    }
    
    return issues;
  }
  
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
  
  private addTimeSeriesData(metric: string, value: number): void {
    this.timeSeriesData.push({
      timestamp: new Date(),
      value,
      metric
    });
    
    // Keep only last 7 days of data
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.timeSeriesData = this.timeSeriesData.filter(
      data => data.timestamp >= cutoff
    );
  }
  
  private calculateTrend(data: TimeSeriesData[]): any {
    if (data.length < 2) return { direction: 'stable', change: 0 };
    
    const recent = data.slice(-10); // Last 10 data points
    const firstValue = recent[0].value;
    const lastValue = recent[recent.length - 1].value;
    const change = ((lastValue - firstValue) / firstValue) * 100;
    
    return {
      direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
      change: change.toFixed(1),
      current: lastValue,
      previous: firstValue
    };
  }
  
  /**
   * API endpoints for analytics
   */
  public getAPIEndpoints(): any {
    return {
      metrics: {
        method: 'GET',
        path: '/api/analytics/metrics',
        description: 'Get current performance metrics'
      },
      party: {
        method: 'GET',
        path: '/api/analytics/party/:partyId',
        description: 'Get metrics for specific party'
      },
      route: {
        method: 'GET',
        path: '/api/analytics/route/:sender/:receiver',
        description: 'Get metrics for specific route'
      },
      insights: {
        method: 'GET',
        path: '/api/analytics/insights',
        description: 'Get performance insights and recommendations'
      },
      report: {
        method: 'POST',
        path: '/api/analytics/report',
        params: ['startDate', 'endDate'],
        description: 'Generate performance report for date range'
      }
    };
  }
}