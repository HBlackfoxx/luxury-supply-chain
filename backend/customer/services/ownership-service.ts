// backend/customer/services/ownership-service.ts
// Service for managing product ownership

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { 
  Customer, 
  OwnedProduct, 
  OwnershipClaim, 
  TransferRequest, 
  VerificationResult 
} from '../types';

export class OwnershipService extends EventEmitter {
  private ownedProducts: Map<string, OwnedProduct> = new Map();
  private customerProducts: Map<string, Set<string>> = new Map();
  private pendingTransfers: Map<string, TransferRequest> = new Map();

  constructor() {
    super();
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Add some test products
    const testProduct: OwnedProduct = {
      productId: 'LB-2024-001',
      brand: 'LuxeBags',
      model: 'Classic Tote',
      serialNumber: 'CT-001-2024',
      purchaseDate: new Date('2024-01-15'),
      purchaseLocation: 'LuxeBags Boutique Milano',
      currentOwner: this.hashCustomerId('customer@example.com'),
      ownershipStatus: 'active',
      verificationCount: 5,
      lastVerified: new Date()
    };
    
    this.ownedProducts.set(testProduct.productId, testProduct);
  }

  /**
   * Claim ownership of a product
   */
  public async claimOwnership(
    customerId: string,
    claim: OwnershipClaim
  ): Promise<OwnedProduct> {
    console.log(`Processing ownership claim for product ${claim.productId}`);
    
    // Check if product exists and is unclaimed
    const product = await this.getProductInfo(claim.productId);
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    if (product.currentOwner && product.ownershipStatus === 'active') {
      throw new Error('Product already has an active owner');
    }
    
    // Validate claim based on method
    switch (claim.claimMethod) {
      case 'purchase':
        if (!claim.purchaseReceipt) {
          throw new Error('Purchase receipt required');
        }
        // In production, validate receipt with retailer
        break;
        
      case 'transfer':
        if (!claim.transferCode) {
          throw new Error('Transfer code required');
        }
        await this.validateTransferCode(claim.productId, claim.transferCode);
        break;
        
      case 'gift':
        // Additional validation for gifts
        break;
    }
    
    // Update ownership
    const hashedCustomerId = this.hashCustomerId(customerId);
    product.currentOwner = hashedCustomerId;
    product.ownershipStatus = 'active';
    product.purchaseDate = claim.timestamp;
    product.purchaseLocation = claim.location;
    
    // Store the updated product
    this.ownedProducts.set(product.productId, product);
    
    // Track customer's products
    if (!this.customerProducts.has(hashedCustomerId)) {
      this.customerProducts.set(hashedCustomerId, new Set());
    }
    this.customerProducts.get(hashedCustomerId)!.add(product.productId);
    
    // Emit event
    this.emit('ownership_claimed', {
      customerId,
      productId: product.productId,
      method: claim.claimMethod,
      timestamp: new Date()
    });
    
    return product;
  }

  /**
   * Generate transfer code for a product
   */
  public async generateTransferCode(
    customerId: string,
    productId: string,
    reason: string
  ): Promise<string> {
    const product = await this.getProductByOwner(productId, customerId);
    
    if (!product) {
      throw new Error('Product not found or you are not the owner');
    }
    
    // Generate secure transfer code
    const transferCode = this.generateSecureCode();
    const expiryTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    
    // Update product with transfer code
    product.transferCode = transferCode;
    product.transferCodeExpiry = expiryTime;
    this.ownedProducts.set(productId, product);
    
    // Create transfer request
    const transferRequest: TransferRequest = {
      productId,
      fromCustomer: customerId,
      reason: reason as any,
      transferCode,
      timestamp: new Date()
    };
    
    this.pendingTransfers.set(transferCode, transferRequest);
    
    // Emit event
    this.emit('transfer_initiated', {
      productId,
      fromCustomer: customerId,
      transferCode,
      expiryTime
    });
    
    return transferCode;
  }

  /**
   * Complete ownership transfer
   */
  public async transferOwnership(
    toCustomerId: string,
    transferCode: string
  ): Promise<OwnedProduct> {
    const transfer = this.pendingTransfers.get(transferCode);
    
    if (!transfer) {
      throw new Error('Invalid transfer code');
    }
    
    const product = this.ownedProducts.get(transfer.productId);
    
    if (!product) {
      throw new Error('Product not found');
    }
    
    // Check if code is expired
    if (product.transferCodeExpiry && product.transferCodeExpiry < new Date()) {
      throw new Error('Transfer code has expired');
    }
    
    // Update ownership
    const previousOwner = product.currentOwner;
    const newOwnerHash = this.hashCustomerId(toCustomerId);
    
    product.currentOwner = newOwnerHash;
    product.transferCode = undefined;
    product.transferCodeExpiry = undefined;
    product.ownershipStatus = 'active';
    
    this.ownedProducts.set(product.productId, product);
    
    // Update customer product mappings
    const prevOwnerProducts = this.customerProducts.get(previousOwner);
    if (prevOwnerProducts) {
      prevOwnerProducts.delete(product.productId);
    }
    
    if (!this.customerProducts.has(newOwnerHash)) {
      this.customerProducts.set(newOwnerHash, new Set());
    }
    this.customerProducts.get(newOwnerHash)!.add(product.productId);
    
    // Clean up
    this.pendingTransfers.delete(transferCode);
    
    // Emit event
    this.emit('transfer_completed', {
      productId: product.productId,
      fromCustomer: transfer.fromCustomer,
      toCustomer: toCustomerId,
      timestamp: new Date()
    });
    
    return product;
  }

