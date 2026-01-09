# Luxury Supply Chain Traceability System

A configurable luxury supply chain traceability system built on Hyperledger Fabric with 2-Check consensus and customer ownership tracking. This proof-of-concept demonstrates how luxury brands can implement blockchain-based authenticity verification while hiding all blockchain complexity from end users.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Services & Ports](#services--ports)
- [Frontend Applications](#frontend-applications)
- [Backend Services](#backend-services)
- [Smart Contracts (Chaincode)](#smart-contracts-chaincode)
- [Network Scripts](#network-scripts)
- [Docker Configuration](#docker-configuration)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Overview

This system enables luxury brands to:
- Track products from raw materials to customer ownership
- Verify product authenticity via QR codes
- Enable secure customer-to-customer resale
- Protect against counterfeits and theft
- Build trust through transparent supply chain history

**Key Innovation**: Customers interact with a simple web interface - no blockchain knowledge, wallets, or cryptocurrency required.

## Key Features

### 2-Check Consensus
Mimics real-world shipping/receiving processes:
1. Sender confirms shipment
2. Receiver confirms receipt
3. Transaction validated automatically

### Hidden Blockchain Complexity
- No customer blockchain identities
- No gas fees or wallets
- Simple email/phone-based ownership
- Gateway handles all blockchain operations

### Digital Birth Certificates
- Created at manufacturing
- Immutable product history
- Materials and craftsman tracking
- Downloadable certificates

### Privacy-Preserved Ownership
- Hash-based owner identification
- Personal data stored off-chain
- GDPR compliant design
- Secure transfer codes

### Trust Scoring
- Progressive automation based on history
- Rewards reliable partners
- Reduces friction over time

## Architecture

```
                                    CUSTOMERS
                                        |
                                   [QR Scan]
                                        |
                    +-------------------v-------------------+
                    |         Customer Frontend            |
                    |         (Next.js :3001)              |
                    +-------------------+-------------------+
                                        |
                    +-------------------v-------------------+
                    |        Customer Gateway              |
                    |        (Node.js :3010)               |
                    +-------------------+-------------------+
                                        |
        +---------------+---------------+---------------+---------------+
        |               |               |               |               |
+-------v-------+ +-----v-------+ +-----v-------+ +-----v-------+
|   LuxeBags    | |  Italian    | |   Craft     | |  Luxury     |
|   Backend     | |  Leather    | |  Workshop   | |  Retail     |
|   (:4001)     | |  (:4002)    | |  (:4003)    | |  (:4004)    |
+-------+-------+ +-----+-------+ +-----+-------+ +-----+-------+
        |               |               |               |
        +---------------+-------+-------+---------------+
                                |
                    +-----------v-----------+
                    |   Hyperledger Fabric  |
                    |   Blockchain Network  |
                    |   - 3 Orderers (Raft) |
                    |   - 5 Peers           |
                    |   - 4 CAs             |
                    |   - 5 CouchDB         |
                    +-----------------------+
                                |
                    +-----------v-----------+
                    |   Smart Contracts     |
                    |   - Supply Chain      |
                    |   - 2-Check Consensus |
                    |   - Ownership         |
                    +-----------------------+
```

### Organizations

| Organization | Role | Peers | Port Range |
|--------------|------|-------|------------|
| LuxeBags | Brand Owner | 2 | 7051-8051 |
| Italian Leather | Supplier | 1 | 9051 |
| Craft Workshop | Manufacturer | 1 | 10051 |
| Luxury Retail | Retailer | 1 | 11051 |

## Technology Stack

### Blockchain
- **Hyperledger Fabric 2.5+** with Channel Participation API
- **Smart Contracts** in Go
- **Raft Consensus** (3 orderers)
- **CouchDB** for rich queries
- **External Chaincode** as a Service (CCAAS)

### Backend
- **Node.js 18** with TypeScript
- **Express.js** REST APIs
- **PostgreSQL 15** for user management
- **fabric-gateway** SDK 1.5+

### Frontend
- **Next.js 15** (B2B Dashboard)
- **Next.js 14** (Customer App)
- **Tailwind CSS** for styling
- **Zustand** for state management
- **React Query** for data fetching

### Infrastructure
- **Docker & Docker Compose**
- **jsQR** for QR scanning (no external service)

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- Go 1.20+ (for chaincode building)
- 8GB+ RAM recommended
- Linux/WSL environment

## Quick Start

### Option 1: Full Setup Script

```bash
# Clone and enter directory
cd luxury-supply-chain

# Run complete setup (generates config, starts network, deploys chaincode)
./setup-network.sh

# Access applications:
# - B2B Dashboard: http://localhost:3000
# - Customer App: http://localhost:3001
```

### Option 2: Step-by-Step Setup

```bash
# 1. Generate network configuration
./test-config-generation.sh

# 2. Generate crypto materials
cd generated-test
./scripts/generate-crypto.sh

# 3. Start Fabric network
./scripts/start-network.sh

# 4. Create channel
./scripts/create-channel.sh

# 5. Deploy chaincode
./scripts/deploy-external-chaincode.sh

# 6. Setup gateway certificates
cd ../backend/gateway
echo "y" | ./setup-certificates.sh
cd ../..

# 7. Start application stack
docker-compose up -d
```

### Restart After Setup

```bash
# Quick restart (preserves blockchain state)
./restart-network.sh
```

### Full Teardown

```bash
# Stop everything and optionally remove data
./teardown-network.sh
```

## Services & Ports

### Application Services

| Service | Port | Description |
|---------|------|-------------|
| B2B Frontend | 3000 | Stakeholder dashboard |
| Customer Frontend | 3001 | Customer web app |
| Customer Gateway | 3010 | B2C API gateway |
| LuxeBags API | 4001 | Brand owner backend |
| Italian Leather API | 4002 | Supplier backend |
| Craft Workshop API | 4003 | Manufacturer backend |
| Luxury Retail API | 4004 | Retailer backend |
| PostgreSQL | 5432 | User database |

### Blockchain Infrastructure

| Service | Port | Description |
|---------|------|-------------|
| Orderer 1 | 7050 | Raft consensus |
| Orderer 2 | 8050 | Raft consensus |
| Orderer 3 | 9050 | Raft consensus |
| peer0.luxebags | 7051 | Brand peer |
| peer1.luxebags | 8051 | Brand peer (backup) |
| peer0.italianleather | 9051 | Supplier peer |
| peer0.craftworkshop | 10051 | Manufacturer peer |
| peer0.luxuryretail | 11051 | Retailer peer |
| CouchDB instances | 5984-5988 | State databases |
| CA instances | 7054-7057 | Certificate authorities |
| Luxury Chaincode | 9998 | Supply chain contract |
| Consensus Chaincode | 9999 | 2-Check consensus |

## Frontend Applications

### B2B Dashboard (port 3000)

**Purpose**: Supply chain stakeholder operations

**Features**:
- Organization-based login (auto-detects from email domain)
- Pending shipment confirmations
- Product and batch management
- Dispute resolution interface
- Trust score dashboard
- Transaction history and analytics
- Batch operations
- Audit log viewing

**Demo Credentials**:
| Organization | Email | Password |
|--------------|-------|----------|
| LuxeBags (Admin) | admin@luxebags.com | LuxeBags2024! |
| Italian Leather | manager@italianleather.com | ItalianLeather2024! |
| Craft Workshop | manager@craftworkshop.com | CraftWorkshop2024! |
| Luxury Retail | store@luxuryretail.com | LuxuryRetail2024! |

### Customer App (port 3001)

**Purpose**: End-customer product verification and ownership

**Features**:
- QR code scanning (camera-based)
- Product authenticity verification
- Ownership claiming (at purchase)
- Transfer code generation (for resale)
- Ownership transfer completion
- Theft reporting
- Recovery marking
- Digital birth certificate viewing
- Product history tracking

**No Login Required**: Customers identified by email/phone hash

## Backend Services

### Organization Backends (ports 4001-4004)

Each organization runs identical backend with different configuration.

**API Categories**:

#### Authentication (`/api/auth`)
- `POST /login` - Authenticate user
- `GET /verify` - Verify JWT token
- `GET /me` - Get current user profile
- `GET /demo-credentials` - Get demo logins

#### Supply Chain (`/api/supply-chain`)
- `GET /products/:id` - Get product details
- `POST /products` - Create product
- `GET /products/:id/history` - Get provenance
- `POST /products/:id/take-ownership` - Customer claims ownership
- `GET /transfers/pending` - Get pending B2B transfers

#### Consensus (`/api/consensus`)
- `POST /transactions/:id/confirm-sent` - Sender confirms
- `POST /transactions/:id/confirm-received` - Receiver confirms
- `POST /dispute/:id/evidence` - Submit dispute evidence
- `GET /trust-scores/:org` - Get organization trust score

### Customer Gateway (port 3010)

**Purpose**: Abstract blockchain complexity for customers

**Endpoints**:

#### Ownership (`/api/ownership`)
- `POST /claim` - Claim product ownership
- `POST /transfer/generate` - Generate transfer code
- `POST /transfer/complete` - Complete C2C transfer
- `POST /report-stolen` - Report theft
- `POST /recover` - Mark as recovered
- `GET /products?email=` - Get owned products

#### Products (`/api/products`)
- `GET /verify/:id` - Verify authenticity

#### Returns (`/api/returns`)
- `POST /initiate` - Start return
- `GET /status/:id` - Check return status

## Smart Contracts (Chaincode)

### Supply Chain Contract

**Product Management**:
- `CreateBatch()` - Create product batch from materials
- `TransferBatch()` - Initiate batch transfer
- `ConfirmSent()` / `ConfirmReceived()` - 2-Check confirmation
- `GetProduct()` / `GetProductHistory()` - Query products

**Material Tracking**:
- `CreateMaterialInventory()` - Create material inventory
- `TransferMaterialInventory()` - Transfer materials
- `ConfirmMaterialReceived()` - Confirm material receipt

### Ownership Contract

**Birth Certificates**:
- `CreateDigitalBirthCertificate()` - Create at manufacturing
- `GetBirthCertificate()` - Retrieve certificate
- `VerifyAuthenticity()` - Check authentic + stolen status

**Ownership Operations**:
- `TakeOwnership()` - Record customer ownership
- `GenerateTransferCode()` - Create 24-hour transfer code
- `TransferOwnership()` - Complete C2C transfer
- `ReportStolen()` / `RecoverStolen()` - Theft management

### Consensus Contract (2-Check)

**Transaction Lifecycle**:
- `SubmitTransaction()` - Create transaction (INITIATED)
- `ConfirmSent()` - Sender confirms (SENT)
- `ConfirmReceived()` - Receiver confirms (VALIDATED)

**Dispute Handling**:
- `RaiseDispute()` - Initiate dispute
- `AcceptDispute()` - Counter-party accepts
- `ResolveDispute()` - Arbitrator resolves
- `SubmitEvidence()` - Add dispute evidence

**Trust Management**:
- `GetTrustScore()` - Get organization trust score
- Trust increases with successful transactions
- High trust (>0.95) enables auto-confirmation

### Role Management Contract

**Permissions**:
- `AssignRole()` / `RevokeRole()` - Manage org roles
- `CheckPermission()` - Validate action permission

**Roles**: SUPER_ADMIN, SUPPLIER, MANUFACTURER, WAREHOUSE, RETAILER

## Network Scripts

### Setup Scripts

| Script | Purpose |
|--------|---------|
| `setup-network.sh` | Complete automated setup |
| `test-config-generation.sh` | Generate network config from brand template |
| `generate-network.sh` | Create all config files |
| `generate-crypto.sh` | Generate TLS certificates |
| `start-network.sh` | Start Docker containers |
| `create-channel.sh` | Create and join channel |
| `deploy-external-chaincode.sh` | Deploy smart contracts |

### Management Scripts

| Script | Purpose |
|--------|---------|
| `restart-network.sh` | Quick restart (preserves state) |
| `teardown-network.sh` | Full cleanup |
| `stop-network.sh` | Stop without cleanup |

## Docker Configuration

### Main Stack (`docker-compose.yml`)

```yaml
services:
  postgres          # User management database
  luxebags-backend  # Brand owner API
  italianleather-backend  # Supplier API
  craftworkshop-backend   # Manufacturer API
  luxuryretail-backend    # Retailer API
  customer-gateway  # B2C gateway
  luxury-frontend   # B2B dashboard
  luxury-customer-frontend  # Customer app
```

### Chaincode Stack (`docker-compose-chaincode.yml`)

```yaml
services:
  consensus-chaincode  # 2-Check consensus (port 9999)
  luxury-chaincode     # Supply chain (port 9998)
```

### Fabric Network (generated)

```yaml
services:
  orderer1, orderer2, orderer3  # Raft consensus
  peer0.luxebags, peer1.luxebags  # Brand peers
  peer0.italianleather  # Supplier peer
  peer0.craftworkshop   # Manufacturer peer
  peer0.luxuryretail    # Retailer peer
  couchdb_peer*         # State databases
  ca_*                  # Certificate authorities
```

## API Reference

### Product Verification Flow

```bash
# 1. Verify product authenticity
curl http://localhost:3010/api/products/verify/PROD001

# Response:
{
  "authentic": true,
  "product": {
    "id": "PROD001",
    "name": "Luxury Handbag",
    "status": "IN_STORE",
    "isStolen": false
  }
}
```

### Ownership Claim Flow

```bash
# 1. Claim ownership (called by retailer at sale)
curl -X POST http://localhost:3010/api/ownership/claim \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PROD001",
    "email": "customer@email.com",
    "phone": "+1234567890",
    "password": "SecurePass123",
    "pin": "1234"
  }'
```

### Transfer Flow (C2C Resale)

```bash
# 1. Seller generates transfer code
curl -X POST http://localhost:3010/api/ownership/transfer/generate \
  -d '{
    "productId": "PROD001",
    "email": "seller@email.com",
    "phone": "+1234567890",
    "password": "SecurePass123",
    "pin": "1234"
  }'

# Response: { "transferCode": "ABC12345", "expiresAt": "..." }

# 2. Buyer completes transfer with code
curl -X POST http://localhost:3010/api/ownership/transfer/complete \
  -d '{
    "productId": "PROD001",
    "transferCode": "ABC12345",
    "email": "buyer@email.com",
    "phone": "+0987654321",
    "password": "NewPass456",
    "pin": "5678"
  }'
```

### B2B Transfer with 2-Check

```bash
# 1. Initiate transfer
curl -X POST http://localhost:4003/api/supply-chain/transfers \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"productId": "PROD001", "to": "luxuryretail"}'

# 2. Sender confirms shipment
curl -X POST http://localhost:4003/api/consensus/transactions/$TX_ID/confirm-sent \
  -H "Authorization: Bearer $TOKEN"

# 3. Receiver confirms receipt
curl -X POST http://localhost:4004/api/consensus/transactions/$TX_ID/confirm-received \
  -H "Authorization: Bearer $TOKEN"
```

## Development

### Project Structure

```
luxury-supply-chain/
├── backend/
│   ├── auth/              # Authentication service
│   ├── consensus/         # 2-Check consensus engine
│   ├── customer-gateway/  # B2C gateway service
│   ├── gateway/           # Fabric SDK abstraction
│   └── server.ts          # Main backend server
├── chaincode/
│   ├── luxury-supply-chain/  # Main supply chain contract
│   └── 2check-consensus/     # Consensus contract
├── config/
│   └── brands/            # Brand configuration templates
├── frontend/
│   ├── web-app/           # B2B dashboard (Next.js 15)
│   └── customer-app/      # Customer app (Next.js 14)
├── network/
│   ├── scripts/           # Network management scripts
│   └── templates/         # Config templates
├── generated-test/        # Generated network config
├── docker-compose.yml     # Application stack
├── setup-network.sh       # Full setup script
├── restart-network.sh     # Quick restart
└── teardown-network.sh    # Full cleanup
```

### Adding a New Organization

1. Edit `config/brands/example-brand/network-config.yaml`
2. Add organization definition with peers
3. Run `./test-config-generation.sh`
4. Regenerate crypto: `./scripts/generate-crypto.sh`
5. Restart network: `./restart-network.sh`

### Modifying Chaincode

1. Edit files in `chaincode/luxury-supply-chain/`
2. Increment version in deployment script
3. Run `./scripts/deploy-external-chaincode.sh`

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Backend can't connect to Fabric | Ensure network is running: `docker ps \| grep fabric` |
| PostgreSQL connection refused | Check container health: `docker-compose logs postgres` |
| Chaincode deployment fails | Wait 30s after network start, then retry |
| Port already in use | Stop conflicting service or change port mapping |
| Crypto materials not found | Run `generate-crypto.sh` in generated-test/ |

### Useful Commands

```bash
# Check all containers
docker-compose ps
docker ps | grep fabric

# View logs
docker-compose logs -f [service-name]
docker logs -f peer0.luxebags.luxe-bags.luxury

# Invoke chaincode directly
docker exec peer0.luxebags.luxe-bags.luxury peer chaincode query \
  -C luxury-supply-chain \
  -n luxury-supply-chain \
  -c '{"function":"GetAllProducts","Args":[]}'

# Reset everything
./teardown-network.sh  # Select yes to remove volumes
./setup-network.sh
```

### Health Checks

```bash
# Check Fabric network
curl http://localhost:9443/healthz  # peer0.luxebags metrics

# Check backend APIs
curl http://localhost:4001/health
curl http://localhost:3010/health

# Check PostgreSQL
docker exec luxury-postgres pg_isready -U dbadmin
```

## License

This project is a proof-of-concept for educational and demonstration purposes.

---

**Built with Hyperledger Fabric for luxury brand authenticity and traceability.**
