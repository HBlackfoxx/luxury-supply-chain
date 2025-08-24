// backend/supply-chain/supply-chain-api.ts
// REST API endpoints for luxury supply chain product management

import express, { Router, Request, Response, NextFunction } from 'express';
import { GatewayManager } from '../gateway/src/fabric/gateway-manager';
import { TransactionHandler } from '../gateway/src/fabric/transaction-handler';
import { Contract } from '@hyperledger/fabric-gateway';
import { qrService } from '../services/qr-service';

export interface ApiRequest extends Request {
  user?: {
    id: string;
    organization: string;
    role: string;
  };
}

export class SupplyChainAPI {
  private router: Router;
  private gatewayManager: GatewayManager;
  private transactionHandler: TransactionHandler;
  private userContracts: Map<string, { supply: Contract; consensus: Contract; ownership: Contract }> = new Map();

  constructor(gatewayManager: GatewayManager, transactionHandler: TransactionHandler) {
    this.router = express.Router();
    this.gatewayManager = gatewayManager;
    this.transactionHandler = transactionHandler;
    this.setupRoutes();
  }

  /**
   * Initialize the contracts - just a placeholder now
   */
  public async initialize(orgId: string, userId: string): Promise<void> {
    // No longer initialize contracts here - will do per-request
    console.log('✅ Supply chain API initialized');
  }

  /**
   * Get contracts for the current user
   */
  private async getContractsForUser(orgId: string, userId: string): Promise<{ supply: Contract; consensus: Contract; ownership: Contract }> {
    // Map database user ID to Fabric identity
    // user1-luxebags -> User1, admin-luxebags -> Admin, etc.
    let fabricUserId = 'User1'; // Default
    
    if (userId.includes('admin')) {
      fabricUserId = 'Admin';
    } else if (userId.includes('user1')) {
      fabricUserId = 'User1';
    } else if (userId.includes('user2')) {
      fabricUserId = 'User2';
    }
    
    const key = `${orgId}-${fabricUserId}`;
    
    // Check cache
    if (this.userContracts.has(key)) {
      return this.userContracts.get(key)!;
    }

    try {
      // Connect with the user's Fabric identity
      const gateway = await this.gatewayManager.connect({ orgId, userId: fabricUserId });
      const network = gateway.getNetwork('luxury-supply-chain');
      
      // Get all contracts (using actual deployed chaincode names)
      const contracts = {
        supply: network.getContract('luxury-supply-chain'),
        consensus: network.getContract('2check-consensus'),
        ownership: network.getContract('luxury-supply-chain', 'OwnershipContract')
      };
      
      // Cache for reuse
      this.userContracts.set(key, contracts);
      console.log(`Contracts loaded for ${fabricUserId}@${orgId}`);
      
      return contracts;
    } catch (error) {
      console.error(`Failed to get contracts for ${fabricUserId}@${orgId}:`, error);
      throw error;
    }
  }

  /**
   * Get Express router
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Helper function to convert organization name to MSP ID
   */
  private orgToMspId(org: string): string {
    // If already has MSP suffix, return as is
    if (org.endsWith('MSP')) {
      return org;
    }
    
    // Map organization names to MSP IDs
    switch(org.toLowerCase()) {
      case 'luxebags': return 'LuxeBagsMSP';
      case 'italianleather': return 'ItalianLeatherMSP';
      case 'craftworkshop': return 'CraftWorkshopMSP';
      case 'luxuryretail': return 'LuxuryRetailMSP';
      default: 
        // Capitalize first letter and add MSP
        return org.charAt(0).toUpperCase() + org.slice(1).toLowerCase() + 'MSP';
    }
  }

  /**
   * Setup all routes based on supply chain flow
   */
  private setupRoutes(): void {
    // Middleware
    this.router.use(this.authMiddleware.bind(this));

    // === SUPPLIER ROUTES (Italian Leather) ===
    // Create and manage materials
    this.router.post('/materials', this.createMaterial.bind(this));
    this.router.post('/materials/transfer', this.transferMaterialToManufacturer.bind(this));
    this.router.post('/materials/:id/confirm-receipt', this.confirmMaterialReceipt.bind(this));
    
    // === MANUFACTURER ROUTES (Craft Workshop) ===
    // Create products from materials
    this.router.post('/products', this.createProduct.bind(this));
    this.router.post('/products/:id/materials', this.addMaterialToProduct.bind(this));
    // Quality checkpoints removed - quality is now implicit in 2-check consensus
    this.router.post('/products/:id/complete', this.completeProduct.bind(this));
    
    // Batch operations
    this.router.post('/batches', this.createBatch.bind(this));
    this.router.post('/batches/transfer', this.transferBatch.bind(this));
    this.router.put('/batches/:id/location', this.updateBatchLocation.bind(this));
    this.router.get('/batches', this.getAllBatches.bind(this));
    this.router.get('/batches/:id', this.getBatch.bind(this));
    this.router.get('/batches/:id/products', this.getBatchProducts.bind(this));
    
    // === B2B TRANSFER ROUTES (All organizations) ===
    // Transfer between organizations (supplier->manufacturer, manufacturer->retailer)
    this.router.post('/transfer/initiate', this.initiateB2BTransfer.bind(this));
    this.router.post('/transfer/:id/confirm-sent', this.confirmSent.bind(this));
    this.router.post('/transfer/:id/confirm-received', this.confirmReceived.bind(this));
    this.router.post('/transfer/:id/dispute', this.raiseDispute.bind(this));
    
    // === RETAILER ROUTES (Luxury Retail) ===
    // Manage retail operations
    this.router.post('/products/:id/retail', this.markForRetail.bind(this));
    this.router.post('/products/:id/sell', this.sellToCustomer.bind(this));
    this.router.post('/products/:id/take-ownership', this.takeOwnership.bind(this));
    this.router.post('/products/:id/customer-return', this.processCustomerReturn.bind(this));
    this.router.post('/products/:id/birth-certificate', this.createBirthCertificate.bind(this));
    this.router.post('/products/:id/service-record', this.addServiceRecord.bind(this));
    
    // === OWNERSHIP ROUTES ===
    this.router.post('/ownership/transfer/generate', this.generateTransferCode.bind(this));
    this.router.post('/ownership/transfer/complete', this.transferOwnership.bind(this));
    this.router.post('/ownership/report-stolen', this.reportStolen.bind(this));
    this.router.post('/ownership/recover', this.recoverStolen.bind(this));
    this.router.get('/ownership/stolen', this.getStolenProducts.bind(this)); // Must be before :productId route
    this.router.get('/ownership/products', this.getProductsByOwner.bind(this)); // Must be before :productId route
    this.router.get('/ownership/:productId', this.getOwnership.bind(this));
    this.router.get('/ownership/:productId/history', this.getOwnershipHistory.bind(this));
    this.router.get('/ownership/:productId/birth-certificate', this.getBirthCertificate.bind(this));
    
    // === DISPUTE RESOLUTION ROUTES ===
    this.router.post('/dispute/:disputeId/create-return', this.createReturnTransferAfterDispute.bind(this));
    this.router.post('/transfer/:transferId/process-return', this.processReturn.bind(this));
    
    // === QUERY ROUTES (All organizations) ===
    this.router.get('/products', this.getProducts.bind(this));
    this.router.get('/products/:id', this.getProduct.bind(this));
    this.router.get('/products/:id/history', this.getProductHistory.bind(this));
    this.router.get('/products/:id/service-records', this.getServiceRecords.bind(this));
    this.router.get('/transfers/pending', this.getPendingTransfers.bind(this));
    this.router.get('/transfers/returns', this.getReturnTransfers.bind(this));
    this.router.get('/transfer/:id/status', this.getTransferStatus.bind(this));
    this.router.get('/materials', this.getMaterials.bind(this));
    this.router.get('/transactions/history', this.getTransactionHistory.bind(this));
    
    // === TRUST & DASHBOARD ROUTES ===
    this.router.get('/trust/:organizationId', this.getTrustScore.bind(this));
    this.router.get('/dashboard/stats', this.getDashboardStats.bind(this));
  }

