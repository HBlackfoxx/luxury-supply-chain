"use strict";
// Customer Gateway Server
// Single instance that connects to retailer's backend for customer operations
// Customers are NOT on blockchain - this gateway abstracts all complexity
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const ownership_1 = require("./routes/ownership");
const products_1 = require("./routes/products");
const returns_1 = require("./routes/returns");
const blockchain_proxy_1 = require("./services/blockchain-proxy");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.CUSTOMER_GATEWAY_PORT || 3010;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
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
        const blockchainProxy = new blockchain_proxy_1.BlockchainProxy(retailerBackendUrl);
        // Initialize proxy connection with service account
        await blockchainProxy.initialize();
        console.log('✅ Connected to retailer backend');
        // Mount customer routes
        app.use('/api/ownership', (0, ownership_1.createOwnershipRoutes)(blockchainProxy));
        app.use('/api/products', (0, products_1.createProductRoutes)(blockchainProxy));
        app.use('/api/returns', (0, returns_1.createReturnRoutes)(blockchainProxy));
        console.log('✅ Customer routes mounted');
        // Error handling
        app.use((err, req, res, next) => {
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
    }
    catch (error) {
        console.error('Failed to start Customer Gateway:', error);
        process.exit(1);
    }
}
// Start the server
startServer();
//# sourceMappingURL=server.js.map