"use strict";
// Blockchain Proxy Service
// Connects to retailer's backend to perform blockchain operations on behalf of customers
// Uses service account to pay for transactions
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainProxy = void 0;
const axios_1 = __importDefault(require("axios"));
class BlockchainProxy {
    constructor(retailerBackendUrl) {
        this.client = axios_1.default.create({
            baseURL: retailerBackendUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
    /**
     * Initialize connection to retailer backend with service account
     */
    async initialize() {
        try {
            // Login with service account credentials
            const response = await this.client.post('/api/auth/login', {
                email: process.env.SERVICE_ACCOUNT_USERNAME || 'store@luxuryretail.com',
                password: process.env.SERVICE_ACCOUNT_PASSWORD || 'LuxuryRetail2024!'
            });
            this.serviceAccountToken = response.data.token;
            // Set auth header for all future requests
            this.client.defaults.headers.common['Authorization'] = `Bearer ${this.serviceAccountToken}`;
            // Set organization headers for supply chain API auth middleware
            this.client.defaults.headers.common['x-org-id'] = 'luxuryretail';
            this.client.defaults.headers.common['x-user-id'] = 'store-luxuryretail';
            this.client.defaults.headers.common['x-user-role'] = 'user';
            console.log('Service account authenticated successfully');
        }
        catch (error) {
            console.error('Failed to authenticate service account:', error.message);
            throw new Error('Failed to connect to blockchain backend');
        }
    }
    /**
     * Verify product authenticity
     */
    async verifyProduct(productId) {
        try {
            const response = await this.client.get(`/api/supply-chain/products/${productId}`);
            return {
                authentic: true,
                product: response.data,
                verifiedAt: new Date().toISOString()
            };
        }
        catch (error) {
            if (error.response?.status === 404) {
                return {
                    authentic: false,
                    error: 'Product not found',
                    verifiedAt: new Date().toISOString()
                };
            }
            throw error;
        }
    }
    /**
     * Claim ownership of a product (at point of sale)
     */
    async claimOwnership(productId, ownerInfo) {
        try {
            // Generate owner hash from customer info (email/phone)
            const ownerHash = this.generateOwnerHash(ownerInfo);
            // Generate security hash from password and PIN
            const securityHash = this.generateSecurityHash(ownerInfo.password, ownerInfo.pin);
            // Call take-ownership endpoint with security parameters
            // Chaincode expects: productID, ownerHash, securityHash, purchaseLocation
            const response = await this.client.post(`/api/supply-chain/products/${productId}/take-ownership`, {
                ownerHash,
                securityHash,
                purchaseLocation: 'luxuryretail' // Where the purchase happened
            });
            return {
                success: true,
                productId,
                ownershipId: ownerHash,
                claimedAt: new Date().toISOString(),
                ...response.data
            };
        }
        catch (error) {
            console.error('Failed to claim ownership:', error.message);
            throw new Error('Failed to claim product ownership');
        }
    }
    /**
     * Generate transfer code for C2C transfer
     */
    async generateTransferCode(productId, currentOwnerHash, securityHash) {
        try {
            const response = await this.client.post('/api/supply-chain/ownership/transfer/generate', {
                productId,
                currentOwnerHash,
                securityHash // Now requires security verification
            });
            return {
                success: true,
                transferCode: response.data.transferCode,
                expiresAt: response.data.expiresAt,
                productId
            };
        }
        catch (error) {
            console.error('Failed to generate transfer code:', error.message);
            throw new Error('Failed to generate transfer code');
        }
    }
    /**
     * Complete ownership transfer using transfer code
     */
    async completeTransfer(productId, transferCode, newOwnerInfo) {
        try {
            const newOwnerHash = this.generateOwnerHash(newOwnerInfo);
            const newSecurityHash = this.generateSecurityHash(newOwnerInfo.password, newOwnerInfo.pin);
            const response = await this.client.post('/api/supply-chain/ownership/transfer/complete', {
                productId,
                transferCode,
                newOwnerHash,
                newSecurityHash // New owner sets their security credentials
            });
            return {
                success: true,
                productId,
                newOwnershipId: newOwnerHash,
                transferredAt: new Date().toISOString(),
                ...response.data
            };
        }
        catch (error) {
            console.error('Failed to complete transfer:', error.message);
            throw new Error('Failed to complete ownership transfer');
        }
    }
    /**
     * Initiate product return
     */
    async initiateReturn(productId, reason, ownerHash) {
        try {
            const response = await this.client.post(`/api/supply-chain/products/${productId}/customer-return`, {
                reason,
                retailerMSPID: 'LuxuryRetailMSP'
            });
            return {
                success: true,
                returnId: `RETURN-${productId}-${Date.now()}`,
                productId,
                status: 'initiated',
                ...response.data
            };
        }
        catch (error) {
            console.error('Failed to initiate return:', error.message);
            throw new Error('Failed to initiate product return');
        }
    }
    /**
     * Report stolen product
     */
    async reportStolen(productId, ownerHash, policeReportId) {
        try {
            const response = await this.client.post('/api/supply-chain/ownership/report-stolen', {
                productId,
                ownerHash,
                policeReportId: policeReportId || 'PENDING'
            });
            return {
                success: true,
                productId,
                reportedAt: new Date().toISOString(),
                ...response.data
            };
        }
        catch (error) {
            console.error('Failed to report stolen:', error.message);
            throw new Error('Failed to report product as stolen');
        }
    }
    /**
     * Get birth certificate for product
     */
    async getBirthCertificate(productId) {
        try {
            const response = await this.client.get(`/api/supply-chain/ownership/${productId}/birth-certificate`);
            return {
                productId,
                manufacturingDate: response.data.manufacturingDate,
                manufacturer: response.data.manufacturer,
                materials: response.data.materials || [],
                craftsman: response.data.craftsman,
                qualityChecks: response.data.qualityChecks || [],
                authenticityCertificate: response.data.authenticityCertificate
            };
        }
        catch (error) {
            console.error('Failed to get birth certificate:', error.message);
            return null;
        }
    }
    /**
     * Get product supply chain history
     */
    async getProductHistory(productId) {
        try {
            const response = await this.client.get(`/api/supply-chain/products/${productId}/history`);
            return response.data || [];
        }
        catch (error) {
            console.error('Failed to get product history:', error.message);
            return [];
        }
    }
    /**
     * Get products owned by a customer
     */
    async getOwnedProducts(ownerHash) {
        try {
            console.log('BlockchainProxy.getOwnedProducts called with hash:', ownerHash);
            // Query blockchain for products with this owner hash
            const response = await this.client.get('/api/supply-chain/ownership/products', {
                params: { ownerHash }
            });
            console.log('BlockchainProxy.getOwnedProducts response:', response.data);
            return response.data || [];
        }
        catch (error) {
            console.error('Failed to get owned products:', error.message, error.response?.status);
            // Return empty array instead of throwing error
            return [];
        }
    }
    /**
     * Generate hash from customer info (for privacy)
     */
    generateOwnerHash(ownerInfo) {
        const crypto = require('crypto');
        // Use only email or phone for consistent hashing
        // This must match what retailer uses when selling
        const data = (ownerInfo.email || ownerInfo.phone || '').toLowerCase();
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    /**
     * Generate security hash from password and PIN
     */
    generateSecurityHash(password, pin) {
        const crypto = require('crypto');
        if (!password || !pin) {
            throw new Error('Password and PIN are required for security');
        }
        return crypto.createHash('sha256').update(`${password}:${pin}`).digest('hex');
    }
}
exports.BlockchainProxy = BlockchainProxy;
//# sourceMappingURL=blockchain-proxy.js.map