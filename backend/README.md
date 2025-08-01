# Luxury Supply Chain Backend Services

This backend provides the API services for the Luxury Supply Chain system, connecting the web application to Hyperledger Fabric blockchain.

## Architecture

The backend consists of several integrated services:

1. **Consensus API** (Port 4000) - B2B transaction management with 2-Check consensus
2. **Customer Gateway** (Port 3002) - Customer ownership and verification services
3. **Fabric Gateway** - Connection to Hyperledger Fabric network
4. **ERP Integration** - Integration with existing ERP systems

## Prerequisites

- Node.js 18+
- Running Hyperledger Fabric network (see `/network` directory)
- Deployed chaincodes (luxury-supply-chain and 2check-consensus)

## Quick Start

1. Install dependencies:
```bash
npm run install-all
```

2. Start the Fabric network (if not already running):
```bash
cd ../network
./scripts/start-network.sh
```

3. Run the backend services:
```bash
npm run dev
```

This will start:
- B2B Consensus API on http://localhost:4000
- Customer Gateway on http://localhost:3002

## API Endpoints

### B2B Consensus API (http://localhost:4000/api/consensus)

- `POST /transactions` - Create new B2B transaction
- `GET /transactions/:id` - Get transaction details
- `POST /transactions/:id/confirm-sent` - Confirm sending
- `POST /transactions/:id/confirm-received` - Confirm receipt
- `GET /transactions/pending/:participantId` - Get pending transactions
- `POST /transactions/:id/dispute` - Create dispute
- `GET /trust/:participantId` - Get trust score
- `GET /trust/:participantId/history` - Get trust history

### Customer API (http://localhost:3002/api/customer)

- `POST /claim` - Claim ownership
- `POST /transfer` - Transfer ownership
- `GET /verify/:qrData` - Verify authenticity
- `POST /report-stolen` - Report item as stolen
- `POST /recovery/request` - Request account recovery

## Authentication

For B2B API, include these headers:
- `x-org-id`: Organization ID (e.g., 'luxebags', 'italianleather')
- `x-user-id`: User ID
- `x-user-role`: User role
- `Authorization`: Bearer token (use 'Bearer fake-jwt-token' for development)

## Environment Variables

Create a `.env` file:

```env
# Port configuration
PORT=4000
CONSENSUS_API_PORT=4000
CUSTOMER_API_PORT=3002

# Fabric configuration
BRAND_ID=luxebags

# Customer gateway
QR_SECRET=your-qr-secret-change-in-production
BASE_URL=https://verify.luxe-bags.luxury

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Development

Run in development mode with hot reload:
```bash
npm run dev
```

## Production

Build and run:
```bash
npm run build
npm start
```

## Testing

Test the connection:
```bash
curl http://localhost:4000/health
```

Test B2B transaction creation:
```bash
curl -X POST http://localhost:4000/api/consensus/transactions \
  -H "Content-Type: application/json" \
  -H "x-org-id: luxebags" \
  -H "x-user-id: user1" \
  -H "x-user-role: user" \
  -H "Authorization: Bearer fake-jwt-token" \
  -d '{
    "receiver": "italianleather",
    "itemId": "LEATHER-001",
    "value": 5000,
    "metadata": {
      "description": "Premium Italian Calfskin",
      "quantity": 10
    }
  }'
```

## Troubleshooting

1. **Connection refused**: Ensure Fabric network is running
2. **Identity not found**: Run enrollment scripts in `/backend/gateway`
3. **Channel not found**: Ensure channel is created and peers have joined
4. **Chaincode errors**: Verify chaincodes are installed and instantiated

## Architecture Details

### 2-Check Consensus Flow
1. Sender creates transaction
2. Sender confirms sending
3. Receiver confirms receipt
4. Transaction is validated automatically
5. Trust scores are updated

### Trust Scoring
- New partners start at 50%
- Successful transactions increase score
- Disputes decrease score
- Higher scores enable:
  - Batch operations
  - Auto-approval for routine transactions
  - Priority support