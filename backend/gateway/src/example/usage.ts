// backend/gateway/src/example/usage.ts
// Example usage of the SDK Integration Framework
// CORRECTED for fabric-gateway 1.x API - Second Pass

import { SDKConfigManager } from '../config/sdk-config';
import { IdentityManager } from '../fabric/identity-manager';
import { GatewayManager } from '../fabric/gateway-manager';
import { TransactionHandler } from '../fabric/transaction-handler';
import { EventListenerManager } from '../fabric/event-listener';
import { FabricMonitor } from '../monitoring/fabric-monitor';
import { TextDecoder } from 'util';

async function main() {
  const brandId = 'luxe-bags';
  const orgId = 'luxebags';
  const userId = 'user1';
  const channelName = 'luxury-supply-chain';
  const chaincodeName = 'luxury-supply-chain';
  const contractName = 'LuxuryProduct';
  
  const monitor = new FabricMonitor({
    enablePrometheus: true,
    prometheusPort: 9090,
    logLevel: 'info'
  });

  const configManager = new SDKConfigManager(brandId);
  const identityManager = new IdentityManager(configManager);
  const gatewayManager = new GatewayManager(configManager, identityManager);
  const transactionHandler = new TransactionHandler();
  const eventListener = new EventListenerManager();

  try {
    monitor.logInfo('Enrolling admin...');
    await identityManager.enrollAdmin(orgId);

    monitor.logInfo('Registering and enrolling user...');
    await identityManager.registerAndEnrollUser(orgId, userId, {
      affiliation: `${orgId}.department1`
    });

    monitor.logInfo('Connecting to gateway...');
    const gateway = await gatewayManager.connect({ orgId, userId });
    
    const network = await gatewayManager.getNetwork(gateway, channelName);
    const contract = await gatewayManager.getContract(network, chaincodeName, contractName);
    
    monitor.logInfo('Starting event listener for "ProductCreated" events...');
    // Corrected: Pass network and chaincodeId to the listener
    const listenerId = await eventListener.addChaincodeListener(
        network,
        chaincodeName,
        'ProductCreated',
        (event) => {
            const payload = new TextDecoder().decode(event.payload);
            monitor.logInfo('Received "ProductCreated" event:', {
                txId: event.transactionId,
                payload
            });
        }
    );

    monitor.logInfo('Submitting "createProduct" transaction...');
    const productId = `BAG-${Date.now()}`;
    const productData = {
      id: productId,
      model: 'Classic Tote',
      leather_type: 'Italian Calfskin',
    };
    
    let startTime = Date.now();
    const result = await transactionHandler.submitTransaction(contract, 'createProduct', {
        arguments: [productId, JSON.stringify(productData)]
    });

    monitor.logTransaction({
        channel: channelName,
        chaincode: chaincodeName,
        function: 'createProduct',
        transactionId: result.transactionId,
        success: result.success,
        duration: (Date.now() - startTime) / 1000,
        error: result.error
    });

    if (!result.success) throw result.error;
    monitor.logInfo(`Transaction successful! Tx ID: ${result.transactionId}`);

    monitor.logInfo(`Querying for product ${productId}...`);
    startTime = Date.now();
    const queryResult = await transactionHandler.evaluateTransaction(
        contract,
        'getProduct',
        productId
    );
    
    monitor.logQuery({
        channel: channelName,
        chaincode: chaincodeName,
        function: 'getProduct',
        success: queryResult.success,
        duration: (Date.now() - startTime) / 1000
    });
    
    if (queryResult.success) {
        monitor.logInfo('Query result:', queryResult.result);
    } else {
        monitor.logError(queryResult.error as Error, { operation: 'getProduct query' });
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

  } catch (error) {
    monitor.logError(error as Error, { operation: 'main_usage_script' });
  } finally {
    monitor.logInfo('Cleaning up resources...');
    eventListener.stopAllListeners();
    await gatewayManager.disconnectAll();
    monitor.logInfo('Done.');
    process.exit(0);
  }
}

main().catch(err => {
    console.error("Caught unhandled error in main:", err);
    process.exit(1);
});