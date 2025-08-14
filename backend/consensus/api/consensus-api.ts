// backend/consensus/api/consensus-api.ts
// REST API endpoints for 2-Check consensus system

import express, { Router, Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { ConsensusSystem } from '../setup-consensus';
import { TransactionState, Transaction } from '../2check/core/state/state-manager';
import { DisputeType } from '../2check/exceptions/disputes/dispute-resolution';

export interface ApiRequest extends Request {
  consensusSystem?: ConsensusSystem;
  user?: {
    id: string;
    orgId: string;
    role: string;
  };
}

export class ConsensusAPI extends EventEmitter {
  private router: Router;
  private consensusSystem: ConsensusSystem;

  constructor(consensusSystem: ConsensusSystem) {
    super();
    this.router = express.Router();
    this.consensusSystem = consensusSystem;
    this.setupRoutes();
  }

  /**
   * Get Express router
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all routes
   */
  private setupRoutes(): void {
    // Middleware
    this.router.use(this.authMiddleware.bind(this));
    this.router.use(this.consensusMiddleware.bind(this));

    // Transaction routes
    this.router.get('/transactions', this.getTransactions.bind(this));
    this.router.post('/transactions', this.createTransaction.bind(this));
    this.router.get('/transactions/:id', this.getTransaction.bind(this));
    this.router.post('/transactions/:id/confirm-sent', this.confirmSent.bind(this));
    this.router.post('/transactions/:id/confirm-received', this.confirmReceived.bind(this));
    this.router.get('/transactions/pending/:participantId', this.getPendingTransactions.bind(this));
    this.router.get('/transactions/history/:organizationId', this.getTransactionHistory.bind(this));

    // Dispute routes
    this.router.post('/transactions/:id/dispute', this.createDispute.bind(this));
    this.router.get('/disputes/:id', this.getDispute.bind(this));
    this.router.post('/disputes/:id/evidence', this.addEvidence.bind(this));
    this.router.post('/disputes/:id/resolve', this.resolveDispute.bind(this));
    this.router.get('/disputes/open/:participantId', this.getOpenDisputes.bind(this));

    // Trust score routes
    this.router.get('/trust/:participantId', this.getTrustScore.bind(this));
    this.router.get('/trust/:participantId/history', this.getTrustHistory.bind(this));
    this.router.get('/trust/leaderboard', this.getTrustLeaderboard.bind(this));
    this.router.get('/trust/:participantId/benefits', this.getTrustBenefits.bind(this));

    // Batch operations
    this.router.post('/transactions/batch', this.createBatchTransactions.bind(this));

    // Statistics and monitoring
    this.router.get('/statistics', this.getStatistics.bind(this));
    this.router.get('/health', this.healthCheck.bind(this));
    
    // Emergency stop routes
    this.router.post('/emergency/stop', this.triggerEmergencyStop.bind(this));
    this.router.post('/emergency/resume', this.resumeEmergencyStop.bind(this));
    this.router.get('/emergency/status', this.getEmergencyStatus.bind(this));
    
    // Compensation routes
    this.router.post('/compensation/approve/:transactionId', this.approveCompensation.bind(this));
    this.router.post('/compensation/reject/:transactionId', this.rejectCompensation.bind(this));
    this.router.get('/compensation/pending', this.getPendingCompensations.bind(this));
    
    // Analytics routes
    this.router.post('/analytics/report', this.getPerformanceReport.bind(this));
    this.router.get('/analytics/party/:partyId', this.getPartyAnalytics.bind(this));
    this.router.get('/analytics/insights', this.getInsights.bind(this));
    
    // Metrics endpoint
    this.router.get('/metrics', this.getConsensusMetrics.bind(this));
    
    // Anomaly routes
    this.router.get('/anomalies/active', this.getActiveAnomalies.bind(this));
  }

  /**
   * Auth middleware
   */
  private authMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      // In production, verify JWT properly with the auth service
      // For now, we'll trust the headers if token is present
      const orgId = req.headers['x-org-id'] as string;
      const userId = req.headers['x-user-id'] as string;
      const role = req.headers['x-user-role'] as string;

      if (!orgId || !userId) {
        res.status(401).json({ error: 'Invalid authentication headers' });
        return;
      }

      req.user = {
        id: userId,
        orgId: orgId,
        role: role || 'user'
      };

      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  }

  /**
   * Consensus system middleware
   */
  private consensusMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
    req.consensusSystem = this.consensusSystem;
    next();
  }

  /**
   * Create a new transaction
   */
  private async createTransaction(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { receiver, itemId, value, metadata } = req.body;
      
      if (!receiver || !itemId || value === undefined) {
        res.status(400).json({ 
          error: 'Missing required fields: receiver, itemId, value' 
        });
        return;
      }

      const transactionId = await req.consensusSystem!.createB2BTransaction({
        sender: req.user!.orgId,
        receiver,
        itemId,
        value,
        metadata
      });

      res.status(201).json({
        success: true,
        transactionId,
        message: 'Transaction created. Please confirm sending.'
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to create transaction',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get transactions with filters
   */
  private async getTransactions(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { type, status } = req.query;
      const participantId = req.user!.orgId;
      
      // Get state manager to access transactions
      const stateManager = this.consensusSystem.getStateManager();
      const allTransactions = Array.from(stateManager.getTransactions().values()) as Transaction[];
      
      // Filter transactions where user is either sender or receiver
      let filtered = allTransactions.filter(tx => 
        tx.sender === participantId || tx.receiver === participantId
      );
      
      // Apply type filter
      if (type === 'SENT') {
        filtered = filtered.filter(tx => tx.sender === participantId);
      } else if (type === 'RECEIVED') {
        filtered = filtered.filter(tx => tx.receiver === participantId);
      }
      
      // Apply status filter
      if (status && status !== 'all') {
        filtered = filtered.filter(tx => tx.state === status);
      }
      
      // Sort by creation date (newest first)
      filtered.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      
      // Map to frontend format
      const transactions = filtered.map(tx => ({
        id: tx.id,
        type: tx.sender === participantId ? 'SENT' : 'RECEIVED',
        itemId: tx.itemId,
        itemDescription: tx.metadata?.description || `Item ${tx.itemId}`,
        partner: tx.sender === participantId ? tx.receiver : tx.sender,
        value: tx.value,
        status: tx.state,
        createdAt: tx.created instanceof Date ? tx.created.toISOString() : tx.created,
        validatedAt: tx.state === 'VALIDATED' && tx.receiverConfirmed 
          ? (tx.receiverConfirmed instanceof Date ? tx.receiverConfirmed.toISOString() : tx.receiverConfirmed)
          : undefined
      }));
      
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get transactions',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get transaction details
   */
  private async getTransaction(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const report = await req.consensusSystem!.getTransactionReport(id);
      
      res.json({
        id,
        ...report.transaction,
        timeoutIn: report.transaction.timeoutAt ? 
          Math.floor((new Date(report.transaction.timeoutAt).getTime() - Date.now()) / 3600000) : 0
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get transaction',
        message: (error as Error).message
      });
    }
  }

  /**
   * Confirm sending
   */
  private async confirmSent(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { evidence } = req.body;

      await req.consensusSystem!.confirmSent(
        id,
        req.user!.orgId,
        evidence
      );

      res.json({
        success: true,
        message: 'Sending confirmed. Waiting for receiver confirmation.'
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to confirm sending',
        message: (error as Error).message
      });
    }
  }

  /**
   * Confirm receipt
   */
  private async confirmReceived(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { condition, notes, evidence } = req.body;

      await req.consensusSystem!.confirmReceived(
        id,
        req.user!.orgId,
        { condition, notes, ...evidence }
      );

      res.json({
        success: true,
        message: 'Receipt confirmed. Transaction validated.'
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to confirm receipt',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get pending transactions
   */
  private async getPendingTransactions(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { participantId } = req.params;
      
      // Verify user can access this participant's data
      if (participantId !== req.user!.orgId && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const pending = await req.consensusSystem!.getPendingTransactions(participantId);

      res.json({
        count: pending.length,
        transactions: pending
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get pending transactions',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get transaction history for an organization
   */
  private async getTransactionHistory(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      
      // Get all transactions for this organization
      const stateManager = this.consensusSystem.getStateManager();
      const allTransactions = Array.from(stateManager.getTransactions().values()) as Transaction[];
      
      // Filter transactions where org is sender or receiver
      const orgTransactions = allTransactions.filter(tx => 
        tx.sender === organizationId || tx.receiver === organizationId
      );
      
      // Sort by date, newest first
      orgTransactions.sort((a, b) => {
        const dateA = new Date((a as any).updatedAt || (a as any).createdAt || (a as any).created);
        const dateB = new Date((b as any).updatedAt || (b as any).createdAt || (b as any).created);
        return dateB.getTime() - dateA.getTime();
      });
      
      res.json(orgTransactions);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get transaction history',
        message: (error as Error).message
      });
    }
  }

  /**
   * Create a dispute
   */
  private async createDispute(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, evidence } = req.body;

      if (!type || !evidence) {
        res.status(400).json({ 
          error: 'Missing required fields: type, evidence' 
        });
        return;
      }

      await req.consensusSystem!.createDispute(
        id,
        req.user!.orgId,
        type as 'not_received' | 'wrong_item' | 'damaged' | 'quantity_mismatch',
        evidence
      );

      res.status(201).json({
        success: true,
        message: 'Dispute created. Other party notified.'
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to create dispute',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get dispute details
   */
  private async getDispute(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const report = await req.consensusSystem!.getTransactionReport(id);
      const dispute = report.transaction.dispute;
      
      if (!dispute) {
        res.status(404).json({ error: 'Dispute not found' });
        return;
      }
      
      res.json(dispute);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get dispute',
        message: (error as Error).message
      });
    }
  }

  /**
   * Add evidence to dispute
   */
  private async addEvidence(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, description, data, files } = req.body;

      if (!type || !description) {
        res.status(400).json({ 
          error: 'Missing required fields: type, description' 
        });
        return;
      }

      // Get transaction to find dispute
      const report = await req.consensusSystem!.getTransactionReport(id);
      if (!report.transaction.dispute) {
        res.status(404).json({ error: 'No dispute found for this transaction' });
        return;
      }

      // Add evidence through consensus system
      const evidenceId = `EVD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Store evidence data (in production, this would go to object storage)
      const evidence = {
        id: evidenceId,
        submittedBy: req.user!.orgId,
        type: type as 'photo' | 'document' | 'tracking' | 'testimony' | 'system_log',
        description,
        data: {
          ...data,
          files: files || []
        }
      };

      // Update transaction dispute with new evidence
      const transaction = req.consensusSystem!.getStateManager().getTransaction(id);
      if (transaction && transaction.dispute) {
        if (!transaction.dispute.evidence) {
          transaction.dispute.evidence = [];
        }
        transaction.dispute.evidence.push({
          ...evidence,
          submittedAt: new Date()
        });
      }

      res.json({
        success: true,
        message: 'Evidence submitted successfully',
        evidenceId
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to add evidence',
        message: (error as Error).message
      });
    }
  }

  /**
   * Resolve dispute (admin only)
   */
  private async resolveDispute(req: ApiRequest, res: Response): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can resolve disputes' });
        return;
      }

      const { id } = req.params;
      const { decision, reasoning, actions } = req.body;

      if (!decision || !reasoning) {
        res.status(400).json({ 
          error: 'Missing required fields: decision, reasoning' 
        });
        return;
      }

      // Get transaction
      const transaction = req.consensusSystem!.getStateManager().getTransaction(id);
      if (!transaction) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      if (!transaction.dispute || transaction.state !== TransactionState.DISPUTED) {
        res.status(400).json({ error: 'Transaction is not in disputed state' });
        return;
      }

      // Update dispute status
      transaction.dispute.status = 'RESOLVED';
      
      // Determine next state based on decision
      let nextState: TransactionState;
      switch (decision) {
        case 'favor_sender':
          nextState = TransactionState.VALIDATED;
          break;
        case 'favor_receiver':
          nextState = TransactionState.CANCELLED;
          break;
        case 'escalate':
          nextState = TransactionState.ESCALATED;
          break;
        default:
          nextState = TransactionState.RESOLVED;
      }

      // Transition to resolved state
      await req.consensusSystem!.getStateManager().transitionState(
        id,
        nextState,
        req.user!.id,
        {
          reason: `Dispute resolved: ${decision}`,
          evidence: {
            decision,
            reasoning,
            actions,
            resolvedAt: new Date()
          }
        }
      );

      // Update trust scores based on decision
      if (decision === 'favor_sender') {
        // Negative impact on receiver's trust
        this.emit('trust:update_required', {
          participant: transaction.receiver,
          action: 'dispute_lost',
          value: -10
        });
      } else if (decision === 'favor_receiver') {
        // Negative impact on sender's trust
        this.emit('trust:update_required', {
          participant: transaction.sender,
          action: 'dispute_lost',
          value: -10
        });
      }

      res.json({
        success: true,
        message: 'Dispute resolved successfully',
        resolution: {
          decision,
          newState: nextState,
          timestamp: new Date()
        }
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to resolve dispute',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get open disputes
   */
  private async getOpenDisputes(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { participantId } = req.params;
      
      // Query all pending transactions and filter for disputes
      const pending = await req.consensusSystem!.getPendingTransactions(participantId);
      const disputes = pending.filter(tx => tx.state === 'DISPUTED');
      
      res.json({
        count: disputes.length,
        disputes
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get open disputes',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get trust score
   */
  private async getTrustScore(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { participantId } = req.params;

      const trustData = await req.consensusSystem!.getTrustScore(participantId);
      
      res.json(trustData);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get trust score',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get trust history
   */
  private async getTrustHistory(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { participantId } = req.params;
      const { limit = 10 } = req.query;

      const history = await req.consensusSystem!.getTrustHistory(
        participantId,
        Number(limit)
      );
      
      res.json({
        participantId,
        history
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get trust history',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get trust leaderboard
   */
  private async getTrustLeaderboard(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { limit = 10 } = req.query;

      const leaderboard = await req.consensusSystem!.getTrustLeaderboard(
        Number(limit)
      );
      
      res.json({
        leaderboard
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get leaderboard',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get trust benefits
   */
  private async getTrustBenefits(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { participantId } = req.params;

      const trustData = await req.consensusSystem!.getTrustScore(participantId);
      
      res.json({
        participantId,
        benefits: trustData.benefits,
        level: trustData.level,
        score: trustData.score
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get trust benefits',
        message: (error as Error).message
      });
    }
  }

  /**
   * Create batch transactions
   */
  private async createBatchTransactions(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { transactions } = req.body;

      if (!Array.isArray(transactions) || transactions.length === 0) {
        res.status(400).json({ 
          error: 'Invalid batch: must provide array of transactions' 
        });
        return;
      }

      // Check trust score for batch operations
      const trustData = await req.consensusSystem!.getTrustScore(req.user!.orgId);
      
      if (!trustData.benefits.includes('batch_operations_allowed')) {
        res.status(403).json({ 
          error: 'Insufficient trust level for batch operations' 
        });
        return;
      }
      
      const transactionIds = [];
      
      for (const txData of transactions) {
        try {
          const txId = await req.consensusSystem!.createB2BTransaction({
            sender: req.user!.orgId,
            ...txData
          });
          transactionIds.push(txId);
        } catch (error) {
          // Log but continue with other transactions
          console.error('Batch transaction failed:', error);
        }
      }
      
      res.status(201).json({
        success: true,
        message: `Batch of ${transactionIds.length} transactions created`,
        transactionIds
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to create batch transactions',
        message: (error as Error).message
      });
    }
  }

  /**
   * Get statistics
   */
  private async getStatistics(req: ApiRequest, res: Response): Promise<void> {
    try {
      const metrics = await req.consensusSystem!.getSystemMetrics();
      
      res.json({
        transactions: {
          total: metrics.consensus.totalTransactions,
          pending: metrics.consensus.pendingTransactions,
          validated: metrics.consensus.totalTransactions - metrics.consensus.pendingTransactions - metrics.consensus.disputedTransactions,
          disputed: metrics.consensus.disputedTransactions,
          timeout: 0
        },
        participants: {
          total: 0, // Would need to be tracked separately
          active: 0,
          trusted: metrics.trust.flaggedParties.length
        },
        performance: metrics.performance,
        timestamp: metrics.timestamp
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get statistics',
        message: (error as Error).message
      });
    }
  }

  /**
   * Health check
   */
  private async healthCheck(req: ApiRequest, res: Response): Promise<void> {
    res.json({
      status: 'healthy',
      consensus: '2-check',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Trigger emergency stop
   */
  private async triggerEmergencyStop(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { reason, transactionIds } = req.body;
      
      if (!reason) {
        res.status(400).json({ error: 'Reason is required' });
        return;
      }
      
      if (req.user!.role !== 'admin' && req.user!.role !== 'security') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      
      await req.consensusSystem!.triggerEmergencyStop(req.user!.id, reason, transactionIds);
      
      res.json({
        success: true,
        message: 'Emergency stop triggered',
        affectedTransactions: transactionIds?.length || 0
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to trigger emergency stop',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Resume from emergency stop
   */
  private async resumeEmergencyStop(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { stopId, transactionIds } = req.body;
      
      if (!stopId) {
        res.status(400).json({ error: 'Stop ID is required' });
        return;
      }
      
      if (req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can resume emergency stops' });
        return;
      }
      
      await req.consensusSystem!.resumeEmergencyStop(stopId, req.user!.id, transactionIds);
      
      res.json({
        success: true,
        message: 'Emergency stop resumed'
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to resume emergency stop',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get emergency stop status
   */
  private async getEmergencyStatus(req: ApiRequest, res: Response): Promise<void> {
    try {
      const metrics = await req.consensusSystem!.getSystemMetrics();
      
      res.json({
        activeStops: metrics.emergency.activeStops || 0,
        haltedTransactions: metrics.emergency.haltedTransactions || 0,
        statistics: metrics.emergency
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get emergency status',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Approve compensation
   */
  private async approveCompensation(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      
      if (req.user!.role !== 'manager' && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      
      await req.consensusSystem!.approveCompensation(transactionId, req.user!.id);
      
      res.json({
        success: true,
        message: 'Compensation approved'
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to approve compensation',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Reject compensation
   */
  private async rejectCompensation(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;
      
      if (!reason) {
        res.status(400).json({ error: 'Rejection reason is required' });
        return;
      }
      
      if (req.user!.role !== 'manager' && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      
      await req.consensusSystem!.rejectCompensation(transactionId, req.user!.id, reason);
      
      res.json({
        success: true,
        message: 'Compensation rejected'
      });
    } catch (error) {
      res.status(400).json({ 
        error: 'Failed to reject compensation',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get pending compensations
   */
  private async getPendingCompensations(req: ApiRequest, res: Response): Promise<void> {
    try {
      if (req.user!.role !== 'manager' && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      
      const metrics = await req.consensusSystem!.getSystemMetrics();
      
      res.json({
        pending: [], // Would need to query compensation engine directly
        totalAmount: metrics.compensation?.totalPending || 0,
        count: metrics.compensation?.pendingCount || 0
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get pending compensations',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get performance report
   */
  private async getPerformanceReport(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.body;
      
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Start and end dates are required' });
        return;
      }
      
      const report = await req.consensusSystem!.getPerformanceReport(
        new Date(startDate), 
        new Date(endDate)
      );
      
      res.json(report);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to generate performance report',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get party analytics
   */
  private async getPartyAnalytics(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { partyId } = req.params;
      
      // Verify access rights
      if (partyId !== req.user!.orgId && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      
      const metrics = await req.consensusSystem!.getPartyMetrics(partyId);
      
      res.json({
        partyId,
        metrics
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get party analytics',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get insights
   */
  private async getInsights(req: ApiRequest, res: Response): Promise<void> {
    try {
      const metrics = await req.consensusSystem!.getSystemMetrics();
      
      res.json({
        insights: metrics.insights || [],
        recommendations: [],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get insights',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get consensus metrics
   */
  private async getConsensusMetrics(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get real metrics from consensus system
      const metrics = req.consensusSystem!.getMetrics();
      
      // Get additional data from state manager
      const stateManager = req.consensusSystem!.getStateManager();
      const transactions = Array.from(stateManager.getTransactions().values());
      
      // Calculate time-based metrics
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Today's transactions
      const todayTransactions = transactions.filter((tx: any) => 
        new Date(tx.createdAt || tx.created) >= today
      );
      
      // This week's transactions
      const weekTransactions = transactions.filter((tx: any) => 
        new Date(tx.createdAt || tx.created) >= lastWeek
      );
      
      // This month's transactions
      const monthTransactions = transactions.filter((tx: any) => 
        new Date(tx.createdAt || tx.created) >= lastMonth
      );
      
      // Calculate validation rates
      const validationRate = transactions.length > 0 
        ? (metrics.consensus.validatedTransactions / transactions.length * 100).toFixed(2)
        : '0';
      
      const weekValidationRate = weekTransactions.length > 0
        ? (weekTransactions.filter((tx: any) => tx.state === 'VALIDATED').length / weekTransactions.length * 100).toFixed(2)
        : '0';
      
      // Calculate average values
      const totalValue = transactions.reduce((sum: number, tx: any) => sum + (tx.value || 0), 0);
      const avgTransactionValue = transactions.length > 0 
        ? (totalValue / transactions.length).toFixed(2)
        : '0';
      
      // Get organization-specific metrics
      const orgMetrics: { [key: string]: any } = {};
      const orgs = ['luxebags', 'italianleather', 'craftworkshop', 'luxuryretail'];
      
      orgs.forEach(org => {
        const orgTransactions = transactions.filter((tx: any) => 
          tx.sender === org || tx.receiver === org
        );
        
        const sentTransactions = transactions.filter((tx: any) => tx.sender === org);
        const receivedTransactions = transactions.filter((tx: any) => tx.receiver === org);
        const validatedOrgTx = orgTransactions.filter((tx: any) => tx.state === 'VALIDATED');
        const disputedOrgTx = orgTransactions.filter((tx: any) => tx.state === 'DISPUTED');
        
        orgMetrics[org] = {
          totalTransactions: orgTransactions.length,
          sentTransactions: sentTransactions.length,
          receivedTransactions: receivedTransactions.length,
          validatedTransactions: validatedOrgTx.length,
          disputedTransactions: disputedOrgTx.length,
          validationRate: orgTransactions.length > 0 
            ? (validatedOrgTx.length / orgTransactions.length * 100).toFixed(2)
            : '0',
          disputeRate: orgTransactions.length > 0
            ? (disputedOrgTx.length / orgTransactions.length * 100).toFixed(2)
            : '0'
        };
      });
      
      res.json({
        summary: {
          totalTransactions: metrics.consensus.totalTransactions,
          pendingTransactions: metrics.consensus.pendingTransactions,
          validatedTransactions: metrics.consensus.validatedTransactions,
          disputedTransactions: metrics.consensus.disputedTransactions,
          validationRate: parseFloat(validationRate),
          disputeRate: parseFloat(String(metrics.consensus.disputeRate || '0')),
          averageConfirmationTime: metrics.consensus.averageConfirmationTime,
          averageTransactionValue: parseFloat(avgTransactionValue)
        },
        timeSeries: {
          today: {
            count: todayTransactions.length,
            validated: todayTransactions.filter((tx: any) => tx.state === 'VALIDATED').length,
            pending: todayTransactions.filter((tx: any) => 
              tx.state === 'INITIATED' || tx.state === 'SENT'
            ).length,
            disputed: todayTransactions.filter((tx: any) => tx.state === 'DISPUTED').length
          },
          week: {
            count: weekTransactions.length,
            validated: weekTransactions.filter((tx: any) => tx.state === 'VALIDATED').length,
            validationRate: parseFloat(weekValidationRate)
          },
          month: {
            count: monthTransactions.length,
            validated: monthTransactions.filter((tx: any) => tx.state === 'VALIDATED').length
          }
        },
        organizations: orgMetrics,
        trust: metrics.trust,
        performance: {
          ...metrics.performance,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get consensus metrics',
        message: (error as Error).message
      });
    }
  }
  
  /**
   * Get active anomalies
   */
  private async getActiveAnomalies(_req: ApiRequest, res: Response): Promise<void> {
    try {
      // For now, return empty array as anomaly detection is not yet implemented
      res.json([]);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get anomalies',
        message: (error as Error).message
      });
    }
  }
}