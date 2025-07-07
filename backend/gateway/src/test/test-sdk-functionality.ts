// test-sdk-functionality.ts
// Save as: backend/gateway/src/test/test-sdk.ts

import { SDKConfigManager } from '../config/sdk-config';
import { WalletManager } from '../fabric/wallet-manager';
import { GatewayManager } from '../fabric/gateway-manager';
import * as fs from 'fs';
import * as path from 'path';

async function testSDKFunctionality() {
    console.log('=== Testing SDK Functionality ===');
    
    const tests = {
        configManager: false,
        walletManager: false,
        gatewayManager: false
    };

    try {
        // Test 1: Configuration Manager
        console.log('1. Testing Configuration Manager...');
        const configManager = new SDKConfigManager('luxe-bags');
        const brandConfig = configManager.getBrandConfig();
        
        if (brandConfig.brand.id === 'luxe-bags') {
            console.log('✅ Configuration loaded correctly');
            tests.configManager = true;
        } else {
            console.log('❌ Configuration loading failed');
        }

        // Test 2: Wallet Manager
        console.log('2. Testing Wallet Manager...');
        const walletManager = new WalletManager(configManager);
        const walletPath = configManager.getWalletPath('luxebags');
        
        if (walletPath.includes('luxe-bags/luxebags')) {
            console.log('✅ Wallet path generation correct');
            tests.walletManager = true;
        } else {
            console.log('❌ Wallet path generation failed');
        }

        // Test 3: Gateway Manager
        console.log('3. Testing Gateway Manager...');
        const gatewayManager = new GatewayManager(configManager, walletManager);
        
        if (gatewayManager.getActiveConnections().length === 0) {
            console.log('✅ Gateway manager initialized');
            tests.gatewayManager = true;
        } else {
            console.log('❌ Gateway manager initialization failed');
        }

    } catch (error) {
        console.error('Test failed:', error);
    }

    // Summary
    console.log('\n=== Test Summary ===');
    const passed = Object.values(tests).filter(t => t).length;
    const total = Object.values(tests).length;
    console.log(`Passed: ${passed}/${total}`);
    
    return passed === total;
}

// Run tests
testSDKFunctionality()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });