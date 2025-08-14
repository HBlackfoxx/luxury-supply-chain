import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ConsensusEngine } from './consensus-engine';
import { TrustScoreManager } from './trust-score-manager';
import { AnalyticsService } from './analytics-service';
import { authenticateToken } from '../auth/auth-middleware';

export function createConsensusRoutes(pool: Pool) {
  const router = Router();
  const consensusEngine = new ConsensusEngine(pool);
  const trustScoreManager = new TrustScoreManager(pool);
  const analyticsService = new AnalyticsService(pool);

  // Apply authentication to all routes
  router.use(authenticateToken);

  // Get pending transactions for an organization
  router.get('/transactions/pending/:organizationId', async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const result = await pool.query(`
        SELECT 
          t.id,
          t.item_id as "itemId",
          t.item_description as "itemDescription",
          CASE 
            WHEN t.sender_id = $1 THEN 'SENT'
            ELSE 'RECEIVED'
          END as type,
          CASE 
            WHEN t.sender_id = $1 THEN t.receiver_id
            ELSE t.sender_id
          END as partner,
          t.created_at as "createdAt",
          t.value,
          t.status
        FROM consensus_transactions t
        WHERE (t.sender_id = $1 OR t.receiver_id = $1)
          AND t.status = 'PENDING_CONFIRMATION'
        ORDER BY t.created_at DESC
      `, [organizationId]);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
      res.status(500).json({ error: 'Failed to fetch pending transactions' });
    }
  });

  // Confirm sent
  router.post('/transactions/:transactionId/confirm-sent', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const { evidence } = req.body;
      
      const result = await consensusEngine.confirmSent(transactionId, evidence);
      
      res.json(result);
    } catch (error) {
      console.error('Error confirming sent:', error);
      res.status(500).json({ error: 'Failed to confirm sent' });
    }
  });

  // Confirm received
  router.post('/transactions/:transactionId/confirm-received', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const { evidence } = req.body;
      
      const result = await consensusEngine.confirmReceived(transactionId, evidence);
      
      res.json(result);
    } catch (error) {
      console.error('Error confirming received:', error);
      res.status(500).json({ error: 'Failed to confirm received' });
    }
  });

  // Initiate dispute
  router.post('/transactions/:transactionId/dispute', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const { reason, evidence } = req.body;
      
      const result = await consensusEngine.initiateDispute(transactionId, reason, evidence);
      
      res.json(result);
    } catch (error) {
      console.error('Error initiating dispute:', error);
      res.status(500).json({ error: 'Failed to initiate dispute' });
    }
  });

  // Get trust score for organization
  router.get('/trust/:organizationId', async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      
      const score = await trustScoreManager.getOrganizationScore(organizationId);
      const rank = await trustScoreManager.getOrganizationRank(organizationId);
      
      // Get recent transaction count
      const txResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM consensus_transactions
        WHERE (sender_id = $1 OR receiver_id = $1)
          AND created_at > NOW() - INTERVAL '30 days'
      `, [organizationId]);
      
      res.json({
        score,
        rank,
        totalTransactions: parseInt(txResult.rows[0].count),
        trend: score > 85 ? 'up' : score > 75 ? 'stable' : 'down'
      });
    } catch (error) {
      console.error('Error fetching trust score:', error);
      res.status(500).json({ error: 'Failed to fetch trust score' });
    }
  });

  // Get trust score history with partners
  router.get('/trust/:organizationId/history', async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      
      const result = await pool.query(`
        SELECT 
          ts.partner_id as "partnerId",
          ts.partner_id as "partnerName",
          ts.trust_score as "trustScore",
          ts.total_transactions as "totalTransactions",
          ts.dispute_count as "disputeCount",
          ts.last_interaction as "lastInteraction",
          CASE 
            WHEN ts.trust_score > ts.previous_score THEN 'up'
            WHEN ts.trust_score < ts.previous_score THEN 'down'
            ELSE 'stable'
          END as trend
        FROM trust_scores ts
        WHERE ts.organization_id = $1
        ORDER BY ts.trust_score DESC
      `, [organizationId]);
      
      res.json({
        relationships: result.rows
      });
    } catch (error) {
      console.error('Error fetching trust history:', error);
      res.status(500).json({ error: 'Failed to fetch trust history' });
    }
  });

  // Get transaction history
  router.get('/transactions/history/:organizationId', async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const result = await pool.query(`
        SELECT 
          t.id,
          t.item_id as "itemId",
          t.item_description as "itemDescription",
          CASE 
            WHEN t.sender_id = $1 THEN 'SENT'
            ELSE 'RECEIVED'
          END as type,
          CASE 
            WHEN t.sender_id = $1 THEN t.receiver_id
            ELSE t.sender_id
          END as partner,
          t.created_at as "createdAt",
          t.confirmed_at as "confirmedAt",
          t.value,
          t.status,
          EXTRACT(EPOCH FROM (t.confirmed_at - t.created_at)) * 1000 as "confirmationTime"
        FROM consensus_transactions t
        WHERE (t.sender_id = $1 OR t.receiver_id = $1)
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `, [organizationId, limit, offset]);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
  });

  // Analytics endpoint
  router.post('/analytics/report', async (req: Request, res: Response) => {
    try {
      const { organizationId, startDate, endDate, metrics } = req.body;
      
      // Use the user's organization if not specified
      const orgId = organizationId || (req as any).user?.organization;
      
      const report = await analyticsService.generateReport(
        orgId,
        new Date(startDate),
        new Date(endDate),
        metrics
      );
      
      res.json(report);
    } catch (error) {
      console.error('Error generating analytics report:', error);
      res.status(500).json({ error: 'Failed to generate analytics report' });
    }
  });

  // Get historical data for a specific metric
  router.get('/analytics/:metric', async (req: Request, res: Response) => {
    try {
      const { metric } = req.params;
      const { organizationId, days = 30 } = req.query;
      
      const orgId = organizationId || (req as any).user?.organization;
      
      const data = await analyticsService.getHistoricalData(
        orgId as string,
        metric,
        parseInt(days as string)
      );
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching historical data:', error);
      res.status(500).json({ error: 'Failed to fetch historical data' });
    }
  });

  return router;
}