"use strict";
// Customer Ownership Routes
// Handles ownership claims, transfers, and stolen product reports
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOwnershipRoutes = createOwnershipRoutes;
const express_1 = require("express");
function createOwnershipRoutes(blockchainProxy) {
    const router = (0, express_1.Router)();
    /**
     * Claim ownership of a product (at point of sale)
     * Customer provides email/phone, NOT blockchain identity
     */
    router.post('/claim', async (req, res) => {
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
        }
        catch (error) {
            console.error('Error claiming ownership:', error);
            res.status(500).json({
                error: error.message || 'Failed to claim ownership'
            });
        }
    });
    /**
     * Generate transfer code for C2C transfer
     */
    router.post('/transfer/generate', async (req, res) => {
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
        }
        catch (error) {
            console.error('Error generating transfer code:', error);
            res.status(500).json({
                error: error.message || 'Failed to generate transfer code'
            });
        }
    });
    /**
     * Complete ownership transfer using transfer code
     */
    router.post('/transfer/complete', async (req, res) => {
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
        }
        catch (error) {
            console.error('Error completing transfer:', error);
            res.status(500).json({
                error: error.message || 'Failed to complete transfer'
            });
        }
    });
    /**
     * Report product as stolen
     */
    router.post('/report-stolen', async (req, res) => {
        try {
            const { productId, email, phone, policeReportId } = req.body;
            if (!productId || (!email && !phone)) {
                return res.status(400).json({
                    error: 'Product ID and owner credentials required'
                });
            }
            const crypto = require('crypto');
            const ownerHash = crypto.createHash('sha256')
                .update((email || phone || '').toLowerCase())
                .digest('hex');
            const result = await blockchainProxy.reportStolen(productId, ownerHash, policeReportId);
            res.json({
                success: true,
                message: 'Product reported as stolen',
                ...result
            });
        }
        catch (error) {
            console.error('Error reporting stolen:', error);
            res.status(500).json({
                error: error.message || 'Failed to report product as stolen'
            });
        }
    });
    /**
     * Get products owned by a customer
     */
    router.get('/products', async (req, res) => {
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
        }
        catch (error) {
            console.error('Error fetching owned products:', error);
            res.status(500).json({
                error: error.message || 'Failed to fetch owned products'
            });
        }
    });
    return router;
}
//# sourceMappingURL=ownership.js.map