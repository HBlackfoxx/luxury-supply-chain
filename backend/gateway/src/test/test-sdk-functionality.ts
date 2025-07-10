// backend/gateway/src/test/test-sdk.ts
// Test SDK functionality for fabric-gateway 1.x

import { SDKConfigManager } from '../config/sdk-config';
import { IdentityManager } from '../fabric/identity-manager';
import { GatewayManager } from '../fabric/gateway-manager';
import { TransactionHandler } from '../fabric/transaction-handler';
import { EventListenerManager } from '../fabric/event-listener';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function testSDKFunctionality() {
  console.log('=== Testing SDK Functionality ===');
  console.log('');
  
  const results: TestResult[] = [];

  // Test 1: Configuration Manager
  await testConfigManager(results);
  
  // Test 2: Identity Manager
  await testIdentityManager(results);
  
  // Test 3: Gateway Manager
  await testGatewayManager(results);
  
  // Test 4: Transaction Handler
  await testTransactionHandler(results);
  
  // Test 5: Event Listener
  await testEventListener(results);

  // Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}${result.error ? ': ' + result.error : ''}`);
  });
  
  console.log(`\nPassed: ${passed}/${total}`);
  
  return passed === total;
}

async function testConfigManager(results: TestResult[]) {
  console.log('1. Testing Configuration Manager...');
  
  try {
    const configManager = new SDKConfigManager('luxe-bags');
    const brandConfig = configManager.getBrandConfig();
    
    // Test brand configuration loading
    if (brandConfig.brand.id !== 'luxe-bags') {
      throw new Error('Brand ID mismatch');
    }
    
    // Test organization retrieval
    const org = configManager.getOrganization('luxebags');
    if (!org) {
      throw new Error('Organization not found');
    }
    
    // Test MSP ID
    const mspId = configManager.getMspId('luxebags');
    if (mspId !== 'LuxeBagsMSP') {
      throw new Error('MSP ID mismatch');
    }
    
    // Test peer endpoint
    const endpoint = configManager.getPeerEndpoint('luxebags', 0);
    if (endpoint !== 'localhost:7051') {
      throw new Error('Peer endpoint mismatch');
    }
    
    console.log('✅ Configuration Manager tests passed');
    results.push({ name: 'Configuration Manager', passed: true });
  } catch (error) {
    console.log('❌ Configuration Manager tests failed:', error);
    results.push({ 
      name: 'Configuration Manager', 
      passed: false, 
      error: (error as Error).message 
    });
  }
}

async function testIdentityManager(results: TestResult[]) {
  console.log('\n2. Testing Identity Manager...');
  
  try {
    const configManager = new SDKConfigManager('luxe-bags');
    const identityManager = new IdentityManager(configManager);
    
    // Test CA client creation
    const caClient = await identityManager.getCAClient('luxebags');
    if (!caClient) {
      throw new Error('CA client creation failed');
    }
    
    // Test identity storage path
    const identities = await identityManager.listIdentities('luxebags');
    console.log(`   Found ${identities.length} stored identities`);
    
    // Test identity retrieval (if admin exists)
    const adminIdentity = await identityManager.getIdentity('luxebags', 'admin');
    if (adminIdentity) {
      console.log('   Admin identity found');
      if (!adminIdentity.identity.mspId || !adminIdentity.signer) {
        throw new Error('Invalid identity structure');
      }
    } else {
      console.log('   Admin identity not found (needs enrollment)');
    }
    
    console.log('✅ Identity Manager tests passed');
    results.push({ name: 'Identity Manager', passed: true });
  } catch (error) {
    console.log('❌ Identity Manager tests failed:', error);
    results.push({ 
      name: 'Identity Manager', 
      passed: false, 
      error: (error as Error).message 
    });
  }
}

async function testGatewayManager(results: TestResult[]) {
  console.log('\n3. Testing Gateway Manager...');
  
  try {
    const configManager = new SDKConfigManager('luxe-bags');
    const identityManager = new IdentityManager(configManager);
    const gatewayManager = new GatewayManager(configManager, identityManager);
    
    // Test active connections
    const connections = gatewayManager.getActiveConnections();
    if (!Array.isArray(connections)) {
      throw new Error('getActiveConnections should return an array');
    }
    
    console.log(`   Active connections: ${connections.length}`);
    
    // Test connection check
    const isConnected = gatewayManager.isConnected('luxebags', 'user1');
    console.log(`   Connection check: ${isConnected ? 'connected' : 'not connected'}`);
    
    console.log('✅ Gateway Manager tests passed');
    results.push({ name: 'Gateway Manager', passed: true });
  } catch (error) {
    console.log('❌ Gateway Manager tests failed:', error);
    results.push({ 
      name: 'Gateway Manager', 
      passed: false, 
      error: (error as Error).message 
    });
  }
}

async function testTransactionHandler(results: TestResult[]) {
  console.log('\n4. Testing Transaction Handler...');
  
  try {
    const transactionHandler = new TransactionHandler();
    
    // Test transient data creation
    const transientData = transactionHandler.createTransientData({
      key1: 'value1',
      key2: { nested: 'value' }
    });
    
    if (!Buffer.isBuffer(transientData.key1)) {
      throw new Error('Transient data should be Buffer');
    }
    
    // Test argument creation
    const args = transactionHandler.createArguments(['arg1', { key: 'value' }]);
    if (!Array.isArray(args) || args.length !== 2) {
      throw new Error('Arguments creation failed');
    }
    
    console.log('✅ Transaction Handler tests passed');
    results.push({ name: 'Transaction Handler', passed: true });
  } catch (error) {
    console.log('❌ Transaction Handler tests failed:', error);
    results.push({ 
      name: 'Transaction Handler', 
      passed: false, 
      error: (error as Error).message 
    });
  }
}

async function testEventListener(results: TestResult[]) {
  console.log('\n5. Testing Event Listener...');
  
  try {
    const eventListener = new EventListenerManager();
    
    // Test active listeners
    const listeners = eventListener.getActiveListeners();
    if (!Array.isArray(listeners)) {
      throw new Error('getActiveListeners should return an array');
    }
    
    console.log(`   Active listeners: ${listeners.length}`);
    
    // Test checkpointer creation
    const checkpointer = eventListener.createCheckpointer('test-checkpoint');
    if (!checkpointer.getBlockNumber) {
      throw new Error('Invalid checkpointer structure');
    }
    
    console.log('✅ Event Listener tests passed');
    results.push({ name: 'Event Listener', passed: true });
  } catch (error) {
    console.log('❌ Event Listener tests failed:', error);
    results.push({ 
      name: 'Event Listener', 
      passed: false, 
      error: (error as Error).message 
    });
  }
}

// Run tests
testSDKFunctionality()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });