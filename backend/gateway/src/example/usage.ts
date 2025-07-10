// backend/gateway/src/example/usage.ts
// Example usage of the SDK Integration Framework
// Updated for fabric-gateway 1.x API

import { SDKConfigManager } from '../config/sdk-config';
import { IdentityManager } from '../fabric/identity-manager';
import { GatewayManager } from '../fabric/gateway-manager';
import { TransactionHandler } from '../fabric/transaction-handler';
import { EventListenerManager } from '../fabric/event-listener';
import { FabricMonitor } from '../monitoring/fabric-monitor';

async function main() {
  // Initialize configuration manager with brand ID
  const configManager = new SDKConfigManager('luxe-bags');
  
  // Initialize identity manager (replaces wallet manager)
  const identityManager = new IdentityManager(configManager);
  
  // Initialize gateway manager
  const gatewayManager = new GatewayManager(configManager, identityManager);
  
  // Initialize transaction handler
  const transactionHandler = new TransactionHandler();
  
  // Initialize event listener
  const eventListener = new EventListenerManager();
  
  // Initialize monitoring
  const monitor = new FabricMonitor({
    enablePrometheus: true,
    prometheusPort: 9090,
    logLevel: 'info',
    logFile: './logs/fabric.log'
  });

  try {
    // Step 1: Enroll admin
    console.log('Enrolling admin...');
    await identityManager.enrollAdmin('luxebags');
    
    // Step 2: Register and enroll a user
    console.log('Registering user...');
    await identityManager.registerAndEnrollUser('luxebags', 'user1', {
      affiliation: 'luxebags.department1',
      attrs: [
        { name: 'role', value: 'inspector', ecert: true }
      ]
    });

    // Step 3: Connect to gateway
    console.log('Connecting to gateway...');
    const gateway = await gatewayManager.connect({
      orgId: 'luxebags',
      userId: 'user1',
      channelName: 'luxury-supply-chain'
    });

    // Step 4: Get network and contract
    console.log('Getting network and contract...');
    const network = await gatewayManager.getNetwork(gateway);
    const contract = await gatewayManager.getContract(
      network,
      'luxury-supply-chain',
      'LuxuryProduct'
    );

    // Step 5: Start event listener
    console.log('Starting event listener...');
    const listenerId = await eventListener.startContractEventListener(
      contract,
      'ProductCreated',
      async (event) => {
        console.log('Product created event:', {
          chaincodeName: event.chaincodeName,
          eventName: event.eventName,
          transactionId: event.transactionId,
          blockNumber: event.blockNumber.toString(),
          payload: new TextDecoder().decode(event.payload)
        });
        
        monitor.logEvent({
          chaincode: event.chaincodeName,
          eventName: event.eventName,
          transactionId: event.transactionId,
          blockNumber: event.blockNumber
        });
      }
    );

    // Step 6: Submit a transaction
    console.log('Creating a new product...');
    const productData = {
      id: 'BAG-001',
      model: 'Classic Tote',
      leather_type: 'Italian Calfskin',
      craftsman_id: 'CRAFT-123',
      production_date: new Date().toISOString(),
      serial_number: 'LB2024001',
      authenticity_certificate: 'CERT-2024-001'
    };

    const startTime = Date.now();
    const result = await transactionHandler.submitTransaction(
      contract,
      'createProduct',
      {
        arguments: [
          productData.id,
          JSON.stringify(productData)
        ]
      }
    );

    monitor.logTransaction({
      channel: 'luxury-supply-chain',
      chaincode: 'luxury-supply-chain',
      function: 'createProduct',
      transactionId: result.transactionId,
      success: result.success,
      duration: (Date.now() - startTime) / 1000,
      error: result.error
    });

    if (result.success) {
      console.log('Transaction successful:', {
        transactionId: result.transactionId,
        blockNumber: result.blockNumber?.toString()
      });
    } else {
      console.error('Transaction failed:', result.error);
    }

    // Step 7: Query the created product
    console.log('Querying product...');
    const queryStartTime = Date.now();
    const queryResult = await transactionHandler.evaluateTransaction(
      contract,
      'getProduct',
      'BAG-001'
    );

    monitor.logQuery({
      channel: 'luxury-supply-chain',
      chaincode: 'luxury-supply-chain',
      function: 'getProduct',
      success: queryResult.success,
      duration: (Date.now() - queryStartTime) / 1000
    });

    if (queryResult.success) {
      console.log('Query result:', queryResult.result);
    } else {
      console.error('Query failed:', queryResult.error);
    }

    // Step 8: Submit a batch of transactions
    console.log('Creating batch of products...');
    const batchTransactions = [
      {
        name: 'createProduct',
        options: {
          arguments: [
            'BAG-002',
            JSON.stringify({
              id: 'BAG-002',
              model: 'Evening Clutch',
              leather_type: 'French Lambskin',
              craftsman_id: 'CRAFT-124',
              production_date: new Date().toISOString()
            })
          ]
        }
      },
      {
        name: 'createProduct',
        options: {
          arguments: [
            'BAG-003',
            JSON.stringify({
              id: 'BAG-003',
              model: 'Weekend Duffle',
              leather_type: 'American Buffalo',
              craftsman_id: 'CRAFT-125',
              production_date: new Date().toISOString()
            })
          ]
        }
      }
    ];

    const batchResults = await transactionHandler.submitBatchTransactions(
      contract,
      batchTransactions
    );

    console.log('Batch results:', batchResults.map(r => ({
      success: r.success,
      transactionId: r.transactionId,
      error: r.error?.message
    })));

    // Step 9: Test with transient data (private data)
    console.log('Testing private data transaction...');
    const privateData = {
      price: '25000',
      cost: '8000',
      margin: '17000'
    };

    const transientData = transactionHandler.createTransientData({
      product_private_details: privateData
    });

    const privateResult = await transactionHandler.submitTransaction(
      contract,
      'createProductWithPrivateData',
      {
        arguments: ['BAG-004', JSON.stringify({ id: 'BAG-004', model: 'Limited Edition' })],
        transientData
      }
    );

    console.log('Private data transaction:', {
      success: privateResult.success,
      transactionId: privateResult.transactionId
    });

    // Wait a bit for events to be processed
    console.log('\nWaiting for events...');
    await new Promise(resolve => setTimeout(resolve, 5000));

  } catch (error) {
    monitor.logError(error as Error, { operation: 'main' });
    console.error('Error:', error);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    eventListener.stopAllListeners();
    await gatewayManager.disconnectAll();
    console.log('Done!');
  }
}

// Run the example
main().catch(console.error);