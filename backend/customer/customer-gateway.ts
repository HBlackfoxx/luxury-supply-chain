// backend/customer/customer-gateway.ts
// Main customer gateway service

import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { OwnershipService } from './services/ownership-service';
import { QRService } from './services/qr-service';
import { RecoveryService } from './services/recovery-service';
import { ServiceAccountManager } from './services/service-account';
import { createCustomerRoutes } from './api/customer-routes';
import { sanitizeInput } from './middleware/validation';
import { ConsensusSystem } from '../consensus/setup-consensus';

export class CustomerGateway extends EventEmitter {
  private app: express.Application;
  private ownershipService: OwnershipService;
  private qrService: QRService;
  private recoveryService: RecoveryService;
  private serviceAccountManager: ServiceAccountManager;
  private consensusSystem: ConsensusSystem;
  private server: any;

  constructor(consensusSystem: ConsensusSystem) {
    super();
    this.consensusSystem = consensusSystem;
    this.app = express();
    
    // Initialize services
    this.ownershipService = new OwnershipService();
    this.qrService = new QRService(
      process.env.QR_SECRET || 'your-qr-secret-change-in-production',
      process.env.BASE_URL || 'https://verify.luxe-bags.luxury'
    );
    this.recoveryService = new RecoveryService();
    this.serviceAccountManager = new ServiceAccountManager();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupEventHandlers();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true
    }));
    
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(sanitizeInput);
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[Customer API] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'customer-gateway',
        timestamp: new Date()
      });
    });
    
    // Customer API routes
    this.app.use('/api/customer', createCustomerRoutes(
      this.ownershipService,
      this.qrService,
      this.recoveryService
    ));
    
    // Admin routes for customer service
    this.app.use('/api/admin/recovery', this.createAdminRoutes());
    
    // Service account routes
    this.app.use('/api/service-account', this.createServiceAccountRoutes());
    
    // Error handler
    this.app.use((err: any, req: any, res: any, next: any) => {
      console.error('Error:', err);
      res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
      });
    });
  }

  /**
   * Create admin routes
   */
  private createAdminRoutes(): express.Router {
    const router = express.Router();
    
    // Get pending recovery requests
    router.get('/pending', async (req, res) => {
      try {
        const pending = await this.recoveryService.getPendingRequests();
        res.json({
          success: true,
          requests: pending,
          count: pending.length
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Approve recovery
    router.post('/approve/:requestId', async (req, res) => {
      try {
        const { requestId } = req.params;
        const { adminId, notes } = req.body;
        
        await this.recoveryService.approveRecovery(requestId, adminId, notes);
        
        res.json({
          success: true,
          message: 'Recovery approved'
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Reject recovery
    router.post('/reject/:requestId', async (req, res) => {
      try {
        const { requestId } = req.params;
        const { adminId, reason } = req.body;
        
        await this.recoveryService.rejectRecovery(requestId, adminId, reason);
        
        res.json({
          success: true,
          message: 'Recovery rejected'
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

  /**
   * Create service account routes
   */
  private createServiceAccountRoutes(): express.Router {
    const router = express.Router();
    
    // Get account balance
    router.get('/balance/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const balance = this.serviceAccountManager.getAccountBalance(accountId);
        
        res.json({
          success: true,
          accountId,
          balance: balance.balance / 100, // Convert to dollars
          allocated: balance.allocated / 100,
          available: balance.available / 100,
          currency: 'USD'
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Get transaction history
    router.get('/transactions/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const { startDate, endDate } = req.query;
        
        const transactions = this.serviceAccountManager.getTransactionHistory(
          accountId,
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        );
        
        res.json({
          success: true,
          accountId,
          transactions: transactions.map(tx => ({
            ...tx,
            amount: tx.amount / 100 // Convert to dollars
          })),
          count: transactions.length
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Get usage analytics
    router.get('/analytics/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const analytics = this.serviceAccountManager.getUsageAnalytics(accountId);
        
        res.json({
          success: true,
          accountId,
          analytics: {
            ...analytics,
            totalSpent: analytics.totalSpent / 100,
            averageTransactionCost: analytics.averageTransactionCost / 100,
            topOperations: analytics.topOperations.map(op => ({
              ...op,
              total: op.total / 100
            })),
            dailyUsage: analytics.dailyUsage.map(daily => ({
              ...daily,
              amount: daily.amount / 100
            }))
          }
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Update settings
    router.put('/settings/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const settings = req.body;
        
        // Convert dollar amounts to cents
        if (settings.autoTopUpThreshold) {
          settings.autoTopUpThreshold = Math.round(settings.autoTopUpThreshold * 100);
        }
        if (settings.autoTopUpAmount) {
          settings.autoTopUpAmount = Math.round(settings.autoTopUpAmount * 100);
        }
        if (settings.feeAllocation) {
          Object.keys(settings.feeAllocation).forEach(key => {
            settings.feeAllocation[key] = Math.round(settings.feeAllocation[key] * 100);
          });
        }
        
        this.serviceAccountManager.updateAccountSettings(accountId, settings);
        
        res.json({
          success: true,
          message: 'Settings updated successfully'
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      }
    });
    
    // Get fee estimate
    router.post('/estimate-fee', async (req, res) => {
      try {
        const { operation, productBrand } = req.body;
        
        const estimate = this.serviceAccountManager.estimateFee(
          operation,
          productBrand || 'luxebags'
        );
        
        res.json({
          success: true,
          estimate: {
            ...estimate,
            estimatedFee: estimate.estimatedFee / 100,
            breakdown: {
              blockchain: estimate.breakdown.blockchain / 100,
              processing: estimate.breakdown.processing / 100,
              storage: estimate.breakdown.storage / 100
            }
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

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Ownership events
    this.ownershipService.on('ownership_claimed', async (event) => {
      console.log('Ownership claimed:', event);
      
      // Process fee through service account
      try {
        const productBrand = 'luxebags'; // In production, get from product data
        const retailerId = 'luxuryretail'; // In production, get from claim data
        
        await this.serviceAccountManager.processCustomerOperation(
          'ownership_claim',
          event.customerId,
          event.productId,
          productBrand,
          retailerId
        );
        
        console.log('Ownership claim fee processed');
      } catch (error) {
        console.error('Failed to process ownership claim fee:', error);
      }
      
      // Update blockchain (in production)
      // await this.consensusSystem.recordOwnership(event);
      
      // Send notification
      this.emit('notification', {
        type: 'ownership_claimed',
        customerId: event.customerId,
        data: event
      });
    });
    
    this.ownershipService.on('transfer_completed', async (event) => {
      console.log('Transfer completed:', event);
      
      // Process fee through service account
      try {
        const productBrand = 'luxebags'; // In production, get from product data
        
        await this.serviceAccountManager.processCustomerOperation(
          'transfer',
          event.toCustomer,
          event.productId,
          productBrand
        );
        
        console.log('Transfer fee processed');
      } catch (error) {
        console.error('Failed to process transfer fee:', error);
      }
      
      // Update blockchain
      // await this.consensusSystem.recordTransfer(event);
      
      // Send notifications to both parties
      this.emit('notification', {
        type: 'transfer_completed',
        customerId: event.fromCustomer,
        data: { ...event, role: 'sender' }
      });
      
      this.emit('notification', {
        type: 'transfer_completed',
        customerId: event.toCustomer,
        data: { ...event, role: 'receiver' }
      });
    });
    
    this.ownershipService.on('product_reported', async (event) => {
      console.log('Product reported:', event);
      
      // Alert network
      // await this.consensusSystem.flagProduct(event);
      
      // Notify relevant parties
      this.emit('alert', {
        type: event.type,
        productId: event.productId,
        data: event
      });
    });
    
    // Recovery events
    this.recoveryService.on('recovery_completed', async (event) => {
      console.log('Recovery completed:', event);
      
      // Restore ownership records
      for (const productId of event.productIds) {
        // Update ownership in blockchain
        // await this.consensusSystem.restoreOwnership(productId, event.customerId);
      }
    });
    
    // Periodic cleanup
    setInterval(() => {
      this.recoveryService.cleanupExpiredTokens();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Start the server
   */
  public async start(port: number = 3002): Promise<void> {
    this.server = this.app.listen(port, () => {
      console.log(`Customer Gateway running on port ${port}`);
      console.log(`Public verification URL: ${process.env.BASE_URL || 'https://verify.luxe-bags.luxury'}`);
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (this.server) {
      // Shutdown service account manager
      this.serviceAccountManager.shutdown();
      
      await new Promise((resolve) => this.server.close(resolve));
      console.log('Customer Gateway stopped');
    }
  }

  /**
   * Get service instances (for testing)
   */
  public getServices() {
    return {
      ownership: this.ownershipService,
      qr: this.qrService,
      recovery: this.recoveryService
    };
  }
}