// Example usage of the SDK Integration Framework

import { SDKConfigManager } from '../config/sdk-config';
import { WalletManager } from '../fabric/wallet-manager';
import { GatewayManager } from '../fabric/gateway-manager';
import { TransactionHandler } from '../fabric/transaction-handler';
import { EventListenerManager } from '../fabric/event-listener';
import { FabricMonitor } from '../monitoring/fabric-monitor';

async function main() {
  // Initialize configuration manager with brand ID
  const configManager = new SDKConfigManager('luxe-bags');
  
  // Initialize wallet manager
  const walletManager = new WalletManager(configManager);
  
  // Initialize gateway manager
  const gatewayManager = new GatewayManager(configManager, walletManager);
  
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
    // Enroll admin
    await walletManager.enrollAdmin('luxebags');
    
    // Register and enroll a user
    await walletManager.registerAndEnrollUser('luxebags', 'user1', {
      affiliation: 'luxebags.department1',
      attrs: [
        { name: 'role', value: 'inspector', ecert: true }
      ]
    });

    // Connect to gateway
    const gateway = await gatewayManager.connect({
      orgId: 'luxebags',
      userId: 'user1',
      channelName: 'luxury-supply-chain'
    });

    // Get network and contract
    const network = await gatewayManager.getNetwork(gateway);
    const contract = await gatewayManager.getContract(
      network,
      'luxury-supply-chain',
      'LuxuryProduct'
    );

    // Start event listener
    await eventListener.startContractEventListener(
      contract,
      'ProductCreated',
      async (event) => {
        console.log('Product created:', event);
        monitor.logEvent({
          chaincode: event.chaincodeName,
          eventName: event.eventName,
          transactionId: event.transactionId,
          blockNumber: event.blockNumber
        });
      }
    );

    // Submit a transaction
    const startTime = Date.now();
    const result = await transactionHandler.submitTransaction(
      contract,
      'createProduct',
      {
        arguments: [
          'BAG-001',
          JSON.stringify({
            model: 'Classic Tote',
            leather_type: 'Italian Calfskin',
            craftsman_id: 'CRAFT-123',
            production_date: new Date().toISOString()
          })
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

    console.log('Transaction result:', result);

    // Query transaction
    const queryResult = await transactionHandler.evaluateTransaction(
      contract,
      'getProduct',
      'BAG-001'
    );

    console.log('Query result:', queryResult);

  } catch (error) {
    monitor.logError(error as Error, { operation: 'main' });
    console.error('Error:', error);
  } finally {
    // Cleanup
    eventListener.stopAllListeners();
    await gatewayManager.disconnectAll();
  }
}

// Run the example
main().catch(console.error);