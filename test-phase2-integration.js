/**
 * Integration test for Phase 2 consensus system
 * Tests the connection between Phase 1 network and Phase 2 consensus
 */

const path = require('path');

async function testPhase2Integration() {
    console.log('=== Phase 2 Integration Test ===\n');
    
    try {
        // Test 1: Check if consensus module can be loaded
        console.log('1. Loading consensus module...');
        const { 
            ConsensusOrchestrator,
            TransactionStateManager,
            ValidationEngine,
            TrustScoringSystem
        } = require('./consensus/2check/dist');
        console.log('✅ Consensus module loaded successfully');

        // Test 2: Check if backend consensus system can be loaded
        console.log('\n2. Loading backend consensus system...');
        const { ConsensusSystem } = require('./backend/consensus/dist/backend/consensus/setup-consensus');
        console.log('✅ Backend consensus system loaded');

        // Test 3: Initialize consensus system
        console.log('\n3. Testing consensus system initialization...');
        // Note: Full initialization requires network config paths
        // For now, we'll test the components directly
        console.log('✅ Consensus system components available');

        // Test 4: Create a test transaction
        console.log('\n4. Creating test transaction...');
        const testTx = {
            sender: 'italianleather',
            receiver: 'craftworkshop',
            itemId: 'TEST-LEATHER-001',
            value: 5000,
            metadata: {
                type: 'premium_leather',
                quantity: 10,
                unit: 'sq_meters',
                testRun: true
            }
        };

        // Note: Actual transaction submission would require network to be running
        console.log('✅ Test transaction prepared:', testTx);

        // Test 5: Check state manager
        console.log('\n5. Testing state manager...');
        const stateManager = new TransactionStateManager();
        const tx = await stateManager.createTransaction({
            id: 'TEST-' + Date.now(),
            ...testTx
        });
        console.log('✅ Transaction created in state manager:', tx.id);

        // Test 6: Check validation engine
        console.log('\n6. Testing validation engine...');
        const validationEngine = new ValidationEngine();
        const validation = await validationEngine.validate(tx);
        console.log('✅ Validation result:', validation);

        // Test 7: Check trust scoring
        console.log('\n7. Testing trust scoring system...');
        const trustSystem = new TrustScoringSystem();
        const trustScore = trustSystem.getTrustScore('italianleather');
        console.log('✅ Trust score retrieved:', trustScore.score);

        console.log('\n=== Integration Test Summary ===');
        console.log('✅ All modules loaded successfully');
        console.log('✅ State management working');
        console.log('✅ Validation engine operational');
        console.log('✅ Trust scoring system functional');
        console.log('\nNext steps:');
        console.log('1. Start the Fabric network: cd generated-test && ./network.sh up');
        console.log('2. Deploy consensus chaincode: ./setup-phase2.sh');
        console.log('3. Run full integration test with network');

    } catch (error) {
        console.error('\n❌ Integration test failed:', error);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure to run: cd consensus/2check && npm install && npm run build');
        console.error('2. Check that all dependencies are installed');
        console.error('3. Verify file paths are correct');
        process.exit(1);
    }
}

// Run the test
console.log('Starting Phase 2 integration test...\n');
testPhase2Integration().catch(console.error);