  /**
   * Auth middleware
   */
  private authMiddleware(req: ApiRequest, res: Response, next: NextFunction): void {
    const orgId = req.headers['x-org-id'] as string;
    const userId = req.headers['x-user-id'] as string;
    const userRole = req.headers['x-user-role'] as string;

    if (!orgId || !userId) {
      res.status(401).json({ error: 'Missing authentication headers' });
      return;
    }

    req.user = {
      id: userId,
      organization: orgId,
      role: userRole || 'user'
    };

    next();
  }

  // ============= SUPPLIER FUNCTIONS =============

  /**
   * Create material (Supplier only - e.g., Italian Leather)
   */
  private async createMaterial(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Only suppliers can create materials
      if (req.user?.organization !== 'italianleather') {
        res.status(403).json({ error: 'Only suppliers can create materials' });
        return;
      }

      const { materialId, type, source, batch, quality, quantity } = req.body;

      if (!materialId || !type || !source || !batch || !quantity) {
        res.status(400).json({ error: 'Missing required material fields' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Create material inventory on blockchain
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:CreateMaterialInventory',
        {
          arguments: [
            materialId,
            type,
            batch,
            quantity.toString()
          ]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        materialId,
        message: 'Material inventory created successfully'
      });
    } catch (error) {
      console.error('Error creating material:', error);
      res.status(500).json({ error: 'Failed to create material' });
    }
  }

  /**
   * Transfer material to manufacturer
   */
  private async transferMaterialToManufacturer(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { materialId, manufacturer, quantity } = req.body;

      if (!materialId || !manufacturer || !quantity) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const transferId = `MAT-TRANSFER-${Date.now()}`;

      // Map manufacturer organization name to MSP ID
      const manufacturerMspId = this.orgToMspId(manufacturer);

      // Transfer material inventory on blockchain
      console.log('Transferring material:', { transferId, materialId, manufacturerMspId, quantity });
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:TransferMaterialInventory',
        {
          arguments: [
            transferId,
            materialId,
            manufacturerMspId,
            quantity.toString()
          ]
        }
      );

      if (!result.success) {
        console.error('Material transfer failed:', result.error);
        res.status(500).json({ error: result.error || 'Failed to transfer material' });
        return;
      }

      // Note: Consensus submission is already handled internally by TransferMaterialInventory chaincode function

      res.json({
        success: true,
        transferId,
        message: 'Material transfer initiated. Awaiting manufacturer confirmation.'
      });
    } catch (error: any) {
      console.error('Error transferring material:', error);
      console.error('Error details:', error.message || error);
      res.status(500).json({ error: error.message || 'Failed to transfer material' });
    }
  }

  /**
   * Confirm material receipt (Manufacturer)
   */
  private async confirmMaterialReceipt(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: materialId } = req.params;
      const { transferId } = req.body;

      console.log('Confirming material receipt:', { 
        materialId, 
        transferId, 
        user: req.user?.organization,
        body: req.body 
      });

      if (!transferId) {
        console.error('Missing transfer ID in request body');
        res.status(400).json({ error: 'Missing transfer ID' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Check if this is a return transfer from dispute resolution
      let result;
      if (transferId.includes('-RESOLUTION-')) {
        console.log('This is a return transfer from dispute resolution, handling specially');
        
        // For return transfers, call a special chaincode function that handles missing inventory
        result = await this.transactionHandler.submitTransaction(
          contracts.supply,
          'SupplyChainContract:ConfirmReturnTransferReceived',
          {
            arguments: [transferId, materialId || 'unknown']
          }
        );
      } else {
        // Regular material transfer
        console.log('Calling ConfirmMaterialReceived with:', { transferId, materialId });
        result = await this.transactionHandler.submitTransaction(
          contracts.supply,
          'SupplyChainContract:ConfirmMaterialReceived',
          {
            arguments: [transferId, materialId]
          }
        );
      }

      if (!result.success) {
        console.error('Failed to confirm material receipt:', result.error);
        res.status(500).json({ error: result.error || 'Failed to confirm material receipt' });
        return;
      }

      // Note: Consensus confirmation is already handled internally by ConfirmMaterialReceived chaincode function

      res.json({
        success: true,
        message: 'Material receipt confirmed'
      });
    } catch (error: any) {
      console.error('Error confirming material receipt:', error);
      console.error('Error details:', error.message || error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({ error: error.message || 'Failed to confirm material receipt' });
    }
  }

  // ============= MANUFACTURER FUNCTIONS =============

  /**
   * Create product (Manufacturer only - e.g., Craft Workshop)
   */
  private async createProduct(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Only manufacturers can create products
      if (req.user?.organization !== 'craftworkshop') {
        res.status(403).json({ error: 'Only manufacturers can create products' });
        return;
      }

      const { brand, name, type, serialNumber, materials } = req.body;
      // Use a deterministic ID that won't vary between peers
      const timestamp = Math.floor(Date.now() / 1000); // Use seconds for less variation
      const productId = `${brand.toUpperCase()}-${type.toUpperCase()}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
      const finalSerialNumber = serialNumber || `SN-${timestamp}`;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Create product on blockchain
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:CreateProduct',
        {
          arguments: [productId, brand, name, type, finalSerialNumber]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Add materials if provided
      if (materials && Array.isArray(materials)) {
        for (const material of materials) {
          await this.transactionHandler.submitTransaction(
            contracts.supply,
            'SupplyChainContract:AddMaterial',
            {
              arguments: [
                productId,
                material.id,
                material.type,
                material.source,
                material.supplier,
                material.batch,
                material.verification || 'verified'
              ]
            }
          );
        }
      }

      // Generate QR code for the product
      let qrCode = null;
      try {
        const qrResult = await qrService.generateProductQR(
          productId,
          serialNumber || `SN-${Date.now()}`,
          brand
        );
        qrCode = {
          url: qrResult.storedPath,
          dataUrl: qrResult.dataUrl
        };
        console.log(`✅ QR code generated for product ${productId}`);
      } catch (error) {
        console.error('Failed to generate QR code:', error);
        // Continue without QR code - don't fail the product creation
      }

      res.json({
        success: true,
        productId,
        qrCode,
        message: 'Product created successfully'
      });
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  }

  /**
   * Create batch of products (Manufacturer only)
   */
  private async createBatch(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Only manufacturers can create batches
      if (req.user?.organization !== 'craftworkshop') {
        res.status(403).json({ error: 'Only manufacturers can create batches' });
        return;
      }

      const { brand, productType, quantity, materialIds, materials } = req.body;

      // Prepare materials with quantities
      // Materials should come from UI with id and quantity
      let materialsToUse: any[] = [];
      
      if (materials && materials.length > 0) {
        // Materials already have id and quantity from UI
        materialsToUse = materials;
      } else if (materialIds && materialIds.length > 0) {
        // Fallback for old format (shouldn't be used)
        console.warn('Using deprecated materialIds format, should use materials with quantities');
        materialsToUse = materialIds.map((id: string) => ({ id, quantity: 1 }));
      }

      if (!brand || !productType || !quantity) {
        res.status(400).json({ error: 'Missing required batch fields: brand, productType, quantity' });
        return;
      }

      const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Create batch on blockchain
      // Chaincode expects: batchID, brand, productType, quantity (int), materials (JSON string with id and quantity)
      console.log('Creating batch with materials:', materialsToUse);
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:CreateBatch',
        {
          arguments: [
            batchId,
            brand,
            productType,
            quantity.toString(),
            JSON.stringify(materialsToUse)
          ]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Generate QR codes for all products in the batch
      const productIds = [];
      for (let i = 1; i <= quantity; i++) {
        const productId = `${batchId}-P${String(i).padStart(4, '0')}`;
        productIds.push(productId);
        
        // Generate QR code for each product
        try {
          const serialNumber = `${batchId}-${String(i).padStart(4, '0')}`;
          await qrService.generateProductQR(
            productId,
            serialNumber,
            brand
          );
          console.log(`✅ QR code generated for batch product ${productId}`);
        } catch (error) {
          console.error(`Failed to generate QR code for ${productId}:`, error);
        }
      }

      res.json({
        success: true,
        batchId,
        productIds,
        message: `Batch of ${quantity} products created successfully with QR codes`
      });
    } catch (error) {
      console.error('Error creating batch:', error);
      res.status(500).json({ error: 'Failed to create batch' });
    }
  }

  /**
   * Transfer batch to another organization
   */
  private async transferBatch(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { batchId, toOrganization } = req.body;

      if (!batchId || !toOrganization) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const transferId = `BATCH-TRANSFER-${Date.now()}`;

      // Map organization to MSP ID
      const toMspId = this.orgToMspId(toOrganization);

      // Transfer batch on blockchain
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:TransferBatch',
        {
          arguments: [transferId, batchId, toMspId]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        transferId,
        message: 'Batch transfer initiated. Awaiting confirmations.'
      });
    } catch (error) {
      console.error('Error transferring batch:', error);
      res.status(500).json({ error: 'Failed to transfer batch' });
    }
  }

  /**
   * Update batch location (Warehouse only)
   */
  private async updateBatchLocation(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: batchId } = req.params;
      const { location, details } = req.body;

      if (!location) {
        res.status(400).json({ error: 'Location is required' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Update batch location on blockchain
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:UpdateBatchLocation',
        {
          arguments: [batchId, location, details || '']
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Batch location updated successfully'
      });
    } catch (error) {
      console.error('Error updating batch location:', error);
      res.status(500).json({ error: 'Failed to update batch location' });
    }
  }

  /**
   * Get all batches for organization
   */
  private async getAllBatches(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Map organization to MSP ID
      const orgMspId = this.orgToMspId(req.user!.organization);

      // Get batches from blockchain
      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetBatchesByOrganization',
        orgMspId
      );

      const resultString = Buffer.from(result).toString('utf8');
      const batches = JSON.parse(resultString);

      res.json(batches);
    } catch (error) {
      console.error('Error fetching batches:', error);
      res.json([]);
    }
  }

  /**
   * Get specific batch
   */
  private async getBatch(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: batchId } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetBatch',
        batchId
      );

      const resultString = Buffer.from(result).toString('utf8');
      const batch = JSON.parse(resultString);

      res.json(batch);
    } catch (error) {
      console.error('Error fetching batch:', error);
      res.status(500).json({ error: 'Failed to fetch batch' });
    }
  }

  /**
   * Get products in a batch
   */
  private async getBatchProducts(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: batchId } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetProductsByBatch',
        batchId
      );

      const resultString = Buffer.from(result).toString('utf8');
      const products = JSON.parse(resultString);

      res.json(products);
    } catch (error) {
      console.error('Error fetching batch products:', error);
      res.status(500).json({ error: 'Failed to fetch batch products' });
    }
  }

  /**
   * Complete product and prepare for transfer to retailer
   */
  private async completeProduct(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Update product status to completed
      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:UpdateProductStatus',
        {
          arguments: [productId, 'COMPLETED']
        }
      );

      res.json({
        success: true,
        message: 'Product completed and ready for transfer'
      });
    } catch (error) {
      console.error('Error completing product:', error);
      res.status(500).json({ error: 'Failed to complete product' });
    }
  }

  // ============= B2B TRANSFER FUNCTIONS =============

  /**
   * Initiate B2B transfer (any organization)
   */
  private async initiateB2BTransfer(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId, toOrganization, transferType } = req.body;

      if (!productId || !toOrganization) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const transferId = `TRANSFER-${Date.now()}`;

      // Initiate transfer in supply chain contract with consensus
      // This creates the transfer AND submits to consensus in one call
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:InitiateTransferWithConsensus',
        {
          arguments: [transferId, productId, toOrganization, 'SUPPLY_CHAIN']
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Consensus is already handled by InitiateTransferWithConsensus
      // No need for duplicate submission

      res.json({
        success: true,
        transferId,
        message: 'Transfer initiated. Awaiting confirmations.'
      });
    } catch (error) {
      console.error('Error initiating transfer:', error);
      res.status(500).json({ error: 'Failed to initiate transfer' });
    }
  }

  /**
   * Confirm product sent
   */
  private async confirmSent(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: transferId } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Confirm in supply chain contract WITH consensus
      // This updates both supply chain and consensus in one call
      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:ConfirmSentWithConsensus',
        {
          arguments: [transferId]
        }
      );

      res.json({
        success: true,
        message: 'Shipment confirmed'
      });
    } catch (error) {
      console.error('Error confirming sent:', error);
      res.status(500).json({ error: 'Failed to confirm shipment' });
    }
  }

  /**
   * Confirm product received
   */
  private async confirmReceived(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: transferId } = req.params;
      const { condition, notes } = req.body;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Confirm in supply chain contract WITH consensus
      // This updates both supply chain and consensus in one call
      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:ConfirmReceivedWithConsensus',
        {
          arguments: [transferId]
        }
      );

      res.json({
        success: true,
        message: 'Receipt confirmed. Transfer complete.'
      });
    } catch (error) {
      console.error('Error confirming receipt:', error);
      res.status(500).json({ error: 'Failed to confirm receipt' });
    }
  }

  /**
   * Raise dispute for a transfer
   */
  private async raiseDispute(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: transferId } = req.params;
      const { reason, evidenceType, evidenceHash } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Dispute reason is required' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Raise dispute in consensus contract
      const result = await this.transactionHandler.submitTransaction(
        contracts.consensus,
        'RaiseDispute',
        {
          arguments: [
            transferId,
            req.user!.organization,
            reason,
            evidenceType || 'DOCUMENTATION',
            evidenceHash || ''
          ]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Dispute raised successfully',
        transferId
      });
    } catch (error) {
      console.error('Error raising dispute:', error);
      res.status(500).json({ error: 'Failed to raise dispute' });
    }
  }

  // ============= RETAILER FUNCTIONS =============

  /**
   * Mark product for retail sale
   */
  private async markForRetail(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { price, displayLocation } = req.body;

      if (req.user?.organization !== 'luxuryretail') {
        res.status(403).json({ error: 'Only retailers can mark products for sale' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Update product status to retail
      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:UpdateProductStatus',
        {
          arguments: [productId, 'FOR_SALE']
        }
      );

      // Generate QR code data for the product
      const qrData = {
        productId,
        brand: req.user!.organization,
        retailer: 'luxuryretail',
        verifyUrl: `http://localhost:3000/verify/${productId}`, // Frontend route
        timestamp: new Date().toISOString()
      };
      
      // In production, use a real QR code library like 'qrcode'
      // For now, just return the data that would be encoded
      const qrCodeData = JSON.stringify(qrData);

      // Store retail metadata (price, etc.) off-chain if needed
      console.log('Product marked for retail with QR data:', { productId, price, displayLocation, qrCodeData });

      res.json({
        success: true,
        message: 'Product marked for retail sale',
        qrCodeData, // Frontend will generate the actual QR image
        qrData
      });
    } catch (error) {
      console.error('Error marking for retail:', error);
      res.status(500).json({ error: 'Failed to mark for retail' });
    }
  }

  /**
   * Sell product to customer (B2C)
   */
  private async sellToCustomer(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { customerId, password, pin } = req.body; // Now includes password and PIN

      if (req.user?.organization !== 'luxuryretail') {
        res.status(403).json({ error: 'Only retailers can sell to customers' });
        return;
      }

      if (!customerId || !password || !pin) {
        res.status(400).json({ error: 'Customer ID, password, and PIN are required' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Generate customer hash from their identifier (email/phone)
      const customerHash = require('crypto').createHash('sha256')
        .update(customerId.toLowerCase())
        .digest('hex');

      // Generate security hash from password and PIN
      const securityHash = require('crypto').createHash('sha256')
        .update(`${password}:${pin}`)
        .digest('hex');

      // Take ownership directly for the customer (productID, ownerHash, securityHash, purchaseLocation)
      // Now includes security hash for PIN verification
      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:TakeOwnership',
        {
          arguments: [productId, customerHash, securityHash, 'luxuryretail']
        }
      );

      // Get product details for QR generation
      const productResult = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetProduct',
        productId
      );
      const product = JSON.parse(Buffer.from(productResult).toString('utf8'));
      
      // Generate or update QR code for the sold product
      let qrCode = null;
      try {
        const qrResult = await qrService.generateProductQR(
          productId,
          product.serialNumber || `SN-${productId}`,
          product.brand || 'LuxeBags'
        );
        qrCode = {
          url: qrResult.storedPath,
          dataUrl: qrResult.dataUrl
        };
        console.log(`✅ QR code generated/updated for sold product ${productId}`);
      } catch (error) {
        console.error('Failed to generate QR code for sold product:', error);
      }

      // Generate QR code data for customer's digital certificate
      const qrData = {
        productId,
        ownerHash: customerHash,
        verifyUrl: `http://localhost:3001/verify/${productId}`,
        ownedBy: customerId,
        saleDate: new Date().toISOString(),
        retailer: req.user!.organization
      };

      res.json({
        success: true,
        message: 'Product sold and ownership transferred to customer',
        customerId,
        ownershipHash: customerHash,
        qrCodeData: JSON.stringify(qrData),
        qrData,
        qrCode
      });
    } catch (error) {
      console.error('Error selling to customer:', error);
      res.status(500).json({ error: 'Failed to sell product' });
    }
  }

  /**
   * Take ownership of product (Customer at point of sale)
   */
  private async takeOwnership(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { ownerHash, securityHash, purchaseLocation } = req.body;

      if (!ownerHash || !securityHash || !purchaseLocation) {
        res.status(400).json({ error: 'Owner hash, security hash, and purchase location are required' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Take ownership on blockchain
      // Chaincode expects: productID, ownerHash, securityHash, purchaseLocation
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:TakeOwnership',
        {
          arguments: [productId, ownerHash, securityHash, purchaseLocation]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Generate QR code data for ownership
      const qrData = {
        productId,
        ownerHash,
        purchaseLocation,
        verifyUrl: `http://localhost:3000/verify/${productId}`,
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        message: 'Ownership transferred successfully',
        productId,
        qrCodeData: JSON.stringify(qrData),
        qrData
      });
    } catch (error) {
      console.error('Error taking ownership:', error);
      res.status(500).json({ error: 'Failed to take ownership' });
    }
  }

  /**
   * Process customer return
   */
  private async processCustomerReturn(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { reason, retailerMSPID } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Return reason is required' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Map retailer organization to MSP ID if not provided
      const mspId = retailerMSPID || this.orgToMspId(req.user!.organization);

      // Process customer return on blockchain
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:ProcessCustomerReturn',
        {
          arguments: [productId, reason, mspId]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Customer return processed successfully',
        productId,
        reason
      });
    } catch (error) {
      console.error('Error processing customer return:', error);
      res.status(500).json({ error: 'Failed to process customer return' });
    }
  }

  // ============= OWNERSHIP FUNCTIONS =============

  /**
   * Create digital birth certificate for product
   */
  private async createBirthCertificate(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { manufacturingDate, materials, craftsman, location } = req.body;

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Create birth certificate
      const result = await this.transactionHandler.submitTransaction(
        contracts.ownership,
        'CreateDigitalBirthCertificate',
        {
          arguments: [
            productId,
            manufacturingDate || new Date().toISOString(),
            JSON.stringify(materials || []),
            craftsman || req.user!.organization,
            location || 'Italy'
          ]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Generate QR code data for birth certificate
      const qrData = {
        productId,
        certificateType: 'birth',
        manufacturingDate: manufacturingDate || new Date().toISOString(),
        verifyUrl: `http://localhost:3000/verify/certificate/${productId}`,
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        message: 'Birth certificate created successfully',
        productId,
        qrCodeData: JSON.stringify(qrData),
        qrData
      });
    } catch (error) {
      console.error('Error creating birth certificate:', error);
      res.status(500).json({ error: 'Failed to create birth certificate' });
    }
  }

  /**
   * Add service record to product
   */
  private async addServiceRecord(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { serviceType, provider, description, cost } = req.body;

      if (!serviceType || !provider) {
        res.status(400).json({ error: 'Service type and provider are required' });
        return;
      }

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Add service record
      const result = await this.transactionHandler.submitTransaction(
        contracts.ownership,
        'AddServiceRecord',
        {
          arguments: [
            productId,
            serviceType,
            provider,
            description || '',
            (cost || 0).toString()
          ]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Service record added successfully',
        productId
      });
    } catch (error) {
      console.error('Error adding service record:', error);
      res.status(500).json({ error: 'Failed to add service record' });
    }
  }

  /**
   * Generate transfer code for ownership transfer
   */
  private async generateTransferCode(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId, currentOwnerHash, securityHash } = req.body;

      if (!productId || !currentOwnerHash || !securityHash) {
        res.status(400).json({ error: 'Product ID, owner hash, and security verification are required' });
        return;
      }

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Generate transfer code (now requires security hash for PIN verification)
      const result = await this.transactionHandler.submitTransaction(
        contracts.ownership,
        'GenerateTransferCode',
        {
          arguments: [productId, currentOwnerHash, securityHash]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Parse the result to get the transfer code
      const transferCode = result.result || 'TRANSFER-CODE';

      res.json({
        success: true,
        transferCode,
        productId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      });
    } catch (error) {
      console.error('Error generating transfer code:', error);
      res.status(500).json({ error: 'Failed to generate transfer code' });
    }
  }

  /**
   * Complete ownership transfer using transfer code
   */
  private async transferOwnership(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId, transferCode, newOwnerHash, newSecurityHash } = req.body;

      if (!productId || !transferCode || !newOwnerHash || !newSecurityHash) {
        res.status(400).json({ error: 'Product ID, transfer code, new owner hash, and security credentials are required' });
        return;
      }

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Transfer ownership (new owner sets their own security hash)
      const result = await this.transactionHandler.submitTransaction(
        contracts.ownership,
        'TransferOwnership',
        {
          arguments: [productId, transferCode, newOwnerHash, newSecurityHash]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      // Generate QR code data for ownership
      const qrData = {
        productId,
        verifyUrl: `http://localhost:3000/verify/${productId}`,
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        message: 'Ownership transferred successfully',
        productId,
        qrCodeData: JSON.stringify(qrData),
        qrData
      });
    } catch (error) {
      console.error('Error transferring ownership:', error);
      res.status(500).json({ error: 'Failed to transfer ownership' });
    }
  }

  /**
   * Report product as stolen
   */
  private async reportStolen(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId, ownerHash, securityHash, policeReportId } = req.body;

      if (!productId || !ownerHash || !securityHash) {
        res.status(400).json({ error: 'Product ID, owner hash, and security hash are required' });
        return;
      }

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Report stolen with security verification
      const result = await this.transactionHandler.submitTransaction(
        contracts.ownership,
        'ReportStolen',
        {
          arguments: [productId, ownerHash, securityHash, policeReportId || '']
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Product reported as stolen',
        productId
      });
    } catch (error) {
      console.error('Error reporting stolen product:', error);
      res.status(500).json({ error: 'Failed to report stolen product' });
    }
  }

  /**
   * Recover stolen product
   */
  private async recoverStolen(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId, ownerHash, securityHash, recoveryDetails } = req.body;

      if (!productId || !ownerHash || !securityHash) {
        res.status(400).json({ error: 'Product ID, owner hash, and security hash are required' });
        return;
      }

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Recover stolen product with security verification
      const result = await this.transactionHandler.submitTransaction(
        contracts.ownership,
        'RecoverStolen',
        {
          arguments: [productId, ownerHash, securityHash, recoveryDetails || 'Product recovered']
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Product recovered successfully',
        productId
      });
    } catch (error) {
      console.error('Error recovering stolen product:', error);
      res.status(500).json({ error: 'Failed to recover stolen product' });
    }
  }

  /**
   * Get ownership information
   */
  private async getOwnership(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Use the ownership contract directly
      const result = await contracts.ownership.evaluateTransaction('GetOwnership', productId);
      const ownership = JSON.parse(Buffer.from(result).toString('utf8'));

      res.json(ownership);
    } catch (error) {
      console.error('Error fetching ownership:', error);
      res.status(500).json({ error: 'Failed to fetch ownership information' });
    }
  }

  /**
   * Get ownership history for a product
   */
  private async getOwnershipHistory(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Get ownership history
      const result = await contracts.ownership.evaluateTransaction('GetOwnershipHistory', productId);
      const history = JSON.parse(Buffer.from(result).toString('utf8'));

      res.json(history);
    } catch (error) {
      console.error('Error fetching ownership history:', error);
      res.status(500).json({ error: 'Failed to fetch ownership history' });
    }
  }

  /**
   * Get birth certificate for a product
   */
  private async getBirthCertificate(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Get birth certificate
      const result = await contracts.ownership.evaluateTransaction('GetBirthCertificate', productId);
      const certificate = JSON.parse(Buffer.from(result).toString('utf8'));

      res.json(certificate);
    } catch (error) {
      console.error('Error fetching birth certificate:', error);
      res.status(500).json({ error: 'Failed to fetch birth certificate' });
    }
  }

  /**
   * Get list of stolen products
   */
  private async getStolenProducts(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Use the ownership contract from contracts
      const result = await contracts.ownership.evaluateTransaction('GetStolenProducts');
      const stolenProducts = JSON.parse(Buffer.from(result).toString('utf8'));

      res.json(stolenProducts);
    } catch (error) {
      console.error('Error fetching stolen products:', error);
      res.status(500).json({ error: 'Failed to fetch stolen products' });
    }
  }

  /**
   * Get service records for a product
   */
  private async getServiceRecords(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;

      // Get contracts for current user (this handles the user ID mapping properly)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );
      // Get service records
      const result = await contracts.ownership.evaluateTransaction('GetServiceRecords', productId);
      const records = JSON.parse(Buffer.from(result).toString('utf8'));

      res.json(records);
    } catch (error) {
      console.error('Error fetching service records:', error);
      res.status(500).json({ error: 'Failed to fetch service records' });
    }
  }

  /**
   * Get transfer status
   */
  private async getTransferStatus(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: transferId } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Get transfer details
      const result = await contracts.supply.evaluateTransaction('SupplyChainContract:GetTransfer', transferId);
      const transfer = JSON.parse(Buffer.from(result).toString('utf8'));

      res.json({
        transferId,
        status: transfer.status,
        sender: transfer.sender,
        receiver: transfer.receiver,
        timestamp: transfer.timestamp,
        itemType: transfer.itemType,
        itemId: transfer.itemId
      });
    } catch (error) {
      console.error('Error fetching transfer status:', error);
      res.status(500).json({ error: 'Failed to fetch transfer status' });
    }
  }

  // ============= DISPUTE RESOLUTION FUNCTIONS =============

  /**
   * Create return transfer after dispute resolution
   */
  private async createReturnTransferAfterDispute(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { disputeId } = req.params;
      
      console.log('Creating return transfer for dispute:', disputeId);

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Create return transfer based on dispute resolution
      console.log('Calling chaincode CreateReturnTransferAfterDispute with disputeId:', disputeId);
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:CreateReturnTransferAfterDispute',
        {
          arguments: [disputeId]
        }
      );

      if (!result.success) {
        console.error('Chaincode returned error:', result.error);
        res.status(500).json({ error: result.error || 'Chaincode execution failed' });
        return;
      }

      console.log('Return transfer created successfully for dispute:', disputeId);
      res.json({
        success: true,
        message: 'Return transfer created based on dispute resolution',
        disputeId
      });
    } catch (error: any) {
      console.error('Error creating return transfer:', error);
      console.error('Error details:', error.message || error);
      console.error('Stack trace:', error.stack);
      res.status(500).json({ 
        error: error.message || 'Failed to create return transfer',
        details: error.toString()
      });
    }
  }

  /**
   * Process return transfer
   */
  private async processReturn(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { transferId } = req.params;
      const { itemType, itemId, quantity } = req.body;

      if (!itemType || !itemId) {
        res.status(400).json({ error: 'Item type and ID are required' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Process the return
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'SupplyChainContract:ProcessReturn',
        {
          arguments: [
            transferId,
            itemType,
            itemId,
            (quantity || 1).toString()
          ]
        }
      );

      if (!result.success) {
        res.status(500).json({ error: result.error });
        return;
      }

      res.json({
        success: true,
        message: 'Return processed successfully',
        transferId
      });
    } catch (error) {
      console.error('Error processing return:', error);
      res.status(500).json({ error: 'Failed to process return' });
    }
  }

  // ============= QUERY FUNCTIONS =============

  /**
   * Get products for current organization
   */
  private async getProducts(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for the current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      try {
        const result = await contracts.supply.evaluateTransaction('SupplyChainContract:GetAllProducts');
        // Convert Uint8Array to string properly
        const resultString = Buffer.from(result).toString('utf8');
        const products = JSON.parse(resultString);

        // Map organization to MSP ID for filtering
        const userMspId = this.orgToMspId(req.user!.organization);

        // Filter by organization - products store MSP IDs not organization names
        const orgProducts = products.filter((p: any) => 
          p.currentOwner === userMspId || 
          p.currentLocation === userMspId
        );

        // Sort products by createdAt in descending order (newest first)
        orgProducts.sort((a: any, b: any) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });

        res.json(orgProducts);
      } catch (chainError: any) {
        // If no products exist yet, return empty array
        console.log('No products found:', chainError.message);
        res.json([]);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      res.json([]); // Return empty array to prevent frontend errors
    }
  }

  /**
   * Get specific product
   */
  private async getProduct(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const result = await contracts.supply.evaluateTransaction('SupplyChainContract:GetProduct', id);
      // Convert Uint8Array to string properly
      const resultString = Buffer.from(result).toString('utf8');
      const product = JSON.parse(resultString);

      // Try to get QR code for the product
      let qrCode = null;
      try {
        const qrData = await qrService.getProductQR(id);
        if (qrData.imagePath) {
          qrCode = {
            url: qrData.imagePath,
            data: qrData.qrData
          };
        }
      } catch (error) {
        console.error('Failed to get QR code:', error);
      }

      res.json({
        ...product,
        qrCode
      });
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  }

  /**
   * Get product history (supply chain tracking)
   */
  private async getProductHistory(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetProductHistory',
        id
      );

      const history = JSON.parse(Buffer.from(result).toString('utf8'));
      
      // Transform history to be more user-friendly
      const transformedHistory = history.map((entry: any) => {
        // Convert Fabric timestamp (protobuf) to readable date
        let formattedTimestamp = null;
        if (entry.timestamp) {
          try {
            // Fabric timestamp might be an object with seconds and nanos
            if (entry.timestamp.seconds) {
              formattedTimestamp = new Date(entry.timestamp.seconds * 1000).toISOString();
            } else if (typeof entry.timestamp === 'string') {
              formattedTimestamp = entry.timestamp;
            }
          } catch (e) {
            console.log('Failed to parse timestamp:', entry.timestamp);
          }
        }
        
        // Use the product's createdAt as fallback if no valid timestamp
        if (!formattedTimestamp && entry.value?.createdAt) {
          formattedTimestamp = entry.value.createdAt;
        }
        
        const event: any = {
          timestamp: formattedTimestamp,
          txId: entry.txId,
          location: entry.value?.currentLocation || 'Unknown',
          owner: entry.value?.currentOwner || 'Unknown',
          status: entry.value?.status || 'Unknown'
        };
        
        // Add meaningful event description based on status changes
        if (entry.value?.status === 'CREATED') {
          event.event = 'Product manufactured';
          event.description = `Product created at ${entry.value?.currentOwner}`;
        } else if (entry.value?.status === 'IN_TRANSIT') {
          event.event = 'In transit';
          event.description = `Product shipped from ${entry.value?.currentLocation}`;
        } else if (entry.value?.status === 'IN_STORE') {
          event.event = 'Arrived at retailer';
          event.description = `Product received at ${entry.value?.currentLocation}`;
        } else if (entry.value?.status === 'SOLD') {
          event.event = 'Sold to customer';
          event.description = `Product sold to customer`;
        }
        
        return event;
      });
      
      res.json(transformedHistory);
    } catch (error: any) {
      console.error('Error fetching product history:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get pending transfers
   */
  private async getPendingTransfers(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Map current organization to MSP ID
      const currentOrgMspId = this.orgToMspId(req.user!.organization);

      // Use the correct GetPendingTransfers function from chaincode
      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetPendingTransfers',
        currentOrgMspId
      );
      
      // Convert Uint8Array to string properly
      const resultString = Buffer.from(result).toString('utf8').trim();
      
      // Parse product transfers
      let productTransfers = [];
      if (resultString && resultString !== '') {
        try {
          productTransfers = JSON.parse(resultString);
          console.log('Found', productTransfers.length, 'product transfers');
        } catch (parseError) {
          console.error('Failed to parse product transfers:', resultString);
        }
      } else {
        console.log('No product transfers found');
      }
      
      // Get material transfers by checking all material inventories
      let materialTransfers: any[] = [];
      try {
        const materialResult = await contracts.supply.evaluateTransaction(
          'SupplyChainContract:GetAllMaterialInventories'
        );
        const materialString = Buffer.from(materialResult).toString('utf8');
        const allInventories = JSON.parse(materialString);
        
        // Find pending material transfers for this org
        // Use a Map to track transfers by ID to avoid duplicates
        const transferMap = new Map<string, any>();
        
        // Process each inventory
        for (const inventory of allInventories) {
          if (inventory.transfers && inventory.transfers.length > 0) {
            for (const transfer of inventory.transfers) {
              // Check if transfer involves current org and is not verified
              if (!transfer.verified && 
                  (transfer.to === currentOrgMspId || transfer.from === currentOrgMspId)) {
                // Only add if we haven't seen this transfer ID yet
                if (!transferMap.has(transfer.transferId)) {
                  // Fetch consensus status for this transfer
                  let consensusStatus = 'PENDING';
                  let isDisputed = false;
                  
                  try {
                    // Query consensus chaincode for transaction status
                    const consensusResult = await contracts.consensus.evaluateTransaction(
                      'GetTransaction',
                      transfer.transferId
                    );
                    const consensusData = JSON.parse(Buffer.from(consensusResult).toString('utf8'));
                    
                    // Check if transaction is disputed
                    if (consensusData.state === 'DISPUTED') {
                      consensusStatus = 'DISPUTED';
                      isDisputed = true;
                    } else if (consensusData.state === 'VALIDATED') {
                      consensusStatus = 'VALIDATED';
                    }
                  } catch (consensusError) {
                    // If consensus query fails, continue with default status
                    console.log('Could not fetch consensus status for', transfer.transferId);
                  }
                  
                  // Skip validated transfers - they're complete
                  if (consensusStatus === 'VALIDATED') {
                    console.log('Skipping validated transfer:', transfer.transferId);
                    continue;
                  }
                  
                  const isPending = !transfer.verified && !isDisputed;
                  
                  transferMap.set(transfer.transferId, {
                    id: transfer.transferId,
                    transferId: transfer.transferId,
                    materialId: inventory.materialId,
                    itemId: inventory.materialId, // alias for frontend compatibility
                    from: transfer.from,
                    to: transfer.to,
                    transferType: 'material',
                    type: transfer.to === currentOrgMspId ? 'RECEIVED' : 'SENT',
                    status: consensusStatus,
                    initiatedAt: transfer.transferDate,
                    // Update flags based on dispute status
                    canTakeAction: isPending && transfer.to === currentOrgMspId, // Only if not disputed and is receiver
                    isWaitingForOther: isPending && transfer.from === currentOrgMspId, // Only if not disputed and is sender
                    isDisputed: isDisputed,
                    metadata: {
                      materialType: inventory.type,
                      quantity: transfer.quantity,
                      batch: inventory.batch
                    }
                  });
                }
              }
            }
          }
        }
        
        // Convert map values to array
        materialTransfers = Array.from(transferMap.values());
        console.log('Found', materialTransfers.length, 'material transfers');
      } catch (materialError) {
        console.error('Failed to get material transfers:', materialError);
      }
      
      // Combine all transfers
      const pendingTransfers = [...productTransfers, ...materialTransfers];
      
      // Map MSP IDs back to organization names for frontend
      const mspToOrg: Record<string, string> = {
        'LuxeBagsMSP': 'luxebags',
        'ItalianLeatherMSP': 'italianleather',
        'CraftWorkshopMSP': 'craftworkshop',
        'LuxuryRetailMSP': 'luxuryretail'
      };
      
      // Transform the transfers to include organization names
      const transformedTransfers = pendingTransfers.map((transfer: any) => ({
        ...transfer,
        from: mspToOrg[transfer.from] || transfer.from,
        to: mspToOrg[transfer.to] || transfer.to
      }));
      
      res.json(transformedTransfers);
    } catch (error) {
      console.error('Error fetching pending transfers:', error);
      // Return empty array on error
      res.json([]);
    }
  }

  /**
   * Get return transfers from dispute resolutions
   */
  private async getReturnTransfers(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Map current organization to MSP ID
      const currentOrgMspId = this.orgToMspId(req.user!.organization);

      // Get dispute return transfers
      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetDisputeReturnTransfers',
        currentOrgMspId
      );
      
      const resultString = Buffer.from(result).toString('utf8').trim();
      let returnTransfers = [];
      
      if (resultString && resultString !== '') {
        try {
          returnTransfers = JSON.parse(resultString);
          console.log('Found', returnTransfers.length, 'return transfers');
        } catch (parseError) {
          console.error('Failed to parse return transfers:', resultString);
        }
      }
      
      // Map MSP IDs to organization names for display
      const mspToOrg: { [key: string]: string } = {
        'LuxeBagsMSP': 'luxebags',
        'ItalianLeatherMSP': 'italianleather',
        'CraftWorkshopMSP': 'craftworkshop',
        'LuxuryRetailMSP': 'luxuryretail'
      };
      
      // Transform the transfers to include organization names
      const transformedTransfers = returnTransfers.map((transfer: any) => ({
        ...transfer,
        from: mspToOrg[transfer.from] || transfer.from,
        to: mspToOrg[transfer.to] || transfer.to,
        isReturn: true,
        canConfirm: transfer.from === currentOrgMspId && !transfer.consensusDetails?.senderConfirmed,
        canReceive: transfer.to === currentOrgMspId && !transfer.consensusDetails?.receiverConfirmed,
        // Set itemId from productId or metadata.materialId for return transfers
        itemId: transfer.metadata?.materialId || transfer.productId || transfer.id
      }));
      
      res.json(transformedTransfers);
    } catch (error) {
      console.error('Error fetching return transfers:', error);
      res.json([]);
    }
  }

  /**
   * Get materials (for manufacturers)
   */
  private async getMaterials(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Query all material inventories from blockchain
      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetAllMaterialInventories'
      );
      
      // Convert Uint8Array to string properly
      const resultString = Buffer.from(result).toString('utf8');
      console.log('Converted result:', resultString.substring(0, 100));
      const allInventories = JSON.parse(resultString);
      const userMaterials: any[] = [];
      
      // Filter materials owned by the current organization
      // Map organization to MSP ID format
      const mspId = this.orgToMspId(req.user!.organization);
      
      allInventories.forEach((inventory: any) => {
        if (inventory.owner === mspId) {
          userMaterials.push({
            id: inventory.materialId,
            materialId: inventory.materialId,
            type: inventory.type,
            source: inventory.supplier,
            batch: inventory.batch,
            quantity: inventory.available,
            totalReceived: inventory.totalReceived,
            used: inventory.used,
            owner: inventory.owner
          });
        }
      });
      
      // Sort materials by ID in descending order (newest first)
      // Material IDs often contain timestamps like LEATHER-TEST-1755122596
      userMaterials.sort((a, b) => {
        // Try to extract timestamp from ID if present
        const timestampA = a.materialId.match(/\d{10,}/)?.[0] || a.materialId;
        const timestampB = b.materialId.match(/\d{10,}/)?.[0] || b.materialId;
        return timestampB.localeCompare(timestampA);
      });
      
      res.json(userMaterials);
    } catch (error) {
      console.error('Error fetching materials:', error);
      // Return empty array if the function doesn't exist yet
      res.json([]);
    }
  }

  /**
   * Add material to product
   */
  private async addMaterialToProduct(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { materialId, type, source, supplier, batch, verification } = req.body;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'AddMaterial',
        {
          arguments: [productId, materialId, type, source, supplier, batch, verification]
        }
      );

      res.json({
        success: true,
        message: 'Material added to product'
      });
    } catch (error) {
      console.error('Error adding material:', error);
      res.status(500).json({ error: 'Failed to add material' });
    }
  }

  // Quality checkpoint function removed - quality is now implicit in 2-check consensus
  // The AddQualityCheckpoint function no longer exists in chaincode

  /**
   * Get transaction history from blockchain
   */
  private async getTransactionHistory(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { type, status, limit = '50' } = req.query;
      
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      const transactions: any[] = [];
      
      // Map organization to MSP ID
      const currentOrgMspId = this.orgToMspId(req.user!.organization);

      // Use a Set to track unique transaction IDs and prevent duplicates
      const seenTransactionIds = new Set<string>();

      // Get product transfers from supply chain
      try {
        const productsResult = await contracts.supply.evaluateTransaction('SupplyChainContract:GetAllProducts');
        const productsData = Buffer.from(productsResult).toString('utf8');
        const products = JSON.parse(productsData);
        
        // Find products that were transferred to/from this organization
        products.forEach((product: any) => {
          if (product.transferHistory && product.transferHistory.length > 0) {
            product.transferHistory.forEach((transfer: any) => {
              if (transfer.from === currentOrgMspId || transfer.to === currentOrgMspId) {
                const isSender = transfer.from === currentOrgMspId;
                // Use actual transfer ID if available, otherwise create unique one
                const txId = transfer.transferId || `PROD-TRANSFER-${product.id}-${transfer.timestamp}`;
                
                // Skip if we've already processed this transaction
                if (seenTransactionIds.has(txId)) {
                  return;
                }
                seenTransactionIds.add(txId);
                
                transactions.push({
                  id: txId,
                  type: isSender ? 'SENT' : 'RECEIVED',
                  itemId: product.id,
                  itemDescription: `${product.brand} ${product.name} - ${product.type}`,
                  partner: isSender ? 
                    this.mapMspToOrg(transfer.to) : 
                    this.mapMspToOrg(transfer.from),
                  value: product.value || 0,
                  status: transfer.status === 'COMPLETED' ? 'VALIDATED' : 'PENDING_RECEIVER',
                  createdAt: transfer.timestamp,
                  confirmedAt: transfer.status === 'COMPLETED' ? transfer.timestamp : undefined
                });
              }
            });
          }
        });
      } catch (err) {
        console.log('No product transfers found');
      }

      // Get material transfers from supply chain
      try {
        const materialsResult = await contracts.supply.evaluateTransaction('SupplyChainContract:GetAllMaterialInventories');
        const materialsData = Buffer.from(materialsResult).toString('utf8');
        const materials = JSON.parse(materialsData);
        
        // Find material transfers involving this organization
        materials.forEach((inventory: any) => {
          if (inventory.transfers && inventory.transfers.length > 0) {
            inventory.transfers.forEach((transfer: any) => {
              if (transfer.from === currentOrgMspId || transfer.to === currentOrgMspId) {
                const isSender = transfer.from === currentOrgMspId;
                const txId = transfer.transferId || `MAT-TRANSFER-${inventory.materialId}-${transfer.transferDate}`;
                
                // Skip if we've already processed this transaction
                if (seenTransactionIds.has(txId)) {
                  return;
                }
                seenTransactionIds.add(txId);
                
                transactions.push({
                  id: txId,
                  type: isSender ? 'SENT' : 'RECEIVED',
                  itemId: inventory.materialId,
                  itemDescription: `Material: ${inventory.type} - Batch ${inventory.batch}`,
                  partner: isSender ? 
                    this.mapMspToOrg(transfer.to) : 
                    this.mapMspToOrg(transfer.from),
                  value: transfer.quantity * 100, // Estimated value
                  status: transfer.verified ? 'VALIDATED' : 'PENDING_RECEIVER',
                  createdAt: transfer.transferDate,
                  confirmedAt: transfer.verified ? transfer.transferDate : undefined
                });
              }
            });
          }
        });
      } catch (err) {
        console.log('No material transfers found');
      }

      // Sort by date (newest first)
      transactions.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      // Apply filters
      let filtered = transactions;
      if (type && type !== 'all') {
        filtered = filtered.filter(tx => tx.type === type.toString().toUpperCase());
      }
      if (status && status !== 'all') {
        filtered = filtered.filter(tx => tx.status === status);
      }

      // Apply limit
      const limitNum = parseInt(limit as string);
      filtered = filtered.slice(0, limitNum);

      res.json(filtered);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.json([]); // Return empty array on error
    }
  }


  /**
   * Map MSP ID to organization name
   */
  private mapMspToOrg(mspId: string): string {
    const mapping: Record<string, string> = {
      'LuxeBagsMSP': 'luxebags',
      'ItalianLeatherMSP': 'italianleather',
      'CraftWorkshopMSP': 'craftworkshop',
      'LuxuryRetailMSP': 'luxuryretail'
    };
    return mapping[mspId] || mspId;
  }

  /**
   * Get products owned by a specific customer (by ownerHash)
   */
  private async getProductsByOwner(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { ownerHash } = req.query;
      
      console.log('getProductsByOwner called with ownerHash:', ownerHash);
      
      if (!ownerHash) {
        res.status(400).json({ error: 'Owner hash required' });
        return;
      }

      // Get contracts for current user (retailer)
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Query blockchain for products with this owner hash
      const result = await contracts.ownership.evaluateTransaction(
        'GetProductsByOwner',
        ownerHash as string
      );

      const resultString = Buffer.from(result).toString('utf8');
      const products = resultString ? JSON.parse(resultString) : [];

      res.json(products);
    } catch (error) {
      console.error('Error fetching products by owner:', error);
      res.status(500).json({ error: 'Failed to fetch owned products' });
    }
  }

  /**
   * Get dashboard statistics
   */
  private async getDashboardStats(req: ApiRequest, res: Response): Promise<void> {
    try {
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // Map organization to MSP ID
      const orgMspId = this.orgToMspId(req.user!.organization);

      // Get dashboard stats from blockchain
      const result = await contracts.supply.evaluateTransaction(
        'SupplyChainContract:GetDashboardStats',
        orgMspId
      );

      const resultString = Buffer.from(result).toString('utf8');
      const stats = JSON.parse(resultString);

      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  }

  /**
   * Get trust score from blockchain
   */
  private async getTrustScore(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { organizationId } = req.params;
      
      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      try {
        // Query trust score from consensus chaincode
        const result = await contracts.consensus.evaluateTransaction(
          'GetTrustScore',
          organizationId
        );
        const trustData = Buffer.from(result).toString('utf8');
        const trustScore = JSON.parse(trustData);
        
        // Calculate rank (would need GetAllTrustScores to properly rank)
        const rank = trustScore.score > 0.8 ? 1 : trustScore.score > 0.6 ? 2 : 3;
        
        res.json({
          score: Math.round(trustScore.score * 100), // Convert to percentage
          rank,
          totalTransactions: trustScore.totalTransactions,
          successfulTx: trustScore.successfulTransactions,
          disputedTx: trustScore.disputedTransactions,
          trend: trustScore.score > 0.85 ? 'up' : trustScore.score > 0.75 ? 'stable' : 'down'
        });
      } catch (err) {
        console.log('Trust score not found or consensus contract not deployed');
        // Return default score
        res.json({
          score: 85,
          rank: 1,
          totalTransactions: 0,
          successfulTx: 0,
          disputedTx: 0,
          trend: 'stable'
        });
      }
    } catch (error) {
      console.error('Error fetching trust score:', error);
      res.status(500).json({ error: 'Failed to fetch trust score' });
    }
  }
}