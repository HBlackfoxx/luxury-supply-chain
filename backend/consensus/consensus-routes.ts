import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ConsensusEngine } from './consensus-engine';
import { TrustScoreManager } from './trust-score-manager';
import { AnalyticsService } from './analytics-service';
import { authenticateToken } from '../auth/auth-middleware';

export function createConsensusRoutes(pool: Pool) {
  const router = Router();
  // Note: ConsensusEngine will be initialized per-request with the user's organization
  const trustScoreManager = new TrustScoreManager(pool);
  const analyticsService = new AnalyticsService(pool);

  // Apply authentication to all routes
  router.use(authenticateToken);

  // NOTE: Pending transactions are queried directly from blockchain via /api/supply-chain/transfers/pending

  // Confirm sent
  router.post('/transactions/:transactionId/confirm-sent', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const { evidence } = req.body;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      const consensusEngine = new ConsensusEngine(organization, userId);
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
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      const result = await consensusEngine.confirmReceived(transactionId, evidence);
      
      res.json(result);
    } catch (error) {
      console.error('Error confirming received:', error);
      res.status(500).json({ error: 'Failed to confirm received' });
    }
  });

  // Submit evidence for dispute
  router.post('/dispute/:disputeId/evidence', async (req: Request, res: Response) => {
    try {
      const { disputeId } = req.params;
      const { description, files } = req.body;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      if (!description) {
        return res.status(400).json({ error: 'Evidence description is required' });
      }
      
      // For now, store evidence locally or in a database
      // In production, files would be uploaded to IPFS or cloud storage
      const evidenceId = `EVIDENCE-${disputeId}-${Date.now()}`;
      
      // Create a hash of the evidence for blockchain storage
      const crypto = require('crypto');
      const evidenceData = {
        disputeId,
        description,
        files: files || [],
        submittedBy: organization,
        timestamp: new Date().toISOString()
      };
      const hash = crypto.createHash('sha256').update(JSON.stringify(evidenceData)).digest('hex');
      
      // Store evidence reference in blockchain via consensus engine
      // Note: disputeId is the transaction ID for the disputed transaction
      const consensusEngine = new ConsensusEngine(organization, userId);
      const result = await consensusEngine.submitEvidence(
        disputeId, // This is actually the transaction ID
        'DOCUMENTATION', // Default evidence type
        organization,
        hash
      );
      
      // Return the evidence data with ID
      res.json({
        success: true,
        evidenceId,
        ...evidenceData,
        hash
      });
    } catch (error) {
      console.error('Error submitting evidence:', error);
      res.status(500).json({ error: 'Failed to submit evidence' });
    }
  });

  // Resolve dispute
  router.post('/dispute/:transactionId/resolve', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const { decision, notes, compensationAmount } = req.body;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      if (!decision) {
        return res.status(400).json({ error: 'Decision is required' });
      }
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      const result = await consensusEngine.resolveDispute(
        transactionId,
        organization,
        decision,
        notes || '',
        compensationAmount || 0
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error resolving dispute:', error);
      res.status(500).json({ error: 'Failed to resolve dispute' });
    }
  });

  // Accept dispute
  router.post('/dispute/:transactionId/accept', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      // Map user ID to Fabric identity
      let fabricUserId = 'User1';
      if (userId.includes('admin')) {
        fabricUserId = 'Admin';
      } else if (userId.includes('user1')) {
        fabricUserId = 'User1';
      } else if (userId.includes('user2')) {
        fabricUserId = 'User2';
      }
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      await consensusEngine.initialize();
      
      // Use the AcceptDispute function from chaincode
      const gatewayManager = (consensusEngine as any).gatewayManager;
      if (!gatewayManager) {
        throw new Error('Gateway manager not initialized');
      }
      const gateway = await gatewayManager.connect({ 
        orgId: organization, 
        userId: fabricUserId  // Use mapped Fabric identity
      });
      const network = gateway.getNetwork('luxury-supply-chain');
      const contract = network.getContract('2check-consensus');
      
      // Map organization to MSP ID for chaincode
      const mspIdMap: Record<string, string> = {
        'luxebags': 'LuxeBagsMSP',
        'italianleather': 'ItalianLeatherMSP',
        'craftworkshop': 'CraftWorkshopMSP',
        'luxuryretail': 'LuxuryRetailMSP'
      };
      const orgMspId = mspIdMap[organization] || `${organization.charAt(0).toUpperCase() + organization.slice(1)}MSP`;
      
      // First get the dispute details to find the requested return quantity
      const disputeResult = await contract.evaluateTransaction('GetTransaction', transactionId);
      const disputeData = JSON.parse(Buffer.from(disputeResult).toString('utf8'));
      
      // Get the requested return quantity from dispute metadata
      const requestedReturnQuantity = disputeData.metadata?.requestedReturnQuantity || '0';
      
      await contract.submitTransaction(
        'AcceptDispute',
        transactionId,
        orgMspId,  // Use MSP ID instead of organization name
        requestedReturnQuantity  // Use the quantity from the dispute
      );
      
      // After accepting dispute, perform follow-up actions
      try {
        const supplyContract = network.getContract('luxury-supply-chain');
        
        // If it's a material transfer, mark it as verified since dispute is resolved
        if (transactionId.startsWith('MAT-TRANSFER-')) {
          // Find the material ID from the dispute data
          const materialId = disputeData.itemId;
          if (materialId) {
            try {
              // Mark the material transfer as verified/completed
              await supplyContract.submitTransaction(
                'SupplyChainContract:ConfirmMaterialReceived',
                transactionId,
                materialId
              );
              console.log('Material transfer marked as verified after dispute resolution');
            } catch (verifyError) {
              console.error('Warning: Could not mark material transfer as verified:', verifyError);
            }
          }
        }
        
        // Create return transfer based on dispute resolution
        await supplyContract.submitTransaction(
          'SupplyChainContract:CreateReturnTransferAfterDispute',
          transactionId  // Pass the dispute/transaction ID
        );
        console.log('Return transfer created after dispute acceptance');
      } catch (returnError) {
        console.error('Warning: Failed to create return transfer:', returnError);
        // Don't fail the whole operation if return creation fails
        // It can be created manually if needed
      }
      
      res.json({
        success: true,
        message: 'Dispute accepted and return transfer initiated',
        transactionId,
        returnTransferCreated: true
      });
    } catch (error) {
      console.error('Error accepting dispute:', error);
      res.status(500).json({ error: 'Failed to accept dispute' });
    }
  });

  // Get disputed transactions
  router.get('/disputes', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      const disputes = await consensusEngine.getDisputedTransactions(organization);
      
      res.json(disputes);
    } catch (error) {
      console.error('Error fetching disputes:', error);
      res.status(500).json({ error: 'Failed to fetch disputes' });
    }
  });

  // Get dispute resolution
  router.get('/disputes/:transactionId/resolution', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      await consensusEngine.initialize();
      
      const gatewayManager = (consensusEngine as any).gatewayManager;
      if (!gatewayManager) {
        throw new Error('Gateway manager not initialized');
      }
      const gateway = await gatewayManager.connect({ 
        orgId: organization, 
        userId: userId 
      });
      const network = gateway.getNetwork('luxury-supply-chain');
      const contract = network.getContract('2check-consensus');
      
      const result = await contract.evaluateTransaction('GetDisputeResolution', transactionId);
      const resolution = JSON.parse(Buffer.from(result).toString('utf8'));
      
      res.json(resolution);
    } catch (error) {
      console.error('Error fetching dispute resolution:', error);
      res.status(500).json({ error: 'Failed to fetch dispute resolution' });
    }
  });

  // Get pending dispute actions
  router.get('/disputes/pending-actions', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      // Map organization to MSP ID
      let orgMspId = '';
      switch(organization) {
        case 'luxebags': orgMspId = 'LuxeBagsMSP'; break;
        case 'italianleather': orgMspId = 'ItalianLeatherMSP'; break;
        case 'craftworkshop': orgMspId = 'CraftWorkshopMSP'; break;
        case 'luxuryretail': orgMspId = 'LuxuryRetailMSP'; break;
        default: orgMspId = organization.charAt(0).toUpperCase() + organization.slice(1) + 'MSP';
      }
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      await consensusEngine.initialize();
      
      const gatewayManager = (consensusEngine as any).gatewayManager;
      if (!gatewayManager) {
        throw new Error('Gateway manager not initialized');
      }
      const gateway = await gatewayManager.connect({ 
        orgId: organization, 
        userId: userId 
      });
      const network = gateway.getNetwork('luxury-supply-chain');
      const contract = network.getContract('2check-consensus');
      
      const result = await contract.evaluateTransaction('GetPendingActions', orgMspId);
      const actions = JSON.parse(Buffer.from(result).toString('utf8'));
      
      res.json(actions);
    } catch (error) {
      console.error('Error fetching pending actions:', error);
      res.status(500).json({ error: 'Failed to fetch pending actions' });
    }
  });

  // Initiate dispute
  router.post('/transactions/:transactionId/dispute', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      // Frontend sends 'type', 'evidence' with description field, and 'requestedReturnQuantity'
      const { type, evidence, requestedReturnQuantity } = req.body;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      // Use type as the dispute reason (NOT_RECEIVED, DEFECTIVE, etc.)
      const disputeType = type || 'NOT_RECEIVED';
      const description = evidence?.description || 'No description provided';
      const returnQuantity = requestedReturnQuantity || 0;
      
      console.log('Dispute request:', { transactionId, disputeType, description, organization, userId, returnQuantity });
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      // Pass disputeType (not description) as the reason
      const result = await consensusEngine.initiateDispute(transactionId, disputeType, evidence, returnQuantity);
      
      res.json(result);
    } catch (error: any) {
      console.error('Error initiating dispute:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      
      // Return 400 if it's a validation error, 500 otherwise
      const statusCode = error.message?.includes('not found') || error.message?.includes('invalid') ? 400 : 500;
      res.status(statusCode).json({ 
        error: error.message || 'Failed to initiate dispute',
        details: error.toString()
      });
    }
  });

  // Trust scores are now queried directly from blockchain
  // These endpoints forward to the supply-chain API which queries the consensus chaincode
  
  // Get trust score for organization
  router.get('/trust/:organizationId', async (req: Request, res: Response) => {
    // This endpoint is kept for compatibility but should be replaced with 
    // direct calls to /api/supply-chain/trust/:organizationId
    res.redirect(`/api/supply-chain/trust/${req.params.organizationId}`);
  });

  // Update trust score from event
  router.post('/trust/update-from-event', async (req: Request, res: Response) => {
    try {
      const { partyID, event, positive } = req.body;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      if (!partyID || !event) {
        return res.status(400).json({ error: 'Party ID and event are required' });
      }
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      const result = await consensusEngine.updateTrustFromEvent(partyID, event, positive);
      
      res.json(result);
    } catch (error) {
      console.error('Error updating trust from event:', error);
      res.status(500).json({ error: 'Failed to update trust score' });
    }
  });

  // Validate transaction for timeout
  router.post('/transactions/:transactionId/validate', async (req: Request, res: Response) => {
    try {
      const { transactionId } = req.params;
      const user = (req as any).user;
      const organization = user?.organization || 'luxebags';
      const userId = user?.id || 'admin-luxebags';
      
      const consensusEngine = new ConsensusEngine(organization, userId);
      const result = await consensusEngine.validateTransaction(transactionId);
      
      res.json(result);
    } catch (error) {
      console.error('Error validating transaction:', error);
      res.status(500).json({ error: 'Failed to validate transaction' });
    }
  });

  // Get trust score history with partners  
  router.get('/trust/:organizationId/history', async (_req: Request, res: Response) => {
    // Trust history not yet implemented in chaincode
    // Would need to add GetTrustHistory function to consensus.go
    res.json({
      relationships: []
    });
  });

  // Transaction history is now queried directly from blockchain via supply-chain API
  // Removed SQL-based history to avoid redundancy

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