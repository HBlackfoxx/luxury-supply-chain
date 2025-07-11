// backend/gateway/src/test/test-sdk-functionality.ts
// Test SDK functionality for fabric-gateway 1.x
// CORRECTED version

import { SDKConfigManager } from '../config/sdk-config';
import { IdentityManager } from '../fabric/identity-manager';
import { GatewayManager } from '../fabric/gateway-manager';
import { TransactionHandler } from '../fabric/transaction-handler';
import { EventListenerManager } from '../fabric/event-listener';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function testSDKFunctionality() {
  console.log('=== Testing SDK Functionality ===');
  const results: TestResult[] = [];
  const brandId = 'luxe-bags'; // Assuming this is your test brand
  const orgId = 'luxebags';

  await runTest('Configuration Manager', results, async () => {
    const configManager = new SDKConfigManager(brandId);
    const brandConfig = configManager.getBrandConfig();
    if (brandConfig.brand.id !== brandId) throw new Error('Brand ID mismatch');
    const org = configManager.getOrganization(orgId);
    if (!org) throw new Error('Organization not found');
    const mspId = configManager.getMspId(orgId);
    if (mspId !== 'LuxeBagsMSP') throw new Error('MSP ID mismatch');
    const endpoint = configManager.getPeerEndpoint(orgId, 0);
    if (endpoint !== 'localhost:7051') throw new Error('Peer endpoint mismatch');
  });

  await runTest('Identity Manager', results, async () => {
      const configManager = new SDKConfigManager(brandId);
      const identityManager = new IdentityManager(configManager);
      const caClient = await identityManager.getCAClient(orgId);
      if (!caClient) throw new Error('CA client creation failed');
      // A simple check that getIdentity doesn't throw for a non-existent user
      const identity = await identityManager.getIdentity(orgId, 'nonexistentuser');
      if (identity !== null) throw new Error('Should return null for non-existent user');
  });

  await runTest('Gateway Manager', results, async () => {
      const configManager = new SDKConfigManager(brandId);
      const identityManager = new IdentityManager(configManager);
      const gatewayManager = new GatewayManager(configManager, identityManager);
      const connections = gatewayManager.getActiveConnections();
      if (!Array.isArray(connections)) throw new Error('getActiveConnections should return an array');
      const isConnected = gatewayManager.isConnected(orgId, 'user1');
      if (isConnected) throw new Error('Should not be connected initially');
  });
  
  await runTest('Transaction Handler', results, async () => {
      const transactionHandler = new TransactionHandler();
      if (typeof transactionHandler.submitTransaction !== 'function') {
          throw new Error('submitTransaction method not found');
      }
      if (typeof transactionHandler.evaluateTransaction !== 'function') {
          throw new Error('evaluateTransaction method not found');
      }
  });

  await runTest('Event Listener Manager', results, async () => {
      const eventListener = new EventListenerManager();
      const listeners = eventListener.getActiveListeners();
      if (!Array.isArray(listeners)) throw new Error('getActiveListeners should return an array');
      eventListener.emit('test'); // Just make sure it doesn't crash
  });

  // --- Summary ---
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  results.forEach(result => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} - ${result.name}${result.error ? `: ${result.error}` : ''}`);
  });
  console.log(`\nResult: ${passed}/${results.length} tests passed.`);
  return passed === results.length;
}

async function runTest(name: string, results: TestResult[], testFn: () => Promise<void>) {
    try {
        await testFn();
        results.push({ name, passed: true });
        console.log(`✅ ${name}: Passed`);
    } catch (error) {
        results.push({ name, passed: false, error: (error as Error).message });
        console.log(`❌ ${name}: Failed - ${(error as Error).message}`);
    }
}

testSDKFunctionality()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error("\nUnhandled error during test execution:", error);
    process.exit(1);
  });