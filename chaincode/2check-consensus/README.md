# 2-Check Consensus Chaincode

This chaincode implements the 2-Check consensus mechanism for the luxury supply chain traceability system.

## Overview

The 2-Check consensus is a simple yet effective consensus mechanism that requires confirmation from both the sender and receiver of a transaction. This mimics real-world shipping and receiving processes.

## Key Features

- **Dual Confirmation**: Requires both sender and receiver to confirm the transaction
- **Trust-Based Automation**: High-trust parties can benefit from auto-confirmation
- **Dispute Management**: Built-in dispute resolution with evidence submission
- **Trust Scoring**: Dynamic trust scores that improve with successful transactions
- **Event Emission**: Comprehensive event system for external integration

## Smart Contract Functions

### Transaction Management
- `SubmitTransaction`: Create a new transaction
- `ConfirmSent`: Sender confirms shipment
- `ConfirmReceived`: Receiver confirms receipt
- `GetTransaction`: Retrieve transaction details
- `GetTransactionHistory`: Get full history of a transaction

### Dispute Resolution
- `RaiseDispute`: Initiate a dispute for a transaction
- `SubmitEvidence`: Add evidence to support dispute resolution

### Trust Management
- `GetTrustScore`: Retrieve trust score for a party
- Trust scores are automatically updated based on transaction outcomes

## Transaction States

1. **INITIATED**: Transaction created, awaiting sender confirmation
2. **SENT**: Sender confirmed, awaiting receiver confirmation
3. **RECEIVED**: Receiver confirmed, consensus pending
4. **VALIDATED**: Both parties confirmed, consensus achieved
5. **DISPUTED**: Transaction is under dispute
6. **TIMEOUT**: Transaction timed out (handled off-chain)

## Installation

```bash
# Navigate to chaincode directory
cd chaincode/2check-consensus

# Install dependencies
go mod download

# Build chaincode
go build
```

## Testing

```bash
# Run unit tests
go test ./...

# Run with verbose output
go test -v ./...
```

## Deployment

The chaincode is deployed as part of the Hyperledger Fabric network setup. See the network configuration for deployment details.

## Events

The chaincode emits the following events:
- `TRANSACTION_INITIATED`: New transaction created
- `CONFIRMATION_SENT`: Sender confirmed
- `CONFIRMATION_RECEIVED`: Receiver confirmed
- `CONSENSUS_ACHIEVED`: Both parties confirmed
- `DISPUTE_RAISED`: Dispute initiated
- `EVIDENCE_SUBMITTED`: Evidence added
- `AUTO_CONFIRMATION`: High-trust auto-confirmation

## Trust Score Calculation

Trust scores range from 0.0 to 1.0 and are calculated as:
```
Trust Score = Successful Transactions / Total Transactions
```

Parties with trust scores > 0.95 can benefit from auto-confirmation.