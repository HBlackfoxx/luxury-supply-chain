// Customer Gateway Server
// Single instance that connects to retailer's backend for customer operations
// Customers are NOT on blockchain - this gateway abstracts all complexity

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createOwnershipRoutes } from './routes/ownership';
import { createProductRoutes } from './routes/products';
import { createReturnRoutes } from './routes/returns';
import { BlockchainProxy } from './services/blockchain-proxy';

dotenv.config();

const app = express();
const PORT = process.env.CUSTOMER_GATEWAY_PORT || 3010;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'customer-gateway',
    timestamp: new Date().toISOString()
  });
});

async function startServer() {
  try {
    console.log('🚀 Starting Customer Gateway...');
    
    // Initialize blockchain proxy to connect to retailer backend
    const retailerBackendUrl = process.env.RETAILER_BACKEND_URL || 'http://localhost:4003';
    const blockchainProxy = new BlockchainProxy(retailerBackendUrl);
    
    // Initialize proxy connection with service account
    await blockchainProxy.initialize();
    console.log('✅ Connected to retailer backend');
    
    // Mount customer routes
    app.use('/api/ownership', createOwnershipRoutes(blockchainProxy));
    app.use('/api/products', createProductRoutes(blockchainProxy));
    app.use('/api/returns', createReturnRoutes(blockchainProxy));
    
    console.log('✅ Customer routes mounted');
    
    // Error handling
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Customer Gateway Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
    
    // Start server
    app.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(60));
      console.log('🎉 Customer Gateway is running!');
      console.log('='.repeat(60));
      console.log(`📡 Customer API: http://localhost:${PORT}`);
      console.log(`🔗 Connected to Retailer: ${retailerBackendUrl}`);
      console.log('');
      console.log('Available endpoints:');
      console.log('  POST /api/ownership/claim       - Claim product ownership');
      console.log('  POST /api/ownership/transfer    - Transfer to another customer');
      console.log('  GET  /api/products/verify/:id   - Verify product authenticity');
      console.log('  POST /api/returns/initiate      - Start return process');
      console.log('='.repeat(60));
    });
    
  } catch (error) {
    console.error('Failed to start Customer Gateway:', error);
    process.exit(1);
  }
}

// Start the server
startServer();