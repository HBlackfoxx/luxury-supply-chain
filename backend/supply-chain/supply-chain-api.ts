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
  private userContracts: Map<string, { supply: Contract; consensus: Contract }> = new Map();

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
  private async getContractsForUser(orgId: string, userId: string): Promise<{ supply: Contract; consensus: Contract }> {
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
      
      // Get both contracts (using actual deployed chaincode names)
      const contracts = {
        supply: network.getContract('luxury-supply-chain'),
        consensus: network.getContract('2check-consensus')
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
    this.router.post('/products/:id/quality', this.addQualityCheckpoint.bind(this));
    this.router.post('/products/:id/complete', this.completeProduct.bind(this));
    
    // === B2B TRANSFER ROUTES (All organizations) ===
    // Transfer between organizations (supplier->manufacturer, manufacturer->retailer)
    this.router.post('/transfer/initiate', this.initiateB2BTransfer.bind(this));
    this.router.post('/transfer/:id/confirm-sent', this.confirmSent.bind(this));
    this.router.post('/transfer/:id/confirm-received', this.confirmReceived.bind(this));
    
    // === RETAILER ROUTES (Luxury Retail) ===
    // Manage retail operations
    this.router.post('/products/:id/retail', this.markForRetail.bind(this));
    this.router.post('/products/:id/sell', this.sellToCustomer.bind(this));
    
    // === QUERY ROUTES (All organizations) ===
    this.router.get('/products', this.getProducts.bind(this));
    this.router.get('/products/:id', this.getProduct.bind(this));
    this.router.get('/transfers/pending', this.getPendingTransfers.bind(this));
    this.router.get('/materials', this.getMaterials.bind(this));
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
        'CreateMaterialInventory',
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
      let manufacturerMspId = '';
      switch(manufacturer) {
        case 'luxebags': manufacturerMspId = 'LuxeBagsMSP'; break;
        case 'italianleather': manufacturerMspId = 'ItalianLeatherMSP'; break;
        case 'craftworkshop': manufacturerMspId = 'CraftWorkshopMSP'; break;
        case 'luxuryretail': manufacturerMspId = 'LuxuryRetailMSP'; break;
        default: manufacturerMspId = manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1) + 'MSP';
      }

      // Transfer material inventory on blockchain
      console.log('Transferring material:', { transferId, materialId, manufacturerMspId, quantity });
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'TransferMaterialInventory',
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

      // Also submit to consensus for 2-check validation
      if (contracts.consensus) {
        await this.transactionHandler.submitTransaction(
          contracts.consensus,
          'SubmitTransaction',
          {
            arguments: [
              transferId,
              req.user!.organization,
              manufacturer,
              'material_transfer',
              materialId,
              JSON.stringify({ quantity, type: 'material' })
            ]
          }
        );
      }

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

      // Confirm material receipt in inventory
      console.log('Calling ConfirmMaterialReceived with:', { transferId, materialId });
      const result = await this.transactionHandler.submitTransaction(
        contracts.supply,
        'ConfirmMaterialReceived',
        {
          arguments: [transferId, materialId]
        }
      );

      if (!result.success) {
        console.error('Failed to confirm material receipt:', result.error);
        res.status(500).json({ error: result.error || 'Failed to confirm material receipt' });
        return;
      }

      // Also confirm in consensus
      if (contracts.consensus) {
        await this.transactionHandler.submitTransaction(
          contracts.consensus,
          'ConfirmReceived',
          {
            arguments: [transferId, req.user!.organization]
          }
        );
      }

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
        'CreateProduct',
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
            'AddMaterial',
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
        'UpdateProductStatus',
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
        'InitiateTransferWithConsensus',
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
        'ConfirmSentWithConsensus',
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
        'ConfirmReceivedWithConsensus',
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
        'UpdateProductStatus',
        {
          arguments: [productId, 'FOR_SALE']
        }
      );

      // Store retail metadata (price, etc.) off-chain if needed
      console.log('Product marked for retail:', { productId, price, displayLocation });

      res.json({
        success: true,
        message: 'Product marked for retail sale'
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
      const { customerId, salePrice, saleDate } = req.body;

      if (req.user?.organization !== 'luxuryretail') {
        res.status(403).json({ error: 'Only retailers can sell to customers' });
        return;
      }

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      // This would integrate with customer gateway
      // For now, just update status
      if (contracts.supply) {
        await this.transactionHandler.submitTransaction(
          contracts.supply,
          'UpdateProductStatus',
          {
            arguments: [productId, 'SOLD']
          }
        );
      }

      res.json({
        success: true,
        message: 'Product sold to customer',
        customerId,
        note: 'Customer should claim ownership through customer portal'
      });
    } catch (error) {
      console.error('Error selling to customer:', error);
      res.status(500).json({ error: 'Failed to sell product' });
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

        // Map organization to MSP ID for filtering (same as getMaterials)
        let userMspId = '';
        switch(req.user!.organization) {
          case 'luxebags': userMspId = 'LuxeBagsMSP'; break;
          case 'italianleather': userMspId = 'ItalianLeatherMSP'; break;
          case 'craftworkshop': userMspId = 'CraftWorkshopMSP'; break;
          case 'luxuryretail': userMspId = 'LuxuryRetailMSP'; break;
          default: userMspId = req.user!.organization.charAt(0).toUpperCase() + req.user!.organization.slice(1) + 'MSP';
        }

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

      const result = await contracts.supply.evaluateTransaction('GetProduct', id);
      const product = JSON.parse(result.toString());

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
   * Get pending transfers
   */
  private async getPendingTransfers(req: ApiRequest, res: Response): Promise<void> {
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
      const allInventories = JSON.parse(resultString);
      const pendingTransfers: any[] = [];
      
      // Map current organization to MSP ID for comparison
      let currentOrgMspId = '';
      switch(req.user!.organization) {
        case 'luxebags': currentOrgMspId = 'LuxeBagsMSP'; break;
        case 'italianleather': currentOrgMspId = 'ItalianLeatherMSP'; break;
        case 'craftworkshop': currentOrgMspId = 'CraftWorkshopMSP'; break;
        case 'luxuryretail': currentOrgMspId = 'LuxuryRetailMSP'; break;
        default: currentOrgMspId = req.user!.organization.charAt(0).toUpperCase() + req.user!.organization.slice(1) + 'MSP';
      }
      
      // Track processed transfers to avoid duplicates
      const processedTransfers = new Set<string>();
      
      // Find transfers that are pending confirmation for the current organization
      allInventories.forEach((inventory: any) => {
        if (inventory.transfers && inventory.transfers.length > 0) {
          inventory.transfers.forEach((transfer: any) => {
            // Skip if already processed (avoid duplicates)
            if (processedTransfers.has(transfer.transferId)) {
              return;
            }
            
            // For material transfers:
            // - Sender sees it in their inventory with verified=false
            // - Receiver needs to confirm, so only show to receiver
            // Only show to receiver (to === currentOrgMspId) for confirmation
            if (!transfer.verified && transfer.to === currentOrgMspId) {
              // Map MSP IDs back to organization names for display
              let fromOrg = transfer.from;
              let toOrg = transfer.to;
              
              // Convert MSP IDs to organization names
              const mspToOrg: Record<string, string> = {
                'LuxeBagsMSP': 'luxebags',
                'ItalianLeatherMSP': 'italianleather',
                'CraftWorkshopMSP': 'craftworkshop',
                'LuxuryRetailMSP': 'luxuryretail'
              };
              
              fromOrg = mspToOrg[transfer.from] || transfer.from;
              toOrg = mspToOrg[transfer.to] || transfer.to;
              
              pendingTransfers.push({
                transferId: transfer.transferId,
                materialId: inventory.materialId,
                materialType: inventory.type,
                from: fromOrg,
                to: toOrg,
                quantity: transfer.quantity,
                createdAt: transfer.transferDate || new Date().toISOString(),
                status: 'PENDING_CONFIRMATION'
              });
              
              // Mark as processed to avoid duplicates
              processedTransfers.add(transfer.transferId);
            }
          });
        }
      });
      
      // Sort pending transfers by date (newest first)
      pendingTransfers.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      res.json(pendingTransfers);
    } catch (error) {
      console.error('Error fetching transfers:', error);
      // Return empty array if the function doesn't exist yet
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
      // Map organization to MSP ID format (handle case differences)
      let mspId = '';
      switch(req.user!.organization) {
        case 'luxebags': mspId = 'LuxeBagsMSP'; break;
        case 'italianleather': mspId = 'ItalianLeatherMSP'; break;  // Capital L in Leather
        case 'craftworkshop': mspId = 'CraftWorkshopMSP'; break;  // Capital W in Workshop
        case 'luxuryretail': mspId = 'LuxuryRetailMSP'; break;
        default: mspId = req.user!.organization.charAt(0).toUpperCase() + req.user!.organization.slice(1) + 'MSP';
      }
      
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

  /**
   * Add quality checkpoint
   */
  private async addQualityCheckpoint(req: ApiRequest, res: Response): Promise<void> {
    try {
      const { id: productId } = req.params;
      const { checkpointId, type, inspector, location, passed, details } = req.body;

      // Get contracts for current user
      const contracts = await this.getContractsForUser(
        req.user!.organization,
        req.user!.id
      );

      await this.transactionHandler.submitTransaction(
        contracts.supply,
        'AddQualityCheckpoint',
        {
          arguments: [
            productId,
            checkpointId,
            type,
            inspector,
            location,
            passed.toString(),
            details || '',
            '[]' // imageHashes
          ]
        }
      );

      res.json({
        success: true,
        message: 'Quality checkpoint added'
      });
    } catch (error) {
      console.error('Error adding checkpoint:', error);
      res.status(500).json({ error: 'Failed to add checkpoint' });
    }
  }
}