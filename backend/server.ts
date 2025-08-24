// Backend Server
// Runs separate instances for each organization
// luxebags: 4000, italianleather: 4001, craftworkshop: 4002, luxuryretail: 4003

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { ConsensusSystem } from './consensus/setup-consensus';
import { SupplyChainAPI } from './supply-chain/supply-chain-api';
import { createAuthRoutes } from './auth/auth-routes';
import { AuthService } from './auth/auth-service';
import { createNotificationRoutes } from './api/notification-routes';
import { createStorageRoutes } from './api/storage-routes';
import { createReportRoutes } from './api/report-routes';
import { createAuditRoutes } from './api/audit-routes';
import { createConsensusRoutes } from './consensus/consensus-routes';

dotenv.config();

// Determine organization from environment or default
const organization = process.env.ORGANIZATION || 'luxebags';
const PORT = parseInt(process.env.PORT || '4000');

async function startServer() {
  const app = express();
  
  // Middleware
  app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-org-id', 'x-user-id', 'x-user-role', 'x-requested-with']
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  
  // Serve static files from uploads directory
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  console.log('📁 Serving static files from /uploads directory');

  // Request logging middleware
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`, {
      body: req.body,
      query: req.query,
      headers: req.headers
    });
    next();
  });

  // Health check (basic)
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'healthy',
      organization,
      timestamp: new Date().toISOString()
    });
  });

  // Main API setup
  try {
    console.log('');
    console.log('='.repeat(60));
    console.log(`🚀 Starting ${organization.toUpperCase()} Backend on port ${PORT}`);
    console.log('='.repeat(60));
    
    // Initialize consensus system first (needed for identity manager)
    console.log('⚙️  Initializing consensus system...');
    const brandId = organization;
    const consensusSystem = new ConsensusSystem(brandId);
    const orgId = process.env.ORG_ID || organization;
    const userId = process.env.USER_ID || 'Admin';
    await consensusSystem.initialize(orgId, userId);
    console.log('✅ Consensus system initialized');
    
    // Initialize auth service with identity manager
    console.log('🔐 Setting up authentication...');
    const authService = new AuthService(consensusSystem.getIdentityManager());
    await authService.initialize();
    console.log('✅ Authentication service ready');
    
    // Mount auth routes
    app.use('/api/auth', createAuthRoutes(authService));
    console.log('✅ Authentication API mounted at /api/auth');
    
    // Mount storage routes
    app.use('/api/storage', createStorageRoutes());
    console.log('✅ Storage API mounted at /api/storage');
    
    // Mount notification routes
    app.use('/api/notifications', createNotificationRoutes());
    console.log('✅ Notification API mounted at /api/notifications');
    
    // Mount report routes
    const pool = authService.getPool();
    if (pool) {
      app.use('/api/reports', createReportRoutes(pool));
      console.log('✅ Report API mounted at /api/reports');
      
      // Mount audit routes
      app.use('/api/audit', createAuditRoutes(pool));
      console.log('✅ Audit API mounted at /api/audit');

      // Mount consensus routes using ConsensusEngine (new implementation)
      app.use('/api/consensus', createConsensusRoutes(pool));
    } else {
      console.warn('⚠️  Database pool not available, some routes disabled');
    }
    console.log('✅ Consensus routes mounted at /api/consensus');

    // Initialize and mount supply chain API
    console.log('📦 Setting up supply chain API...');
    const supplyChainAPI = new SupplyChainAPI(
      consensusSystem.getGatewayManager(),
      consensusSystem.getTransactionHandler()
    );
    await supplyChainAPI.initialize(orgId, userId);
    app.use('/api/supply-chain', supplyChainAPI.getRouter());
    console.log('✅ Supply chain API mounted at /api/supply-chain');

    // Add dashboard stats endpoint (required by COMPLETE_FLOW_SCENARIOS)
    app.get('/api/dashboard/stats', async (_req, res) => {
      try {
        // This would query blockchain for real stats
        // For now, return basic structure
        res.json({
          products: {
            total: 0,
            available: 0,
            sold: 0
          },
          batches: {
            total: 0,
            inProduction: 0,
            completed: 0
          },
          transfers: {
            pending: 0,
            completed: 0,
            disputed: 0
          },
          trustScore: {
            average: 0.95,
            trend: 'stable'
          }
        });
      } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
      }
    });

    // Error handling middleware
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('API Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });

    // Start server
    app.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log(`🎉 ${organization.toUpperCase()} Backend is running!`);
      console.log('='.repeat(60));
      console.log(`📡 API Server: http://localhost:${PORT}`);
      console.log(`🏢 Organization: ${organization}`);
      console.log(`👤 User: ${userId}`);
      console.log('');
      console.log('Available endpoints:');
      console.log('  /api/auth         - Authentication');
      console.log('  /api/supply-chain - Supply chain operations');
      console.log('  /api/consensus    - 2-Check consensus');
      console.log('  /api/notifications - Notifications');
      console.log('  /api/storage      - File storage');
      console.log('  /api/reports      - Reports');
      console.log('  /api/audit        - Audit logs');
      console.log('  /api/dashboard/stats - Dashboard statistics');
      console.log('='.repeat(60));
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n⚠️  Shutting down gracefully...');
      await consensusSystem.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n⚠️  Shutting down gracefully...');
      await consensusSystem.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();