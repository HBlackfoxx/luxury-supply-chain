// Customer Ownership Routes
// Handles ownership claims, transfers, and stolen product reports

import { Router, Request, Response } from 'express';
import { BlockchainProxy } from '../services/blockchain-proxy';

export function createOwnershipRoutes(blockchainProxy: BlockchainProxy): Router {
  const router = Router();
  
  /**
   * Claim ownership of a product (at point of sale)
   * Customer provides email/phone, NOT blockchain identity
   */
  router.post('/claim', async (req: Request, res: Response) => {
    try {
      const { productId, email, phone, name } = req.body;
      
      if (!productId || (!email && !phone)) {
        return res.status(400).json({ 
          error: 'Product ID and either email or phone required' 
        });
      }
      
      const result = await blockchainProxy.claimOwnership(productId, {
        email,
        phone,
        name,
        id: `CUST-${Date.now()}`
      });
      
      res.json({
        success: true,
        message: 'Product ownership claimed successfully',
        ...result
      });
    } catch (error: any) {
      console.error('Error claiming ownership:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to claim ownership' 
      });
    }
  });
  
  /**
   * Generate transfer code for C2C transfer
   */
  router.post('/transfer/generate', async (req: Request, res: Response) => {
    try {
      const { productId, email, phone, password, pin } = req.body;
      
      if (!productId || (!email && !phone) || !password || !pin) {
        return res.status(400).json({ 
          error: 'Product ID, owner credentials, password, and PIN required' 
        });
      }
      
      // Generate owner hash from credentials
      const crypto = require('crypto');
      const ownerHash = crypto.createHash('sha256')
        .update((email || phone || '').toLowerCase())
        .digest('hex');
      
      // Generate security hash for verification
      const securityHash = crypto.createHash('sha256')
        .update(`${password}:${pin}`)
        .digest('hex');
      
      const result = await blockchainProxy.generateTransferCode(productId, ownerHash, securityHash);
      
      res.json({
        success: true,
        message: 'Transfer code generated',
        ...result
      });
    } catch (error: any) {
      console.error('Error generating transfer code:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to generate transfer code' 
      });
    }
  });
  
  /**
   * Complete ownership transfer using transfer code
   */
  router.post('/transfer/complete', async (req: Request, res: Response) => {
    try {
      const { productId, transferCode, email, phone, name, password, pin } = req.body;
      
      if (!productId || !transferCode || (!email && !phone)) {
        return res.status(400).json({ 
          error: 'Product ID, transfer code, and new owner details required' 
        });
      }
      
      if (!password || !pin) {
        return res.status(400).json({ 
          error: 'Password and PIN are required for secure ownership' 
        });
      }
      
      const result = await blockchainProxy.completeTransfer(productId, transferCode, {
        email,
        phone,
        name,
        password,
        pin,
        id: `CUST-${Date.now()}`
      });
      
      res.json({
        success: true,
        message: 'Ownership transferred successfully',
        ...result
      });
    } catch (error: any) {
      console.error('Error completing transfer:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to complete transfer' 
      });
    }
  });
  
  /**
   * Report product as stolen (with security verification)
   */
  router.post('/report-stolen', async (req: Request, res: Response) => {
    try {
      const { productId, email, phone, password, pin, policeReportId } = req.body;
      
      if (!productId || (!email && !phone) || !password || !pin) {
        return res.status(400).json({ 
          error: 'Product ID, owner credentials, password, and PIN required' 
        });
      }
      
      const crypto = require('crypto');
      const ownerHash = crypto.createHash('sha256')
        .update((email || phone || '').toLowerCase())
        .digest('hex');
      
      // Generate security hash for verification
      const securityHash = crypto.createHash('sha256')
        .update(`${password}:${pin}`)
        .digest('hex');
      
      // Call blockchain with security verification
      const result = await blockchainProxy.reportStolen(productId, ownerHash, securityHash, policeReportId);
      
      res.json({
        success: true,
        message: 'Product reported as stolen',
        ...result
      });
    } catch (error: any) {
      console.error('Error reporting stolen:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to report product as stolen' 
      });
    }
  });
  
  /**
   * Recover stolen product (with security verification)
   */
  router.post('/recover', async (req: Request, res: Response) => {
    try {
      const { productId, email, phone, password, pin, recoveryDetails } = req.body;
      
      if (!productId || (!email && !phone) || !password || !pin) {
        return res.status(400).json({ 
          error: 'Product ID, owner credentials, password, and PIN required' 
        });
      }
      
      const crypto = require('crypto');
      const ownerHash = crypto.createHash('sha256')
        .update((email || phone || '').toLowerCase())
        .digest('hex');
      
      // Generate security hash for verification
      const securityHash = crypto.createHash('sha256')
        .update(`${password}:${pin}`)
        .digest('hex');
      
      // Call blockchain with security verification
      const result = await blockchainProxy.recoverProduct(productId, ownerHash, securityHash, recoveryDetails);
      
      res.json({
        success: true,
        message: 'Product marked as recovered',
        ...result
      });
    } catch (error: any) {
      console.error('Error recovering product:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to recover product' 
      });
    }
  });
  
  /**
   * Get products owned by a customer
   */
  router.get('/products', async (req: Request, res: Response) => {
    try {
      const { email, phone } = req.query;
      
      if (!email && !phone) {
        return res.status(400).json({ 
          error: 'Email or phone required to find products' 
        });
      }
      
      // Generate owner hash from credentials
      const crypto = require('crypto');
      const ownerHash = crypto.createHash('sha256')
        .update((email || phone || '').toString().toLowerCase())
        .digest('hex');
      
      // Get products owned by this hash
      const products = await blockchainProxy.getOwnedProducts(ownerHash);
      
      res.json(products || []);
    } catch (error: any) {
      console.error('Error fetching owned products:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to fetch owned products' 
      });
    }
  });
  
  return router;
}