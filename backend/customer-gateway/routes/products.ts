// Product Routes for Customers
// Verify authenticity, view product details

import { Router, Request, Response } from 'express';
import { BlockchainProxy } from '../services/blockchain-proxy';

export function createProductRoutes(blockchainProxy: BlockchainProxy): Router {
  const router = Router();
  
  /**
   * Verify product authenticity - PUBLIC endpoint
   * Anyone can verify without authentication
   */
  router.get('/verify/:productId', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      
      const result = await blockchainProxy.verifyProduct(productId);
      
      if (result.authentic) {
        res.json({
          authentic: true,
          message: 'Product is authentic',
          product: result.product, // Return full product data
          verifiedAt: result.verifiedAt
        });
      } else {
        res.status(404).json({
          authentic: false,
          message: 'Product not found or not authentic',
          productId
        });
      }
    } catch (error: any) {
      console.error('Error verifying product:', error);
      res.status(500).json({ 
        error: 'Failed to verify product' 
      });
    }
  });
  
  /**
   * Get product history (public view)
   * Shows supply chain history
   */
  router.get('/:productId/history', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      
      // Get actual history from blockchain
      const history = await blockchainProxy.getProductHistory(productId);
      
      res.json({
        productId,
        history
      });
    } catch (error: any) {
      console.error('Error getting product history:', error);
      res.status(500).json({ 
        error: 'Failed to get product history' 
      });
    }
  });
  
  /**
   * Get birth certificate for product
   */
  router.get('/certificate/:productId', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      
      const result = await blockchainProxy.getBirthCertificate(productId);
      
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({
          error: 'Birth certificate not found for this product'
        });
      }
    } catch (error: any) {
      console.error('Error getting birth certificate:', error);
      res.status(500).json({ 
        error: 'Failed to get birth certificate' 
      });
    }
  });

  /**
   * Check if product is reported stolen
   * Public safety feature
   */
  router.get('/:productId/stolen-status', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      
      const result = await blockchainProxy.verifyProduct(productId);
      
      if (result.authentic && result.product) {
        res.json({
          productId,
          isStolen: result.product.isStolen || false,
          reportedDate: result.product.stolenDate || null,
          message: result.product.isStolen 
            ? 'This product has been reported as stolen' 
            : 'This product has not been reported as stolen'
        });
      } else {
        res.status(404).json({
          error: 'Product not found'
        });
      }
    } catch (error: any) {
      console.error('Error checking stolen status:', error);
      res.status(500).json({ 
        error: 'Failed to check stolen status' 
      });
    }
  });
  
  return router;
}