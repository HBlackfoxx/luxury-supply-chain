# Luxury Supply Chain Smart Contract

This chaincode implements the smart contracts for the luxury supply chain traceability system with customer ownership tracking.

## Overview

The chaincode consists of two main contracts:

1. **SupplyChainContract**: Handles B2B operations in the supply chain
2. **OwnershipContract**: Handles B2C ownership and privacy-preserving features

## Features

### Supply Chain Features
- Product creation and tracking
- Material verification recording
- Quality checkpoint management
- B2B transfers with 2-Check consensus
- Supply chain history tracking

### Ownership Features
- Digital Birth Certificate creation
- Customer ownership claiming (no wallet needed)
- Privacy-preserving ownership (SHA256 hashing)
- Ownership transfer via temporary codes
- Stolen product reporting
- Service history tracking
- Authenticity verification

### Privacy Features
- Hash-based owner identification
- Layered information access (public/owner/brand)
- Anonymized transfer history
- Zero-knowledge ownership verification

## Smart Contract Functions

### SupplyChainContract

#### Product Management
- `CreateProduct`: Create a new luxury product
- `AddMaterial`: Add material information to a product
- `AddQualityCheckpoint`: Record quality verification
- `GetProduct`: Retrieve product information
- `GetProductHistory`: Get complete product history
- `QueryProductsByBrand`: Query products by brand
- `QueryProductsByStatus`: Query products by status

#### Transfer Management (2-Check Consensus)
- `InitiateTransfer`: Start a B2B transfer
- `ConfirmSent`: Sender confirms item sent
- `ConfirmReceived`: Receiver confirms item received
- `GetTransfer`: Retrieve transfer information

### OwnershipContract

#### Digital Birth Certificate
- `CreateDigitalBirthCertificate`: Create immutable birth certificate
- `GetBirthCertificate`: Retrieve birth certificate

#### Ownership Management
- `ClaimOwnership`: Customer claims product ownership
- `GenerateTransferCode`: Generate temporary transfer code
- `TransferOwnership`: Transfer using code
- `ReportStolen`: Report product as stolen
- `GetOwnership`: Retrieve ownership information

#### Service & Verification
- `AddServiceRecord`: Add service/repair record
- `VerifyAuthenticity`: Verify product authenticity

### Privacy Utilities
- `GetPublicProductInfo`: Get only public information
- `GetOwnerSpecificInfo`: Get detailed info (owner only)
- `GetBrandAnalytics`: Get aggregated brand analytics
- `VerifyOwnershipWithoutReveal`: Zero-knowledge ownership proof
- `GetTransferHistory`: Get anonymized transfer history

## Data Structures

### Product
```go
type Product struct {
    ID                 string
    Brand              string
    Name               string
    Type               string
    SerialNumber       string
    CreatedAt          time.Time
    CurrentOwner       string
    CurrentLocation    string
    Status             ProductStatus
    Materials          []Material
    QualityCheckpoints []QualityCheckpoint
    Metadata           map[string]interface{}
    OwnershipHash      string // SHA256 of owner details
}
```

### Ownership
```go
type Ownership struct {
    ProductID        string
    OwnerHash        string // SHA256(email + phone + salt)
    OwnershipDate    time.Time
    PurchaseLocation string
    TransferCode     string
    TransferExpiry   *time.Time
    Status           OwnershipStatus
    ServiceHistory   []ServiceRecord
    PreviousOwners   []PreviousOwner
}
```

### Digital Birth Certificate
```go
type DigitalBirthCertificate struct {
    ProductID          string
    Brand              string
    ManufacturingDate  time.Time
    ManufacturingPlace string
    Craftsman          string
    Materials          []MaterialRecord
    Authenticity       AuthenticityDetails
    InitialPhotos      []string
    CertificateHash    string
}
```

## Privacy Design

1. **Customer Privacy**: 
   - No personal information stored on-chain
   - SHA256 hashing with salt for owner identification
   - Transfer codes instead of exposing identities

2. **Business Privacy**:
   - Prices never stored on-chain
   - Detailed business relationships hidden
   - Only necessary information exposed

3. **Access Control**:
   - Public can verify authenticity and check if stolen
   - Owners can access full product details
   - Brands can see aggregated analytics only

## Deployment

### Prerequisites
- Hyperledger Fabric 2.5.5
- Go 1.20+

### Build
```bash
GO111MODULE=on go mod vendor
```

### Package
```bash
peer lifecycle chaincode package luxury-supply-chain.tar.gz \
  --path . \
  --lang golang \
  --label luxury-supply-chain_1.0
```

### Install & Approve
Follow standard Fabric chaincode lifecycle for installation and approval.

## Integration with 2-Check Consensus

The supply chain transfers integrate with the Phase 2 consensus system:
1. Transfer initiated in chaincode
2. Event emitted for consensus system
3. Consensus system manages 2-Check validation
4. Chaincode updated when consensus achieved

## Testing

Run unit tests:
```bash
go test ./...
```

## Security Considerations

1. **MSP-based Access Control**: Organization identity verified for operations
2. **State-based Validation**: Status checks prevent invalid operations
3. **Privacy by Design**: Minimal information exposure
4. **Immutable Records**: Birth certificates cannot be modified
5. **Timeout Protection**: Transfer codes expire after 24 hours