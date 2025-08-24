# CHAINCODE FUNCTIONS REFERENCE
## Complete list of all chaincode functions with signatures

---

## 1. SUPPLY CHAIN CONTRACT FUNCTIONS

### Initialization
```go
InitLedger(ctx) error
```

### Batch Management
```go
CreateBatch(ctx, batchID, brand, productType, quantity, materialIDs) error
GetBatch(ctx, batchID) (*Batch, error)
GetAllBatches(ctx) ([]*Batch, error)
GetBatchesByOrganization(ctx, organization) ([]*Batch, error)
UpdateBatchLocation(ctx, batchID, newLocation, newStatus) error
```

### Product Management  
```go
GetProduct(ctx, productID) (*Product, error)
GetProductsByBatch(ctx, batchID) ([]*Product, error)
VerifyProductByBatch(ctx, batchID, productSerial) (*Product, error)
AddQualityCheckpoint(ctx, productID, checkpointID, stage, passed, details) error
```

### Transfer Operations
```go
InitiateTransfer(ctx, transferID, productID, to) error
TransferBatch(ctx, transferID, batchID, to) error
ConfirmSent(ctx, transferID) error
ConfirmReceived(ctx, transferID) error
GetTransfer(ctx, transferID) (*Transfer, error)
GetTransfersByProduct(ctx, productID) ([]*Transfer, error)
GetPendingTransfers(ctx) ([]*Transfer, error)
```

### Material Inventory
```go
CreateMaterialInventory(ctx, materialID, materialType, batch, quantityStr) error
TransferMaterialInventory(ctx, transferID, materialID, toOrganization, quantityStr) error
GetMaterialInventory(ctx, materialID, organization) (*MaterialInventory, error)
```

### Consensus Integration
```go
SubmitToConsensus(ctx, transferID, productID, from, to) error
SubmitMaterialTransferToConsensus(ctx, transferID, materialID, from, to, quantity) error
```

### Customer Operations
```go
TakeOwnership(ctx, productID, ownerHash, purchaseLocation) error
ProcessReturn(ctx, returnID, productID, reason, retailerSignature) error
```

### Query Functions
```go
ProductExists(ctx, productID) (bool, error)
GetProductHistory(ctx, productID) ([]map[string]interface{}, error)
GetDashboardStats(ctx) (map[string]interface{}, error)
```

---

## 2. OWNERSHIP CONTRACT FUNCTIONS

### Digital Birth Certificate
```go
CreateDigitalBirthCertificate(ctx, productID, manufacturingPlace, craftsman, authenticityJSON) error
GetBirthCertificate(ctx, productID) (*DigitalBirthCertificate, error)
```

### Ownership Management
```go
GenerateTransferCode(ctx, productID, currentOwnerHash) (string, error)
TransferOwnership(ctx, productID, transferCode, newOwnerHash) error
GetOwnership(ctx, productID) (*Ownership, error)
GetOwnerSpecificInfo(ctx, productID, ownerHash) (map[string]interface{}, error)
```

### Theft Management
```go
ReportStolen(ctx, productID, ownerHash, policeReportID) error
RecoverStolen(ctx, productID, ownerHash, recoveryProof) error
GetStolenProducts(ctx) ([]*Product, error)
```

### Service Records
```go
AddServiceRecord(ctx, productID, serviceID, serviceCenter, serviceType, description, technician, warranty) error
```

### Query Functions
```go
VerifyAuthenticity(ctx, productID) (map[string]interface{}, error)
GetProductsByOwner(ctx, ownerHash) ([]*Product, error)
GetOwnershipHistory(ctx, productID) (map[string]interface{}, error)
GetProductsWithOwnership(ctx) ([]*map[string]interface{}, error)
GetOwnershipStatistics(ctx) (map[string]interface{}, error)
```

---

## 3. ROLE MANAGEMENT CONTRACT FUNCTIONS

### Initialization
```go
InitializeRoles(ctx) error
```

### Role Management
```go
AssignRole(ctx, targetMSPID, role, organizationName) error
RevokeRole(ctx, targetMSPID) error
CheckPermission(ctx, mspID, action) (bool, error)
```

### Query Functions
```go
GetOrganizationInfo(ctx, mspID) (*OrganizationInfo, error)
GetOrganizationRole(ctx, mspID) (OrganizationRole, error)
GetAllOrganizations(ctx) ([]*OrganizationInfo, error)
GetOrganizationsByRole(ctx, role) ([]*OrganizationInfo, error)
```

---

## 4. CONSENSUS CONTRACT FUNCTIONS (2check-consensus)

### Initialization
```go
InitLedger(ctx) error
```

### Transaction Management
```go
SubmitTransaction(ctx, transactionID, transactionType, sender, receiver, details, value) error
ConfirmSent(ctx, transactionID) error
ConfirmReceived(ctx, transactionID) error
GetTransaction(ctx, transactionID) (*Transaction, error)
GetTransactionHistory(ctx, transactionID) ([]TransactionRecord, error)
```

### Dispute Management
```go
RaiseDispute(ctx, transactionID, reason, evidence) error
AcceptDispute(ctx, transactionID, disputeID) error
ResolveDispute(ctx, transactionID, resolution, arbitratorNotes) error
SubmitEvidence(ctx, transactionID, evidenceType, evidenceHash, description) error
GetDisputeResolution(ctx, transactionID) (*DisputeResolution, error)
GetDisputedTransactions(ctx) ([]*Transaction, error)
```

### Trust Management
```go
GetTrustScore(ctx, mspID) (*TrustScore, error)
```

### Actions Management
```go
GetPendingActions(ctx, mspID) ([]*PendingAction, error)
MarkActionCompleted(ctx, actionID) error
```

### Query Functions
```go
QueryTransactions(ctx, queryType, value) ([]*Transaction, error)
GetTransactionsByParty(ctx, party) ([]*Transaction, error)
GetAllTransactions(ctx) ([]*Transaction, error)
```

---

## PERMISSION REQUIREMENTS

### Functions Requiring Specific Permissions:
- **CREATE_BATCH**: CreateBatch (MANUFACTURER)
- **CREATE_MATERIAL**: CreateMaterialInventory (SUPPLIER)
- **TAKE_OWNERSHIP**: TakeOwnership (RETAILER)
- **TRANSFER_MATERIAL**: TransferMaterialInventory (SUPPLIER/MANUFACTURER)
- **ADD_QUALITY_CHECK**: AddQualityCheckpoint (MANUFACTURER)
- **UPDATE_LOCATION**: UpdateBatchLocation (WAREHOUSE)
- **CREATE_BIRTH_CERTIFICATE**: CreateDigitalBirthCertificate (MANUFACTURER)
- **ADD_SERVICE_RECORD**: AddServiceRecord (RETAILER/WAREHOUSE)

### Functions Using Ownership Check (No Role Permission):
- InitiateTransfer
- TransferBatch
- TransferOwnership
- GenerateTransferCode

### Public Functions (No Permission Check):
- All Get/Query functions
- VerifyAuthenticity
- ProductExists