// backend/erp-integration/webhooks/webhook-handler.ts
// Express routes for handling ERP webhooks

import { Router, Request, Response } from 'express';
import { ERPIntegrationService } from '../erp-integration-service';
import { ERPWebhookPayload } from '../types';

export function createWebhookRouter(erpService: ERPIntegrationService): Router {
  const router = Router();

  // Webhook endpoint for each organization
  router.post('/webhooks/:orgId', async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const payload = req.body as ERPWebhookPayload;
      
      console.log(`Received webhook for ${orgId}:`, payload.eventType);
      
      // Validate webhook (in production, check signatures)
      if (!payload.eventType || !payload.timestamp) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }
      
      // Process webhook
      await erpService.handleWebhook(orgId, payload);
      
      res.status(200).json({ 
        success: true, 
        message: 'Webhook processed' 
      });
    } catch (error) {
      console.error('Webhook processing failed:', error);
      res.status(500).json({ 
        error: 'Failed to process webhook',
        message: (error as Error).message 
      });
    }
  });

  // Manual sync endpoint
  router.post('/sync/:orgId', async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const { type = 'incremental' } = req.body;
      
      // This would trigger manual sync
      res.json({ 
        success: true,
        message: `${type} sync initiated for ${orgId}`
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Sync failed',
        message: (error as Error).message 
      });
    }
  });

  return router;
}