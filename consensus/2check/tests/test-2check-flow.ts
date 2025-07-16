// consensus/2check/tests/test-2check-flow.ts
// Test the complete 2-Check consensus flow

import { TransactionStateManager, TransactionState } from '../core/state/state-manager';
import { ValidationEngine } from '../core/validation/validation-engine';

interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

async function testCompleteFlow() {
  console.log('=== Testing 2-Check Consensus Flow ===\n');
  
  const results: TestResult[] = [];
  const stateManager = new TransactionStateManager();
  const validationEngine = new ValidationEngine();

  // Test 1: Create Transaction
  await runTest('Create Transaction', results, async () => {
    const tx = await stateManager.createTransaction({
      id: 'TX-001',
      sender: 'supplier1',
      receiver: 'manufacturer1',
      itemId: 'ITEM-001',
      value: 1000
    });

    if (tx.state !== TransactionState.CREATED) {
      throw new Error(`Expected state CREATED, got ${tx.state}`);
    }
  });

  // Test 2: Sender Confirmation
  await runTest('Sender Confirmation', results, async () => {
    await stateManager.confirmSent('TX-001', 'supplier1', {
      shippingLabel: 'SHIP-123'
    });

    const tx = stateManager.getTransaction('TX-001');
    if (tx?.state !== TransactionState.SENT) {
      throw new Error(`Expected state SENT, got ${tx?.state}`);
    }
  });

  // Test 3: Receiver Confirmation
  await runTest('Receiver Confirmation', results, async () => {
    await stateManager.confirmReceived('TX-001', 'manufacturer1', {
      condition: 'perfect'
    });

    const tx = stateManager.getTransaction('TX-001');
    if (tx?.state !== TransactionState.VALIDATED) {
      throw new Error(`Expected state VALIDATED, got ${tx?.state}`);
    }
  });

  // Test 4: Create Dispute Flow
  await runTest('Dispute Flow', results, async () => {
    // Create new transaction
    const tx = await stateManager.createTransaction({
      id: 'TX-002',
      sender: 'supplier2',
      receiver: 'manufacturer2',
      itemId: 'ITEM-002',
      value: 2000
    });

    // Sender confirms
    await stateManager.confirmSent('TX-002', 'supplier2');

    // Receiver disputes
    await stateManager.createDispute('TX-002', 'manufacturer2', 'not_received', {
      checked_locations: ['warehouse', 'dock'],
      last_contact: new Date().toISOString()
    });

    const disputedTx = stateManager.getTransaction('TX-002');
    if (disputedTx?.state !== TransactionState.DISPUTED) {
      throw new Error(`Expected state DISPUTED, got ${disputedTx?.state}`);
    }
  });

  // Test 5: Timeout Handling
  await runTest('Timeout Detection', results, async () => {
    // Create transaction with immediate timeout
    const tx = await stateManager.createTransaction({
      id: 'TX-003',
      sender: 'supplier3',
      receiver: 'manufacturer3',
      itemId: 'ITEM-003',
      value: 3000
    });

    // Manually set timeout to past
    tx.timeoutAt = new Date(Date.now() - 1000);

    // Wait for timeout checker (runs every minute in production)
    // For testing, manually trigger
    await stateManager.transitionState('TX-003', TransactionState.TIMEOUT, 'system', {
      reason: 'Test timeout'
    });

    const timedOutTx = stateManager.getTransaction('TX-003');
    if (timedOutTx?.state !== TransactionState.TIMEOUT) {
      throw new Error(`Expected state TIMEOUT, got ${timedOutTx?.state}`);
    }
  });

  // Test 6: Validation Engine
  await runTest('Validation Engine', results, async () => {
    const tx = stateManager.getTransaction('TX-001');
    if (!tx) throw new Error('Transaction not found');

    const validation = await validationEngine.validateForAutoApproval(tx);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.reason}`);
    }
  });

  // Test 7: Batch Operations
  await runTest('Batch Transaction Creation', results, async () => {
    const batchTransactions = [];
    for (let i = 0; i < 5; i++) {
      const tx = await stateManager.createTransaction({
        id: `BATCH-TX-${i}`,
        sender: 'trustedSupplier',
        receiver: 'trustedManufacturer',
        itemId: `BATCH-ITEM-${i}`,
        value: 500
      });
      batchTransactions.push(tx);
    }

    if (batchTransactions.length !== 5) {
      throw new Error('Failed to create batch transactions');
    }

    // Simulate batch confirmation
    for (const tx of batchTransactions) {
      await stateManager.confirmSent(tx.id, tx.sender);
      await stateManager.confirmReceived(tx.id, tx.receiver);
    }

    // Check all are validated
    const allValidated = batchTransactions.every(tx => {
      const current = stateManager.getTransaction(tx.id);
      return current?.state === TransactionState.VALIDATED;
    });

    if (!allValidated) {
      throw new Error('Not all batch transactions validated');
    }
  });

  // Test 8: Trust Score Events
  await runTest('Trust Score Events', results, async () => {
    let trustUpdateEmitted = false;
    
    stateManager.once('trust:update_required', (data) => {
      trustUpdateEmitted = true;
      
      if (!data.updates || data.updates.length !== 2) {
        throw new Error('Invalid trust update data');
      }
    });

    // Create and complete a transaction
    const tx = await stateManager.createTransaction({
      id: 'TX-TRUST-001',
      sender: 'supplierX',
      receiver: 'manufacturerX',
      itemId: 'ITEM-X',
      value: 5000
    });

    await stateManager.confirmSent(tx.id, tx.sender);
    await stateManager.confirmReceived(tx.id, tx.receiver);

    // Give event time to emit
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!trustUpdateEmitted) {
      throw new Error('Trust update event not emitted');
    }
  });

  // Test 9: Notification Events
  await runTest('Notification Events', results, async () => {
    const notifications: any[] = [];
    
    stateManager.on('notification:required', (data) => {
      notifications.push(data);
    });

    // Create transaction - should notify receiver when sent
    const tx = await stateManager.createTransaction({
      id: 'TX-NOTIFY-001',
      sender: 'supplierN',
      receiver: 'manufacturerN',
      itemId: 'ITEM-N',
      value: 1500
    });

    await stateManager.confirmSent(tx.id, tx.sender);

    // Give event time to emit
    await new Promise(resolve => setTimeout(resolve, 100));

    const sentNotification = notifications.find(n => n.type === 'transaction_sent');
    if (!sentNotification) {
      throw new Error('Transaction sent notification not emitted');
    }

    if (!sentNotification.recipients.includes(tx.receiver)) {
      throw new Error('Receiver not in notification recipients');
    }
  });

  // Test 10: Invalid State Transitions
  await runTest('Invalid State Transitions', results, async () => {
    const tx = stateManager.getTransaction('TX-001');
    if (!tx) throw new Error('Transaction not found');

    try {
      // Try to go from VALIDATED to SENT (invalid)
      await stateManager.transitionState('TX-001', TransactionState.SENT, 'test');
      throw new Error('Should have thrown error for invalid transition');
    } catch (error: any) {
      if (!error.message.includes('Invalid transition')) {
        throw error;
      }
    }
  });

  // Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    console.log(`${status} ${result.testName}${duration}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  
  return failed === 0;
}

async function runTest(
  name: string,
  results: TestResult[],
  testFn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();
  
  try {
    await testFn();
    results.push({
      testName: name,
      passed: true,
      duration: Date.now() - startTime
    });
  } catch (error) {
    results.push({
      testName: name,
      passed: false,
      error: (error as Error).message,
      duration: Date.now() - startTime
    });
  }
}

// Run the tests
if (require.main === module) {
  testCompleteFlow()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}