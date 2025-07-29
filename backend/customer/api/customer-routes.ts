// backend/customer/api/customer-routes.ts
// REST API routes for customer operations

import { Router, Request, Response } from 'express';
import { OwnershipService } from '../services/ownership-service';
import { QRService } from '../services/qr-service';
import { RecoveryService } from '../services/recovery-service';
import { authenticateCustomer } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { 
  OwnershipClaim,
  TransferRequest,
  Customer
} from '../types';

export function createCustomerRoutes(
  ownershipService: OwnershipService,
  qrService: QRService,
  recoveryService: RecoveryService
): Router {
  const router = Router();

  /**
   * Customer registration/login
   */
  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, phone, name } = req.body;
      
      // In production, implement proper auth
      const customer: Customer = {
        id: email, // Simple for PoC
        email,
        phone,
        name,
        registeredAt: new Date(),
        lastActive: new Date(),
        preferences: {
          notificationMethod: 'email',
          language: 'en',
          timezone: 'UTC'
        }
      };
      
      res.json({
        success: true,
        customer,
        token: 'mock-jwt-token' // In production, generate real JWT
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Claim ownership of a product
   */
  router.post('/ownership/claim', 
    authenticateCustomer,
    validateRequest('ownershipClaim'),
    async (req: Request, res: Response) => {
      try {
        const customerId = (req as any).user.id;
        const claim: OwnershipClaim = req.body;
        
        const ownedProduct = await ownershipService.claimOwnership(customerId, claim);
        
        res.json({
          success: true,
          product: ownedProduct,
          message: 'Ownership successfully claimed'
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  /**
   * Get customer's owned products
   */
  router.get('/ownership/products', 
    authenticateCustomer,
    async (req: Request, res: Response) => {
      try {
        const customerId = (req as any).user.id;
        const products = await ownershipService.getCustomerProducts(customerId);
        
        res.json({
          success: true,
          products,
          count: products.length
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  /**
   * Generate transfer code
   */
  router.post('/ownership/transfer/generate',
    authenticateCustomer,
    async (req: Request, res: Response) => {
      try {
        const customerId = (req as any).user.id;
        const { productId, reason } = req.body;
        
        const transferCode = await ownershipService.generateTransferCode(
          customerId,
          productId,
          reason
        );
        
        res.json({
          success: true,
          transferCode,
          expiresIn: '48 hours',
          instructions: 'Share this code with the new owner'
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  /**
   * Complete transfer with code
   */
  router.post('/ownership/transfer/complete',
    authenticateCustomer,
    async (req: Request, res: Response) => {
      try {
        const customerId = (req as any).user.id;
        const { transferCode } = req.body;
        
        const product = await ownershipService.transferOwnership(
          customerId,
          transferCode
        );
        
        res.json({
          success: true,
          product,
          message: 'Ownership successfully transferred'
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  /**
   * Report product stolen/lost
   */
  router.post('/ownership/report',
    authenticateCustomer,
    async (req: Request, res: Response) => {
      try {
        const customerId = (req as any).user.id;
        const { productId, type, location, policeReport, description } = req.body;
        
        await ownershipService.reportStolen(customerId, productId, {
          type,
          location,
          policeReport,
          description
        });
        
        res.json({
          success: true,
          message: `Product reported as ${type}`,
          caseNumber: `CASE-${Date.now()}`
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  /**
   * Verify product (public endpoint)
   */
  router.get('/verify/:productId', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      const verifierId = (req as any).user?.id;
      
      const result = await ownershipService.verifyProduct(productId, verifierId);
      
      res.json({
        success: true,
        verification: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Verify QR code
   */
  router.get('/v/:encodedData', async (req: Request, res: Response) => {
    try {
      const { encodedData } = req.params;
      const result = qrService.verifyQRData(encodedData);
      
      if (!result.isValid) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }
      
      // Get product verification
      const verification = await ownershipService.verifyProduct(
        result.data!.productId,
        (req as any).user?.id
      );
      
      res.json({
        success: true,
        qrData: result.data,
        verification
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Generate dynamic QR for actions
   */
  router.post('/qr/generate',
    authenticateCustomer,
    async (req: Request, res: Response) => {
      try {
        const { productId, purpose } = req.body;
        
        const dynamicQR = qrService.generateDynamicQR(
          productId,
          purpose,
          5 // 5 minutes expiry
        );
        
        res.json({
          success: true,
          qr: dynamicQR,
          purpose
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }
  );

  /**
   * Initiate account recovery
   */
  router.post('/recovery/initiate', async (req: Request, res: Response) => {
    try {
      const { email, phone, productIds, verificationMethod } = req.body;
      
      const requestId = await recoveryService.initiateRecovery(
        email,
        phone,
        productIds,
        verificationMethod
      );
      
      res.json({
        success: true,
        requestId,
        message: `Verification sent via ${verificationMethod}`,
        nextStep: 'Submit verification code or document'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Verify recovery request
   */
  router.post('/recovery/verify', async (req: Request, res: Response) => {
    try {
      const { requestId, verificationCode, idDocument } = req.body;
      
      const verified = await recoveryService.verifyRecovery(
        requestId,
        verificationCode,
        idDocument ? Buffer.from(idDocument, 'base64') : undefined
      );
      
      if (verified) {
        res.json({
          success: true,
          message: 'Recovery verified',
          nextStep: 'Check email for recovery link'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Verification failed'
        });
      }
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Complete recovery
   */
  router.post('/recovery/complete', async (req: Request, res: Response) => {
    try {
      const { recoveryToken, newEmail } = req.body;
      
      const result = await recoveryService.completeRecovery(
        recoveryToken,
        newEmail
      );
      
      res.json({
        success: true,
        customerId: result.customerId,
        recoveredProducts: result.recoveredProducts,
        message: 'Account recovered successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get recovery status
   */
  router.get('/recovery/status/:requestId', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const status = await recoveryService.getRecoveryStatus(requestId);
      
      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Recovery request not found'
        });
      }
      
      res.json({
        success: true,
        status: {
          requestId: requestId,
          status: status.status,
          createdAt: status.createdAt,
          method: status.verificationMethod
        }
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}