  /**
   * Report product as stolen or lost
   */
  public async reportStolen(
    customerId: string,
    productId: string,
    details: {
      type: 'stolen' | 'lost';
      location?: string;
      policeReport?: string;
      description: string;
    }
  ): Promise<void> {
    const product = await this.getProductByOwner(productId, customerId);
    
    if (!product) {
      throw new Error('Product not found or you are not the owner');
    }
    
    // Update status
    product.ownershipStatus = details.type;
    this.ownedProducts.set(productId, product);
    
    // Emit alert
    this.emit('product_reported', {
      productId,
      customerId,
      type: details.type,
      details,
      timestamp: new Date()
    });
    
    // In production, this would also:
    // - Notify law enforcement APIs
    // - Flag product in verification systems
    // - Alert network participants
  }

  /**
   * Get customer's owned products
   */
  public async getCustomerProducts(customerId: string): Promise<OwnedProduct[]> {
    const hashedId = this.hashCustomerId(customerId);
    const productIds = this.customerProducts.get(hashedId) || new Set();
    
    const products: OwnedProduct[] = [];
    for (const productId of productIds) {
      const product = this.ownedProducts.get(productId);
      if (product) {
        products.push(this.sanitizeProduct(product));
      }
    }
    
    return products;
  }

  /**
   * Verify product authenticity
   */
  public async verifyProduct(
    productId: string,
    verifierId?: string
  ): Promise<VerificationResult> {
    const product = this.ownedProducts.get(productId);
    
    if (!product) {
      return {
        isAuthentic: false,
        productId,
        brand: 'Unknown',
        model: 'Unknown',
        verificationHistory: 0,
        alerts: ['Product not found in system']
      };
    }
    
    // Update verification count
    product.verificationCount++;
    product.lastVerified = new Date();
    this.ownedProducts.set(productId, product);
    
    // Determine ownership status for verifier
    let currentOwner: 'you' | 'someone_else' | 'unclaimed' = 'someone_else';
    
    if (!product.currentOwner) {
      currentOwner = 'unclaimed';
    } else if (verifierId && product.currentOwner === this.hashCustomerId(verifierId)) {
      currentOwner = 'you';
    }
    
    // Check for alerts
    const alerts: string[] = [];
    if (product.ownershipStatus === 'stolen') {
      alerts.push('⚠️ This product has been reported as stolen');
    }
    if (product.ownershipStatus === 'lost') {
      alerts.push('⚠️ This product has been reported as lost');
    }
    
    return {
      isAuthentic: true,
      productId: product.productId,
      brand: product.brand,
      model: product.model,
      currentOwner,
      ownershipStatus: product.ownershipStatus,
      verificationHistory: product.verificationCount,
      lastVerified: product.lastVerified,
      alerts
    };
  }

  /**
   * Helper methods
   */
  private hashCustomerId(customerId: string): string {
    return crypto.createHash('sha256').update(customerId).digest('hex');
  }
  
  private generateSecureCode(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
  }
  
  private async validateTransferCode(productId: string, code: string): Promise<void> {
    const product = this.ownedProducts.get(productId);
    
    if (!product || product.transferCode !== code) {
      throw new Error('Invalid transfer code');
    }
    
    if (product.transferCodeExpiry && product.transferCodeExpiry < new Date()) {
      throw new Error('Transfer code has expired');
    }
  }
  
  private async getProductInfo(productId: string): Promise<OwnedProduct | null> {
    // In production, this would query the blockchain
    return this.ownedProducts.get(productId) || null;
  }
  
  private async getProductByOwner(
    productId: string, 
    customerId: string
  ): Promise<OwnedProduct | null> {
    const product = this.ownedProducts.get(productId);
    const hashedId = this.hashCustomerId(customerId);
    
    if (product && product.currentOwner === hashedId) {
      return product;
    }
    
    return null;
  }
  
  private sanitizeProduct(product: OwnedProduct): OwnedProduct {
    // Remove sensitive data like transfer codes
    const { transferCode, transferCodeExpiry, ...sanitized } = product;
    return sanitized as OwnedProduct;
  }
}