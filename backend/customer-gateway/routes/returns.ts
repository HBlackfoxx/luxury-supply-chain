// Customer Return Routes
// Handles C2B returns

import { Router, Request, Response } from 'express';
import { BlockchainProxy } from '../services/blockchain-proxy';

export function createReturnRoutes(blockchainProxy: BlockchainProxy): Router {
  const router = Router();
  
  /**
   * Initiate product return to retailer
   */
  router.post('/initiate', async (req: Request, res: Response) => {
    try {
      const { productId, reason, email, phone, returnDetails } = req.body;
      
      if (!productId || !reason || (!email && !phone)) {
        return res.status(400).json({ 
          error: 'Product ID, reason, and owner credentials required' 
        });
      }
      
      // Validate return reason
      const validReasons = ['DEFECT', 'CHANGE_OF_MIND', 'WRONG_ITEM', 'DAMAGED'];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({ 
          error: `Invalid reason. Must be one of: ${validReasons.join(', ')}` 
        });
      }
      
      // Generate owner hash
      const crypto = require('crypto');
      const ownerHash = crypto.createHash('sha256')
        .update(`${email || ''}:${phone || ''}:`)
        .digest('hex');
      
      const result = await blockchainProxy.initiateReturn(productId, reason, ownerHash);
      
      res.json({
        success: true,
        message: 'Return initiated successfully',
        returnId: result.returnId,
        productId,
        status: 'initiated',
        nextSteps: [
          'Bring product to any authorized retailer',
          'Show this return ID: ' + result.returnId,
          'Retailer will verify and process the return'
        ]
      });
    } catch (error: any) {
      console.error('Error initiating return:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to initiate return' 
      });
    }
  });
  
  /**
   * Check return status
   */
  router.get('/status/:returnId', async (req: Request, res: Response) => {
    try {
      const { returnId } = req.params;
      
      // For now, return mock status
      // In production, this would query the blockchain
      res.json({
        returnId,
        status: 'pending_verification',
        productId: 'PROD-001',
        initiatedAt: new Date().toISOString(),
        estimatedCompletion: '3-5 business days',
        steps: [
          { step: 'Return Initiated', completed: true, date: '2024-01-15' },
          { step: 'Product Received', completed: false },
          { step: 'Quality Inspection', completed: false },
          { step: 'Return Approved', completed: false },
          { step: 'Refund Processed', completed: false }
        ]
      });
    } catch (error: any) {
      console.error('Error checking return status:', error);
      res.status(500).json({ 
        error: 'Failed to check return status' 
      });
    }
  });
  
  /**
   * Get return policy
   */
  router.get('/policy', async (req: Request, res: Response) => {
    res.json({
      policy: {
        returnable: true,
        timeLimit: '30 days from purchase',
        conditions: [
          'Product must be in original condition',
          'All tags and packaging must be intact',
          'Proof of purchase required',
          'Custom or personalized items cannot be returned'
        ],
        reasons: {
          DEFECT: 'Manufacturing defect - Full refund',
          CHANGE_OF_MIND: 'Changed mind - Store credit only',
          WRONG_ITEM: 'Wrong item received - Full refund + shipping',
          DAMAGED: 'Damaged in shipping - Full refund'
        }
      }
    });
  });
  
  return router;
}