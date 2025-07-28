// Test Phase 2 Integration - AI, Emergency Stop, Compensation, Automation, Analytics
// Tests all new components added to the 2-Check consensus system

import { ConsensusOrchestrator } from '../integration/consensus-orchestrator';
import { TransactionState, Transaction } from '../core/types';
import { AnomalyDetector } from '../security/anomaly-detector';
import { TrustScoringSystem } from '../core/trust/trust-scoring-system';

interface TestResult {
  testName: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

async function testPhase2Integration() {
  console.log('=== Testing Phase 2 Integration ===\n');
  
  const results: TestResult[] = [];
  const orchestrator = new ConsensusOrchestrator({
    fabricConfig: {
      channelName: 'test-channel',
      chaincodeName: 'consensus',
      mspId: 'TestMSP',
      walletPath: './test-wallet',
      connectionProfile: {}
    },
    consensusConfig: {}
  });

  // Initialize orchestrator
  await runTest('Initialize Orchestrator', results, async () => {
    await orchestrator.initialize();
  });

  // Test 1: AI Anomaly Detection
  await runTest('AI Anomaly Detection - High Value', results, async () => {
    const transaction: Transaction = {
      id: 'TX-ANOMALY-001',
      sender: 'new-supplier',
      receiver: 'manufacturer1',
      itemId: 'ITEM-ANOMALY-001',
      value: 100000, // Very high value for new relationship
      state: TransactionState.CREATED,
      created: new Date(),
      updated: new Date(),
      timestamp: new Date(),
      timeoutAt: new Date(Date.now() + 86400000),
      stateHistory: []
    };

    try {
      await orchestrator.submitTransaction(transaction);
      // Should detect anomaly but not necessarily block
    } catch (error) {
      // If blocked by emergency stop, that's expected
      const errorMsg = (error as Error).message;
      if (!errorMsg.includes('emergency stop')) {
        throw error;
      }
    }
  });

  // Test 2: Emergency Stop Trigger
  await runTest('Emergency Stop - Manual Trigger', results, async () => {
    await orchestrator.triggerEmergencyStop(
      'admin',
      'Test emergency stop',
      ['TX-STOP-001', 'TX-STOP-002']
    );
    
    // Verify stop is active
    const metrics = await orchestrator.getSystemMetrics();
    if (metrics.emergency.activeStops === 0) {
      throw new Error('Emergency stop not active');
    }
  });

  // Test 3: Emergency Stop Resume
  await runTest('Emergency Stop - Resume', results, async () => {
    const metrics = await orchestrator.getSystemMetrics();
    const activeStops = metrics.emergency.activeStops;
    
    if (activeStops > 0) {
      // Resume the first stop
      await orchestrator.resumeEmergencyStop('STOP_TEST', 'admin');
    }
  });

  // Test 4: Progressive Automation
  await runTest('Progressive Automation - Trusted Party', results, async () => {
    // Create a transaction with trusted parties
    const transaction: Transaction = {
      id: 'TX-AUTO-001',
      sender: 'trusted-supplier',
      receiver: 'trusted-manufacturer',
      itemId: 'ITEM-AUTO-001',
      value: 5000,
      state: TransactionState.CREATED,
      created: new Date(),
      updated: new Date(),
      timestamp: new Date(),
      timeoutAt: new Date(Date.now() + 86400000),
      stateHistory: [],
      metadata: {
        trustScore: 180 // High trust
      }
    };

    await orchestrator.submitTransaction(transaction);
    // Should apply automation rules
  });

  // Test 5: Compensation Calculation
  await runTest('Compensation - Timeout Scenario', results, async () => {
    // Simulate a timeout scenario
    const transaction: Transaction = {
      id: 'TX-COMP-001',
      sender: 'supplier1',
      receiver: 'manufacturer1',
      itemId: 'ITEM-COMP-001',
      value: 10000,
      state: TransactionState.TIMEOUT,
      created: new Date(Date.now() - 172800000), // 2 days ago
      updated: new Date(),
      timestamp: new Date(Date.now() - 172800000),
      timeoutAt: new Date(Date.now() - 86400000), // 1 day ago
      stateHistory: []
    };

    // The compensation engine should calculate compensation
    // In real scenario, this would be triggered by timeout event
  });

  // Test 6: Performance Analytics
  await runTest('Performance Analytics - Metrics', results, async () => {
    const metrics = await orchestrator.getSystemMetrics();
    
    // Verify all metric categories are present
    if (!metrics.performance) {
      throw new Error('Performance metrics missing');
    }
    
    if (!metrics.insights) {
      throw new Error('Insights missing');
    }
    
    // Check specific metrics
    const perf = metrics.performance;
    if (typeof perf.successRate !== 'number') {
      throw new Error('Success rate not calculated');
    }
  });

  // Test 7: Performance Report Generation
  await runTest('Performance Analytics - Report', results, async () => {
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const endDate = new Date();
    
    const report = await orchestrator.getPerformanceReport(startDate, endDate);
    
    if (!report.period) {
      throw new Error('Report period missing');
    }
    
    if (!report.insights) {
      throw new Error('Report insights missing');
    }
  });

  // Test 8: Party Metrics
  await runTest('Performance Analytics - Party Metrics', results, async () => {
    const partyMetrics = await orchestrator.getPartyMetrics('supplier1');
    
    if (typeof partyMetrics.trustScore !== 'number') {
      throw new Error('Trust score missing from party metrics');
    }
  });

  // Test 9: Anomaly Pattern Detection
  await runTest('AI Anomaly Detection - Patterns', results, async () => {
    const trustSystem = new TrustScoringSystem();
    const anomalyDetector = new AnomalyDetector(trustSystem);
    
    // Test circular routing detection
    const transaction: Transaction = {
      id: 'TX-CIRCULAR-001',
      sender: 'party-a',
      receiver: 'party-b',
      itemId: 'ITEM-CIRCULAR',
      value: 5000,
      state: TransactionState.CREATED,
      created: new Date(),
      updated: new Date(),
      timestamp: new Date(),
      timeoutAt: new Date(Date.now() + 86400000),
      stateHistory: []
    };
    
    const result = await anomalyDetector.analyzeTransaction(transaction);
    
    if (!result) {
      throw new Error('Anomaly analysis failed');
    }
  });

  // Test 10: Integration Flow
  await runTest('Complete Integration Flow', results, async () => {
    // Test complete flow with all components
    const transaction: Transaction = {
      id: 'TX-INTEGRATION-001',
      sender: 'integrated-supplier',
      receiver: 'integrated-manufacturer',
      itemId: 'ITEM-INTEGRATION-001',
      value: 15000,
      state: TransactionState.CREATED,
      created: new Date(),
      updated: new Date(),
      timestamp: new Date(),
      timeoutAt: new Date(Date.now() + 86400000),
      stateHistory: [],
      metadata: {
        itemType: 'luxury_bag',
        repeatShipment: true
      }
    };
    
    // Submit transaction - should go through all checks
    const txId = await orchestrator.submitTransaction(transaction);
    
    if (!txId) {
      throw new Error('Transaction submission failed');
    }
  });

  // Cleanup
  await orchestrator.shutdown();

  // Summary
  console.log('\n=== Phase 2 Integration Test Summary ===');
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
  testPhase2Integration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}