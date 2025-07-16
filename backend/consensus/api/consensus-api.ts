// backend/consensus/api/consensus-api.ts
// REST API endpoints for 2-Check consensus system

import express, { Router, Request, Response, NextFunction } from 'express';
import { ConsensusSystem } from '../setup-consensus';
import { TransactionState, Transaction } from '../../../consensus/2check/core/state/state-manager';
import { DisputeType } from '../../../consensus/2check/exceptions/disputes/dispute-resolution';

export interface ApiRequest extends Request {
  consensusSystem?: ConsensusSystem;
  user?: {
    id: string;
    orgId: string;
    role: string;
  };
}

export class ConsensusAPI {
  private router: Router;
  private consensusSystem: ConsensusSystem;

  constructor(consensusSystem: ConsensusSystem) {
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
    this.router.post('/transactions', this.createTransaction.bind(this));
    this.router.get('/transactions/:id', this.getTransaction.bind(this));
    this.router.post('/transactions/:id/confirm-sent', this.confirmSent.bind(this));
    this.router.post('/transactions/:id/confirm-received', this.confirmReceived.bind(this));
    this.router.get('/transactions/pending/:participantId', this.getPendingTransactions.bind(this));

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
  }

  /**
   * Auth middleware (simplified for demo)
   */
  private authMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
    // In production, validate JWT token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Mock user from token
    req.user = {
      id: req.headers['x-user-id'] as string || 'user1',
      orgId: req.headers['x-org-id'] as string || 'luxebags',
      role: req.headers['x-user-role'] as string || 'user'
    };

    next();
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
   * Get transaction details
   */
  private async getTransaction(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // This would normally query from blockchain
      // For demo, we'll return mock data
      res.json({
        id,
        state: TransactionState.SENT,
        sender: 'supplier1',
        receiver: 'manufacturer1',
        itemId: 'ITEM-001',
        value: 5000,
        created: new Date().toISOString(),
        timeoutIn: 48 // hours
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
      
      // This would query from dispute system
      res.json({
        id,
        transactionId: 'TX-001',
        type: 'not_received',
        status: 'open',
        creator: req.user!.orgId,
        created: new Date().toISOString()
      });
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
      const { type, description, data } = req.body;

      // Implementation would add evidence to dispute system

      res.json({
        success: true,
        message: 'Evidence added to dispute'
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

      // Implementation would resolve dispute

      res.json({
        success: true,
        message: 'Dispute resolved'
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
      
      // Implementation would query dispute system

      res.json({
        count: 0,
        disputes: []
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

      // Implementation would query trust scoring system

      res.json({
        participantId,
        score: 85,
        level: {
          name: 'trusted',
          color: 'silver',
          benefits: [
            'most_transactions_auto_approved',
            'extended_timeouts',
            'batch_operations_allowed'
          ]
        },
        statistics: {
          totalTransactions: 150,
          successfulTransactions: 148,
          disputes: 2,
          disputesWon: 1
        }
      });
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

      // Implementation would query trust history

      res.json({
        participantId,
        history: []
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

      // Implementation would query leaderboard

      res.json({
        leaderboard: []
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

      // Implementation would check benefits

      res.json({
        participantId,
        benefits: [
          'batch_operations_allowed',
          'extended_timeouts'
        ],
        canPerform: {
          batchOperations: true,
          autoApproval: false,
          apiAccess: false
        }
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
      // Implementation would process batch

      res.status(201).json({
        success: true,
        message: `Batch of ${transactions.length} transactions created`,
        transactionIds: []
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
      // Implementation would gather statistics

      res.json({
        transactions: {
          total: 1500,
          pending: 23,
          validated: 1450,
          disputed: 27,
          timeout: 0
        },
        participants: {
          total: 45,
          active: 38,
          trusted: 25
        },
        performance: {
          averageConfirmationTime: 4.5, // hours
          disputeRate: 1.8, // percentage
          autoApprovalRate: 82.5 // percentage
        }
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
}