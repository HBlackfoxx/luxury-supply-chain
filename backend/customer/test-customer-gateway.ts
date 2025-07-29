// backend/customer/test-customer-gateway.ts
// Test script for customer gateway

import axios from 'axios';
import { ConsensusSystem } from '../consensus/setup-consensus';
import { CustomerGateway } from './customer-gateway';

const API_URL = 'http://localhost:3002/api/customer';
const ADMIN_URL = 'http://localhost:3002/api/admin';
const SERVICE_ACCOUNT_URL = 'http://localhost:3002/api/service-account';

async function testCustomerGateway() {
  console.log('=== Testing Customer Gateway ===\n');
  
  // 1. Initialize systems
  const consensusSystem = new ConsensusSystem('luxe-bags');
  await consensusSystem.initialize('luxebags', 'admin');
  
  const customerGateway = new CustomerGateway(consensusSystem);
  await customerGateway.start(3002);
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // 2. Test customer registration
    console.log('1. Testing customer registration...');
    const registerResponse = await axios.post(`${API_URL}/auth/register`, {
      email: 'john.doe@example.com',
      phone: '+1234567890',
      name: 'John Doe'
    });
    
    console.log('Registration successful:', registerResponse.data.customer);
    const token = registerResponse.data.token;
    
    // 3. Test ownership claim
    console.log('\n2. Testing ownership claim...');
    try {
      const claimResponse = await axios.post(
        `${API_URL}/ownership/claim`,
        {
          productId: 'LB-2024-001',
          claimMethod: 'purchase',
          purchaseReceipt: 'RECEIPT-2024-001',
          location: 'LuxeBags Boutique Milano',
          timestamp: new Date()
        },
        {
          headers: { Authorization: token }
        }
      );
      
      console.log('Ownership claimed:', claimResponse.data.product);
    } catch (error: any) {
      console.log('Ownership claim failed (expected if already owned):', error.response?.data?.error);
    }
    
    // 4. Test getting owned products
    console.log('\n3. Testing get owned products...');
    const productsResponse = await axios.get(
      `${API_URL}/ownership/products`,
      {
        headers: { Authorization: token }
      }
    );
    
    console.log(`Found ${productsResponse.data.count} owned products`);
    
    // 5. Test product verification
    console.log('\n4. Testing product verification...');
    const verifyResponse = await axios.get(
      `${API_URL}/verify/LB-2024-001`
    );
    
    console.log('Verification result:', verifyResponse.data.verification);
    
    // 6. Test transfer generation
    console.log('\n5. Testing transfer code generation...');
    if (productsResponse.data.products.length > 0) {
      const transferResponse = await axios.post(
        `${API_URL}/ownership/transfer/generate`,
        {
          productId: productsResponse.data.products[0].productId,
          reason: 'sale'
        },
        {
          headers: { Authorization: token }
        }
      );
      
      console.log('Transfer code generated:', transferResponse.data.transferCode);
      console.log('Expires in:', transferResponse.data.expiresIn);
      
      // 7. Test transfer completion (with different user)
      console.log('\n6. Testing transfer completion...');
      const newUserResponse = await axios.post(`${API_URL}/auth/register`, {
        email: 'jane.smith@example.com',
        phone: '+9876543210',
        name: 'Jane Smith'
      });
      
      const newUserToken = newUserResponse.data.token;
      
      const completeTransferResponse = await axios.post(
        `${API_URL}/ownership/transfer/complete`,
        {
          transferCode: transferResponse.data.transferCode
        },
        {
          headers: { Authorization: newUserToken }
        }
      );
      
      console.log('Transfer completed:', completeTransferResponse.data.message);
    }
    
    // 8. Test QR code generation and verification
    console.log('\n7. Testing QR code functionality...');
    const qrService = customerGateway.getServices().qr;
    const qrData = qrService.generateQRData('LB-2024-002', 'LuxeBags', 'Classic Tote');
    const qrUrl = qrService.generateQRUrl(qrData);
    
    console.log('QR URL generated:', qrUrl);
    
    // Extract encoded data from URL
    const encodedData = qrUrl.split('/v/')[1];
    const qrVerifyResponse = await axios.get(`${API_URL}/v/${encodedData}`);
    
    console.log('QR verification:', qrVerifyResponse.data);
    
    // 9. Test recovery initiation
    console.log('\n8. Testing account recovery...');
    const recoveryResponse = await axios.post(`${API_URL}/recovery/initiate`, {
      email: 'lost.user@example.com',
      phone: '+1234567890',
      productIds: ['LB-2024-001'],
      verificationMethod: 'email'
    });
    
    console.log('Recovery initiated:', recoveryResponse.data);
    
    // 10. Test recovery verification
    const verifyRecoveryResponse = await axios.post(`${API_URL}/recovery/verify`, {
      requestId: recoveryResponse.data.requestId,
      verificationCode: '123456' // Any 6-char code for PoC
    });
    
    console.log('Recovery verified:', verifyRecoveryResponse.data);
    
    // 11. Test admin recovery management
    console.log('\n9. Testing admin recovery management...');
    const pendingResponse = await axios.get(`${ADMIN_URL}/recovery/pending`);
    
    console.log(`Found ${pendingResponse.data.count} pending recovery requests`);
    
    // 12. Test reporting stolen product
    console.log('\n10. Testing stolen product reporting...');
    const reportResponse = await axios.post(
      `${API_URL}/ownership/report`,
      {
        productId: 'LB-2024-001',
        type: 'stolen',
        location: 'Milano, Italy',
        policeReport: 'POLICE-2024-001',
        description: 'Stolen from hotel room'
      },
      {
        headers: { Authorization: token }
      }
    );
    
    console.log('Product reported:', reportResponse.data);
    
    // 13. Verify stolen product shows alert
    const stolenVerifyResponse = await axios.get(
      `${API_URL}/verify/LB-2024-001`
    );
    
    console.log('Stolen product alerts:', stolenVerifyResponse.data.verification.alerts);
    
    // 14. Test service account features
    console.log('\n11. Testing service account management...');
    
    // Get account balance
    const balanceResponse = await axios.get(
      `${SERVICE_ACCOUNT_URL}/balance/luxebags-service`
    );
    
    console.log('LuxeBags service account balance: $', balanceResponse.data.balance);
    
    // Get fee estimate
    const estimateResponse = await axios.post(
      `${SERVICE_ACCOUNT_URL}/estimate-fee`,
      {
        operation: 'ownership_claim',
        productBrand: 'luxebags'
      }
    );
    
    console.log('Ownership claim fee estimate:', estimateResponse.data.estimate);
    
    // Get transaction history
    const txHistoryResponse = await axios.get(
      `${SERVICE_ACCOUNT_URL}/transactions/luxebags-service`
    );
    
    console.log(`Service account has ${txHistoryResponse.data.count} transactions`);
    
    // Get usage analytics
    const analyticsResponse = await axios.get(
      `${SERVICE_ACCOUNT_URL}/analytics/luxebags-service`
    );
    
    console.log('Service account analytics:');
    console.log('- Total spent: $', analyticsResponse.data.analytics.totalSpent);
    console.log('- Total transactions:', analyticsResponse.data.analytics.totalTransactions);
    console.log('- Average cost: $', analyticsResponse.data.analytics.averageTransactionCost);
    
    // Test product verification (which should be free)
    console.log('\n12. Testing verification (no fee)...');
    const verifyFeeResponse = await axios.post(
      `${SERVICE_ACCOUNT_URL}/estimate-fee`,
      {
        operation: 'verification',
        productBrand: 'luxebags'
      }
    );
    
    console.log('Verification fee: $', verifyFeeResponse.data.estimate.estimatedFee);
    
  } catch (error: any) {
    console.error('Test error:', error.response?.data || error.message);
  } finally {
    // Cleanup
    console.log('\n=== Shutting down ===');
    await customerGateway.stop();
    await consensusSystem.shutdown();
  }
}

// Run the test
if (require.main === module) {
  testCustomerGateway().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}