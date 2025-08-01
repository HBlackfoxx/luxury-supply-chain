// backend/server.ts
// Main server that runs all backend services

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ConsensusSystem } from './consensus/setup-consensus';
import { ConsensusAPI } from './consensus/api/consensus-api';
// import { CustomerGateway } from './customer/customer-gateway';
import { AuthService } from './auth/auth-service';
import { createAuthRoutes } from './auth/auth-routes';
import { IdentityManager } from './gateway/src/fabric/identity-manager';
import { SDKConfigManager } from './gateway/src/config/sdk-config';

dotenv.config();

async function main() {
  const app = express();
  const PORT = process.env.PORT || 4000;
  const brandId = process.env.BRAND_ID || 'luxebags';

  // Middleware
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Add request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      services: {
        consensus: 'active',
        customer: 'active',
        fabric: 'connected'
      },
      timestamp: new Date().toISOString()
    });
  });

  try {
    console.log('🚀 Starting Luxury Supply Chain Backend Services...');
    console.log(`📦 Brand ID: ${brandId}`);

    // Initialize identity manager for auth
    console.log('🔐 Setting up authentication...');
    const configManager = new SDKConfigManager(brandId);
    const identityManager = new IdentityManager(configManager);
    const authService = new AuthService(identityManager);
    
    // Initialize Fabric identities
    await authService.initializeFabricIdentities();
    
    // Mount auth routes
    app.use('/api/auth', createAuthRoutes(authService));
    console.log('✅ Authentication API mounted at /api/auth');

    // Initialize consensus system
    console.log('⚙️  Initializing consensus system...');
    const consensusSystem = new ConsensusSystem(brandId);
    const orgId = process.env.ORG_ID || 'luxebags';
    const userId = process.env.USER_ID || 'admin';
    await consensusSystem.initialize(orgId, userId);
    console.log('✅ Consensus system initialized');

    // Initialize and mount consensus API
    console.log('🔌 Setting up consensus API...');
    const consensusAPI = new ConsensusAPI(consensusSystem);
    app.use('/api/consensus', consensusAPI.getRouter());
    console.log('✅ Consensus API mounted at /api/consensus');

    // Initialize customer gateway (it has its own routes internally)
    // console.log('👤 Setting up customer gateway...');
    // const customerGateway = new CustomerGateway(consensusSystem);
    // // The customer gateway runs on a separate port (3002 by default)
    // await customerGateway.start(3002);
    // console.log('✅ Customer Gateway running on port 3002');

    // Error handling middleware
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
      console.log('🎉 Luxury Supply Chain Backend is running!');
      console.log('='.repeat(60));
      console.log(`📡 B2B API Server: http://localhost:${PORT}`);
      // console.log(`👤 Customer Gateway: http://localhost:3002`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log('');
      console.log('📚 Available API endpoints:');
      console.log(`   B2B Consensus API: http://localhost:${PORT}/api/consensus`);
      // console.log(`   Customer API: http://localhost:3002/api/customer`);
      console.log('');
      console.log('🔐 Default test credentials for B2B:');
      console.log('   - Organizations: luxebags, italianleather, craftworkshop, luxuryretail');
      console.log('   - Auth headers: x-org-id, x-user-id, x-user-role');
      console.log('='.repeat(60));
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      await consensusSystem.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      await consensusSystem.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main().catch(console.error);