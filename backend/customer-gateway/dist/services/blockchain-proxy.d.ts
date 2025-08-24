export declare class BlockchainProxy {
    private client;
    private serviceAccountToken?;
    constructor(retailerBackendUrl: string);
    /**
     * Initialize connection to retailer backend with service account
     */
    initialize(): Promise<void>;
    /**
     * Verify product authenticity
     */
    verifyProduct(productId: string): Promise<any>;
    /**
     * Claim ownership of a product (at point of sale)
     */
    claimOwnership(productId: string, ownerInfo: any): Promise<any>;
    /**
     * Generate transfer code for C2C transfer
     */
    generateTransferCode(productId: string, currentOwnerHash: string, securityHash: string): Promise<any>;
    /**
     * Complete ownership transfer using transfer code
     */
    completeTransfer(productId: string, transferCode: string, newOwnerInfo: any): Promise<any>;
    /**
     * Initiate product return
     */
    initiateReturn(productId: string, reason: string, ownerHash: string): Promise<any>;
    /**
     * Report stolen product
     */
    reportStolen(productId: string, ownerHash: string, policeReportId?: string): Promise<any>;
    /**
     * Get birth certificate for product
     */
    getBirthCertificate(productId: string): Promise<any>;
    /**
     * Get product supply chain history
     */
    getProductHistory(productId: string): Promise<any[]>;
    /**
     * Get products owned by a customer
     */
    getOwnedProducts(ownerHash: string): Promise<any[]>;
    /**
     * Generate hash from customer info (for privacy)
     */
    private generateOwnerHash;
    /**
     * Generate security hash from password and PIN
     */
    private generateSecurityHash;
}
//# sourceMappingURL=blockchain-proxy.d.ts.map