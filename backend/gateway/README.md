# Hyperledger Fabric Gateway SDK - Updated for fabric-gateway 1.x

This SDK has been completely rewritten to work with the new `@hyperledger/fabric-gateway` v1.x API, which is the recommended way to interact with Hyperledger Fabric 2.5.

## Quick Start

1. **Setup certificates**: `./setup-certificates.sh`
2. **Install**: `npm install`
3. **Build**: `npm run build`
4. **Test**: `npm test`
5. **Run example**: `npm run dev`

See [Certificate Setup Guide](./CERTIFICATE_SETUP.md) and [Quick Start Guide](./QUICK_START.md) for detailed instructions.

## Key Changes from Old SDK

### 1. No More Wallets
- The new fabric-gateway doesn't have wallet management
- Identities are loaded directly from filesystem
- Replaced `WalletManager` with `IdentityManager`

### 2. Simplified Connection
- No more connection profiles
- Direct gRPC connection to peers
- Identity and signer provided directly to `connect()`

### 3. New Event System
- Events use async iterators instead of callbacks
- Different API for chaincode and block events
- Built-in checkpointing support

### 4. Updated Transaction API
- Simpler transaction submission
- Better error handling
- Support for transient data via proposal API

## Installation

```bash
cd backend/gateway
npm install
```

## File Structure

```
backend/gateway/src/
├── config/
│   └── sdk-config.ts         # Configuration management
├── fabric/
│   ├── identity-manager.ts   # Identity and enrollment
│   ├── gateway-manager.ts    # Gateway connections
│   ├── transaction-handler.ts # Transaction submission
│   └── event-listener.ts     # Event monitoring
├── monitoring/
│   └── fabric-monitor.ts     # Logging and metrics
└── example/
    └── usage.ts             # Example usage
```

## Usage Guide

### 1. Initialize Components

```typescript
import { SDKConfigManager } from './config/sdk-config';
import { IdentityManager } from './fabric/identity-manager';
import { GatewayManager } from './fabric/gateway-manager';
import { TransactionHandler } from './fabric/transaction-handler';

const configManager = new SDKConfigManager('your-brand-id');
const identityManager = new IdentityManager(configManager);
const gatewayManager = new GatewayManager(configManager, identityManager);
const transactionHandler = new TransactionHandler();
```

### 2. Enroll Admin

```typescript
await identityManager.enrollAdmin('orgId');
```

### 3. Register Users

```typescript
await identityManager.registerAndEnrollUser('orgId', 'userId', {
  affiliation: 'org.department1',
  attrs: [{ name: 'role', value: 'client', ecert: true }]
});
```

### 4. Connect to Gateway

```typescript
const gateway = await gatewayManager.connect({
  orgId: 'orgId',
  userId: 'userId',
  channelName: 'channel-name'
});

const network = await gatewayManager.getNetwork(gateway);
const contract = await gatewayManager.getContract(network, 'chaincode-name');
```

### 5. Submit Transactions

```typescript
const result = await transactionHandler.submitTransaction(
  contract,
  'functionName',
  {
    arguments: ['arg1', 'arg2']
  }
);
```

### 6. Listen for Events

```typescript
await eventListener.startContractEventListener(
  contract,
  'EventName',
  async (event) => {
    console.log('Event received:', event);
  }
);
```

## Identity Storage

Identities are stored in:
```
backend/gateway/identities/<brand-id>/<user-id>/
├── cert.pem    # Certificate
├── key.pem     # Private key
└── mspId.txt   # MSP identifier
```

## Error Handling

The SDK includes automatic retry logic for transient errors:
- Network timeouts
- Connection failures
- Temporary unavailability

It won't retry on:
- Endorsement policy failures
- MVCC conflicts
- Invalid transactions

## Monitoring

Enable Prometheus metrics:

```typescript
const monitor = new FabricMonitor({
  enablePrometheus: true,
  prometheusPort: 9090,
  logLevel: 'info',
  logFile: './logs/fabric.log'
});
```

Metrics available at `http://localhost:9090/metrics`

## Development

```bash
# Build TypeScript
npm run build

# Run example
npm run dev

# Compile and check types
npx tsc --noEmit
```

## Troubleshooting

### Certificate Errors
- Ensure crypto materials are generated correctly
- Check TLS certificates in the crypto path
- Verify hostnames match certificate SANs

### Connection Issues
- Check if peers are running
- Verify ports are correct
- Ensure Docker network connectivity

### Identity Not Found
- Run admin enrollment first
- Check identity storage path
- Verify MSP IDs match configuration

## Migration from Old SDK

If migrating from fabric-network SDK:

1. Remove all wallet-related code
2. Replace `Gateway` class usage with new `connect()` function
3. Update event listeners to use async iterators
4. Remove connection profile references
5. Update transaction submission code

See `example/usage.ts` for complete working example.