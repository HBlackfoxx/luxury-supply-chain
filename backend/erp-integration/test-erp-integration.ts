// backend/erp-integration/test-erp-integration.ts
// Test script to demonstrate ERP integration

import { ConsensusSystem } from '../consensus/setup-consensus';
import { ERPIntegrationService } from './erp-integration-service';
import { PurchaseOrder, QualityResult } from './types';

async function testERPIntegration() {
  console.log('=== Testing ERP Integration ===\n');
  
  // 1. Initialize systems
  const consensusSystem = new ConsensusSystem('luxe-bags');
  await consensusSystem.initialize('luxebags', 'admin');
  
  const erpService = new ERPIntegrationService(consensusSystem);
  
  // 2. Register ERP adapters for each organization
  console.log('Registering ERP systems...');
  
  // Italian Leather Supplier
  await erpService.registerERP('italianleather', {
    type: 'Mock',
    baseUrl: 'http://localhost:8001',
    webhookUrl: 'http://localhost:3000/webhooks/italianleather',
    syncInterval: 5 // 5 minutes
  });
  
  // Craft Workshop Manufacturer
  await erpService.registerERP('craftworkshop', {
    type: 'Mock',
    baseUrl: 'http://localhost:8002',
    webhookUrl: 'http://localhost:3000/webhooks/craftworkshop'
  });
  
  console.log('ERP systems registered\n');
  
  // 3. Test Purchase Order Flow
  console.log('=== Testing Purchase Order Flow ===');
  
  // Create a PO in the supplier's ERP
  const mockPO: PurchaseOrder = {
    poNumber: 'PO-2024-001',
    vendorId: 'italianleather',
    buyerId: 'craftworkshop',
    items: [{
      lineNumber: 1,
      itemId: 'LEATHER-PREMIUM-001',
      description: 'Premium Italian Leather - Black',
      quantity: 100,
      unitPrice: 50,
      qualitySpec: 'Grade A, No defects'
    }],
    totalValue: 5000,
    currency: 'EUR',
    deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    status: 'APPROVED'
  };
  
  // First, get the adapter and create the PO in the mock ERP
  const adapter = (erpService as any).adapters.get('italianleather');
  if (adapter) {
    await adapter.createPurchaseOrder(mockPO);
    console.log('Purchase order created in ERP');
  }
  
  // This will trigger automatic blockchain transaction creation
  const txId = await erpService.createTransactionFromPO('italianleather', mockPO.poNumber);
  console.log(`Blockchain transaction created: ${txId}`);
  
  // 4. Test Inventory Updates
  console.log('\n=== Testing Inventory Updates ===');
  
  // Check current inventory
  const currentStock = await erpService.getInventoryLevel('italianleather', 'LEATHER-001');
  console.log(`Current stock level: ${currentStock}`);
  
  // Simulate goods shipment (inventory decrease)
  await erpService.updateInventoryFromBlockchain(
    'italianleather',
    'LEATHER-001',
    100,
    'ISSUE',
    txId
  );
  
  const newStock = await erpService.getInventoryLevel('italianleather', 'LEATHER-001');
  console.log(`Stock after shipment: ${newStock}`);
  
  // 5. Test Quality Certificate
  console.log('\n=== Testing Quality Certificate ===');
  
  const qualityResult: QualityResult = {
    certificateId: 'QC-2024-001',
    itemId: 'LEATHER-PREMIUM-001',
    batchNumber: 'BATCH-2024-001',
    testResults: [
      { parameter: 'Thickness', value: '1.2mm', passed: true },
      { parameter: 'Color Consistency', value: '98%', passed: true },
      { parameter: 'Tensile Strength', value: '25 N/mm²', passed: true }
    ],
    overallStatus: 'PASSED',
    certifiedBy: 'QC Lab Milano',
    certificationDate: new Date()
  };
  
  await erpService.submitQualityToERP('italianleather', qualityResult);
  console.log('Quality certificate submitted to ERP');
  
  // 6. Test Confirmation Sync
  console.log('\n=== Testing Confirmation Sync ===');
  
  // Simulate blockchain confirmations
  await consensusSystem.confirmSent(txId, 'italianleather', {
    shippingLabel: 'SHIP-001',
    trackingNumber: 'IT123456789'
  });
  
  // Sync back to ERP
  await erpService.syncConfirmationToERP('italianleather', txId, 'SENT');
  console.log('Shipment confirmation synced to ERP');
  
  // 7. Listen for events
  console.log('\n=== Monitoring ERP Events ===');
  
  erpService.on('inventory_changed', (event) => {
    console.log('Inventory changed:', event);
  });
  
  erpService.on('quality_completed', (event) => {
    console.log('Quality check completed:', event);
  });
  
  // Keep running for 30 seconds to see events
  setTimeout(async () => {
    console.log('\n=== Shutting down ===');
    await erpService.shutdown();
    await consensusSystem.shutdown();
    process.exit(0);
  }, 30000);
}

// Run the test
if (require.main === module) {
  testERPIntegration().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}