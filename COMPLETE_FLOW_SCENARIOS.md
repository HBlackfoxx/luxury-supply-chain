# Complete Flow Scenarios - All Functions and Cross-Contract Calls
## How Everything Works Together

---

## 🏭 SCENARIO 1: Material Creation and Transfer

### Flow: ItalianLeather creates material → Transfers to CraftWorkshop

```
1. ItalianLeather creates material inventory
   Backend: POST /api/materials
   └─> supply-chain-api.ts::createMaterial()
       └─> SupplyChainContract::CreateMaterialInventory()
           ├─> Checks permission: RoleManagementContract::CheckPermission("CREATE_MATERIAL")
           ├─> Creates material inventory in ledger
           └─> Returns material ID

2. ItalianLeather initiates transfer to CraftWorkshop
   Backend: POST /api/materials/transfer
   └─> supply-chain-api.ts::transferMaterialToManufacturer()
       └─> SupplyChainContract::TransferMaterialInventory()
           ├─> RoleManagementContract::CheckPermission("TRANSFER_MATERIAL")
           ├─> Deducts from sender inventory
           ├─> Creates pending receiver inventory
           └─> Calls ConsensusContract (cross-chaincode):
               └─> ctx.GetStub().InvokeChaincode("2check-consensus", "InitiateTransaction")
                   ├─> Creates Transaction{status: "INITIATED", from: ItalianLeatherMSP, to: CraftWorkshopMSP}
                   ├─> Sets timeout (48 hours)
                   └─> Emits event "TransactionInitiated"

3. ItalianLeather confirms material sent
   Backend: POST /api/transfer/{id}/confirm-sent
   └─> supply-chain-api.ts::confirmSent()
       └─> ConsensusContract::ConfirmSent()
           ├─> Updates Transaction{senderConfirmed: true, status: "SENT"}
           ├─> Checks if receiver already confirmed
           └─> Emits event "SenderConfirmed"

4. CraftWorkshop confirms material received
   Backend: POST /api/transfer/{id}/confirm-received
   └─> supply-chain-api.ts::confirmReceived()
       └─> ConsensusContract::ConfirmReceived()
           ├─> Updates Transaction{receiverConfirmed: true}
           ├─> Since both confirmed → status: "VALIDATED"
           ├─> Calls back to SupplyChainContract:
           │   └─> ctx.GetStub().InvokeChaincode("luxury-supply-chain", "CompleteMaterialTransfer")
           │       ├─> Updates receiver inventory (adds quantity)
           │       └─> Marks transfer as verified
           └─> Updates trust scores:
               └─> updateTrustScores()
                   ├─> ItalianLeatherMSP: successfulTx++, score recalculated
                   └─> CraftWorkshopMSP: successfulTx++, score recalculated
```

**Trust Score Impact**:
- Both parties: +1 successful transaction
- If 10th successful: +0.01 bonus to score

---

## 🛍️ SCENARIO 2: Batch Creation with Materials

### Flow: CraftWorkshop creates batch of 50 handbags

```
1. CraftWorkshop creates batch
   Backend: POST /api/batches
   └─> supply-chain-api.ts::createBatch() [MISSING - NEEDS IMPLEMENTATION]
       └─> SupplyChainContract::CreateBatch() [EXISTS at supply_chain.go:31]
           ├─> RoleManagementContract::CheckPermission("CREATE_BATCH")
           ├─> Validates material IDs exist in inventory
           ├─> Creates 50 individual products (PROD-001 to PROD-050)
           ├─> Deducts materials from inventory
           ├─> Creates ProductBatch{id, status: "CREATED", productIDs[]}
           └─> Returns batch ID and product IDs

2. Products created with batch are ready for transfer
   Note: Quality is implicitly verified through the 2-check consensus
   When manufacturer confirms sending and receiver confirms receipt,
   both parties are acknowledging the quality is acceptable
```

---

## 📦 SCENARIO 3: Batch Transfer Through Supply Chain

### Flow: CraftWorkshop → LuxeBags (warehouse) → LuxuryRetail

```
1. CraftWorkshop initiates batch transfer to LuxeBags
   Backend: POST /api/transfer/batch
   └─> supply-chain-api.ts::transferBatch()
       └─> SupplyChainContract::TransferBatch()
           ├─> RoleManagementContract::CheckPermission("TRANSFER_BATCH")
           ├─> Gets all products in batch
           ├─> For each product:
           │   └─> Creates transfer record
           └─> Calls ConsensusContract::InitiateTransaction()
               └─> Creates single transaction for entire batch

2. Both parties confirm (same as material flow)
   └─> ConsensusContract handles 2-check
       └─> On validation:
           └─> SupplyChainContract::CompleteBatchTransfer()
               ├─> Updates all product owners to LuxeBags
               ├─> Updates batch location
               └─> Updates batch status

3. LuxeBags updates batch location (warehouse storage)
   Backend: PUT /api/batches/{id}/location
   └─> supply-chain-api.ts::updateBatchLocation()
       └─> SupplyChainContract::UpdateBatchLocation()
           ├─> RoleManagementContract::CheckPermission("UPDATE_LOCATION")
           └─> Updates location for tracking

4. LuxeBags transfers to LuxuryRetail
   [Repeat steps 1-2 with LuxeBags as sender, LuxuryRetail as receiver]
```

---

## 💰 SCENARIO 4: Customer Purchase and Ownership

### Flow: Customer buys product from LuxuryRetail

```
1. Retailer creates birth certificate for product
   Backend: POST /api/products/{id}/birth-certificate
   └─> supply-chain-api.ts::createBirthCertificate()
       └─> OwnershipContract::CreateDigitalBirthCertificate()
           ├─> RoleManagementContract::CheckPermission("CREATE_BIRTH_CERTIFICATE")
           ├─> Creates certificate with product details
           └─> Stores on ledger

2. Customer takes ownership (at point of sale)
   Backend: POST /api/products/{id}/take-ownership
   └─> supply-chain-api.ts::takeOwnership()
       └─> SupplyChainContract::TakeOwnership()
           ├─> RoleManagementContract::CheckPermission("SELL_PRODUCT")
           ├─> Creates ownership record (hashed customer ID)
           ├─> Updates product status to "SOLD"
           ├─> Updates product.OwnershipHash
           └─> If batch fully sold:
               └─> Updates BatchStatus to "SOLD"

3. Generate transfer code for resale
   Backend: POST /api/ownership/transfer/generate
   └─> supply-chain-api.ts::generateTransferCode()
       └─> OwnershipContract::GenerateTransferCode()
           ├─> Verifies current owner
           ├─> Creates unique transfer code
           └─> Sets expiry (24 hours)
           └─> Returns code to customer

4. Transfer to new owner
   Backend: POST /api/ownership/transfer/complete
   └─> supply-chain-api.ts::transferOwnership()
       └─> OwnershipContract::TransferOwnership()
           ├─> Validates transfer code
           ├─> Updates ownership record
           ├─> Adds to ownership history
           └─> Invalidates transfer code
```

---

## ⚠️ SCENARIO 5: Dispute Resolution and Follow-up Actions

### Flow: LuxuryRetail disputes quality from CraftWorkshop

```
1. Transfer initiated but quality issue found
   [Normal transfer flow until confirmation]

2. LuxuryRetail raises dispute instead of confirming
   Backend: POST /api/transfer/{id}/dispute
   └─> supply-chain-api.ts::raiseDispute()
       └─> ConsensusContract::RaiseDispute(transactionID: string, initiator: string, reason: DisputeReason)
           ├─> Updates Transaction{status: "DISPUTED", disputeReason: "DEFECTIVE"}
           ├─> Creates dispute metadata with initiator
           ├─> Updates trust scores:
           │   ├─> CraftWorkshopMSP: totalTransactions++ (no success)
           │   └─> LuxuryRetailMSP: totalTransactions++ (no success)
           └─> Emits event "DisputeRaised"

3. Submit evidence
   Backend: POST /api/dispute/{id}/evidence
   └─> supply-chain-api.ts::submitEvidence()
       └─> ConsensusContract::SubmitEvidence(transactionID: string, submitter: string, evidenceType: string, hash: string)
           ├─> Adds evidence to transaction
           └─> Updates evidence array with hash, timestamp

4. Resolve dispute (by arbitrator/brand owner)
   Backend: POST /api/dispute/{id}/resolve
   Body: { decision: "IN_FAVOR_SENDER" | "IN_FAVOR_RECEIVER" | "PARTIAL", 
           notes: "string", actionQuantity: number }
   └─> supply-chain-api.ts::resolveDispute()
       └─> ConsensusContract::ResolveDispute(transactionID: string, resolver: string, decision: string, notes: string, actionQuantity: int)
           ├─> Updates Transaction{state: "VALIDATED"} (forces acceptance)
           ├─> Creates DisputeResolution record:
           │   ├─> Sets winner/loser
           │   ├─> Determines requiredAction:
           │   │   - IN_FAVOR_SENDER + receiver initiated: "RETURN"
           │   │   - IN_FAVOR_RECEIVER + defective: "REPLACE"
           │   │   - IN_FAVOR_RECEIVER + not received: "RESEND"
           │   │   - IN_FAVOR_RECEIVER + quantity issue: "RESEND_PARTIAL"
           │   ├─> Sets actionDeadline (72 hours)
           │   └─> ActionCompleted: false
           └─> Updates trust scores based on decision

5. Create follow-up transfer after resolution
   Backend: POST /api/dispute/{disputeID}/create-return
   └─> supply-chain-api.ts::createReturnTransfer()
       └─> SupplyChainContract::CreateReturnTransferAfterDispute(disputeID: string)
           [Located in consensus_integration.go:348]
           ├─> Gets dispute resolution from consensus
           ├─> Creates new transfer based on requiredAction:
           │   ├─> "RETURN": TransferTypeReturn from loser → winner
           │   └─> "RESEND/REPLACE": TransferTypeSupplyChain from winner → loser
           ├─> Transfer includes disputeID in metadata
           ├─> Submits to consensus (needs 2-check confirmations)
           └─> Marks action as completed in consensus

6. Manual confirmation of return/resend transfer
   Sender confirms sent:
   └─> ConsensusContract::ConfirmSent()
   
   Receiver confirms received:
   └─> ConsensusContract::ConfirmReceived()
       └─> When both confirmed:
           └─> SupplyChainContract::ProcessReturn()
               ├─> Moves inventory/products back
               └─> Updates product ownership

7. Trust score impacts:
   - Resolution IN_FAVOR_SENDER: Receiver gets -0.05
   - Resolution IN_FAVOR_RECEIVER: Sender gets -0.05
   - PARTIAL: Both get minor penalty
   - Successful return completion: Normal transfer scores apply
```

---

## 🔄 SCENARIO 6: B2B Product Return (After Dispute)

### Flow: B2B return after dispute resolution

```
1. Dispute resolved with RETURN action required
   [See Scenario 5 for dispute resolution]

2. Create return transfer after dispute
   Backend: POST /api/dispute/{disputeID}/create-return
   └─> supply-chain-api.ts::createReturnTransfer()
       └─> SupplyChainContract::CreateReturnTransferAfterDispute()
           ├─> Gets resolution details from consensus
           ├─> Creates Transfer{type: "RETURN"}
           └─> Links to disputeID in metadata

3. Process the return transfer
   Backend: POST /api/transfer/{returnTransferID}/process
   Body: { itemType: "PRODUCT" | "BATCH" | "MATERIAL", quantity: number }
   └─> supply-chain-api.ts::processReturn()
       └─> SupplyChainContract::ProcessReturn(returnTransferID: string, itemType: string, itemID: string, quantity: int)
           ├─> Verifies transfer.TransferType == "RETURN"
           ├─> Based on itemType:
           │   ├─> MATERIAL: Updates inventory quantities
           │   ├─> BATCH: Updates batch ownership and all products
           │   └─> PRODUCT: Updates single product ownership
           ├─> Moves items from sender → receiver
           └─> Marks transfer as COMPLETED
```

---

## 🛍️ SCENARIO 6B: Customer Product Return

### Flow: Customer returns product to retailer

```

1. Customer initiates return at retailer
   [Offline process - customer brings product to store]

2. Retailer processes customer return
   Backend: POST /api/products/{id}/customer-return
   Body: { reason: "DEFECT" | "CHANGE_OF_MIND", retailerMSPID: string }
   └─> supply-chain-api.ts::processCustomerReturn() [MISSING - NEEDS IMPLEMENTATION]
       └─> SupplyChainContract::ProcessCustomerReturn(productID: string, reason: string, retailerMSPID: string) [EXISTS at supply_chain.go:1652]
           ├─> Verifies product has customer ownership
           ├─> Clears ownership record
           ├─> Updates product.Status to "RETURNED"
           ├─> Transfers ownership back to retailer
           └─> No consensus needed (customers not on blockchain)

3. Retailer decides next action
   - If defective: Create B2B return to manufacturer
   - If resellable: Put back in inventory
   - If damaged: Mark for disposal
```

---

## 🚨 SCENARIO 7: Stolen Product Report

### Flow: Customer reports stolen product

```
1. Customer reports theft
   Backend: POST /api/ownership/report-stolen
   └─> supply-chain-api.ts::reportStolen()
       └─> OwnershipContract::ReportStolen(productID: string, ownerHash: string, policeReportID: string)
           ├─> Verifies ownership
           ├─> Updates product.IsStolen = true
           ├─> Creates theft record
           └─> Alerts network

2. Recovery (if found)
   Backend: POST /api/ownership/recover
   └─> supply-chain-api.ts::recoverStolen()
       └─> OwnershipContract::RecoverStolen(productID: string, ownerHash: string, recoveryProof: string)
           ├─> RoleManagementContract::CheckPermission("RECOVER_STOLEN")
           ├─> Updates product.IsStolen = false
           └─> Records recovery details
```

---

## ⏱️ SCENARIO 7B: Timeout Handling

### Flow: Transaction times out without confirmations

```
1. Transfer initiated but not confirmed within timeout
   [Transfer created with 24-48 hour timeout]

2. Check transaction status after timeout
   Backend: GET /api/transfer/{id}/status
   └─> supply-chain-api.ts::getTransferStatus()
       └─> ConsensusContract::GetTransaction(transactionID: string)
           └─> If current time > timeout:
               └─> ConsensusContract::ValidateTransaction(transactionID: string)
                   ├─> Updates Transaction{state: "TIMEOUT"}
                   ├─> Trust score penalties:
                   │   ├─> If sender didn't confirm: -0.01
                   │   └─> If receiver didn't confirm: -0.01
                   └─> Transaction marked as failed

3. Handle timeout resolution
   Options:
   a) Raise dispute for investigation
   b) Create new transfer attempt
   c) Cancel and reverse any partial changes
```

---

## 📊 SCENARIO 8: Query Operations

### Flow: Getting dashboard data

```
1. Get all products
   Backend: GET /api/products
   └─> supply-chain-api.ts::getProducts()
       └─> SupplyChainContract::GetAllProducts() [Returns: []*Product]
           └─> Returns filtered by organization permissions

2. Get pending transfers
   Backend: GET /api/transfers/pending
   └─> supply-chain-api.ts::getPendingTransfers()
       └─> SupplyChainContract::GetPendingTransfers(orgMSPID: string) [Returns: []*Transfer] [EXISTS at supply_chain.go:1792]
           └─> Returns transfers where org is sender/receiver

3. Get trust score
   Backend: GET /api/trust/{organizationId}
   └─> supply-chain-api.ts::getTrustScore()
       └─> ConsensusContract::GetTrustScore(partyID: string) [Returns: *TrustScore]
           └─> Returns TrustScore object

4. Get dashboard stats
   Backend: GET /api/dashboard/stats
   └─> supply-chain-api.ts::getDashboardStats()
       └─> SupplyChainContract::GetDashboardStats(orgMSPID: string) [Returns: map[string]interface{}]
           └─> Aggregates products, batches, transfers
```

---

## 🔑 KEY CROSS-CONTRACT CALLS

### From SupplyChain → Consensus:
```go
ctx.GetStub().InvokeChaincode("2check-consensus", 
    [][]byte{[]byte("InitiateTransaction"), ...})
```

### From Consensus → SupplyChain:
```go
ctx.GetStub().InvokeChaincode("luxury-supply-chain", 
    [][]byte{[]byte("CompleteMaterialTransfer"), ...})
```

### From SupplyChain → RoleManagement (same chaincode):
```go
roleContract := &RoleManagementContract{}
roleContract.CheckPermission(ctx, mspID, permission)
```

---

## 🎯 TRUST SCORE UPDATES SUMMARY

### Current Implementation (in chaincode):
| Event | Function | Impact |
|-------|----------|---------|
| Successful Transfer | ConsensusContract::updateTrustScores() | Score = successfulTx / totalTransactions |
| Failed Transfer | ConsensusContract::updateTrustScores() | Only totalTransactions increases |
| Initial Score | ConsensusContract::getTrustScore() | 0.5 for new parties |

### Now Implemented in Chaincode:
| Event | Function Signature | Impact |
|-------|-------------------|---------|
| Successful Transfer | ConsensusContract::updateTrustScores(tx: *Transaction, success: bool) | +1 successful tx, weighted average |
| 10th Success Milestone | ConsensusContract::updateTrustScores(tx: *Transaction, success: bool) | +0.01 bonus |
| Dispute Resolution (at fault) | ConsensusContract::UpdateTrustFromEvent(eventDataJSON: string) | -0.05 for "DISPUTE_FAULT" |
| Product Return | ConsensusContract::UpdateTrustFromEvent(eventDataJSON: string) | -0.015 for "RETURN" |
| Late Delivery | ConsensusContract::UpdateTrustFromEvent(eventDataJSON: string) | -0.01 for "LATE_DELIVERY" |
| Timeout (no confirmation) | ConsensusContract::ValidateTransaction(transactionID: string) | -0.01 per party |

### Trust Score Calculation (implemented):
- New parties (<5 transactions): Simple ratio (successful/total)
- Established parties (>5 transactions): Weighted average (70% current performance, 30% historical)

---

## 🔄 COMPLETE PERMISSION FLOW

Every operation checks permissions:
```
User Request → Backend API → Chaincode Function → RoleManagementContract::CheckPermission()
                                                    ├─> If allowed: Continue
                                                    └─> If denied: Return error
```

Permissions by role (from role_management.go):
- **SUPER_ADMIN**: ALL permissions
- **SUPPLIER**: CREATE_MATERIAL, TRANSFER_MATERIAL, CONFIRM_SENT, CONFIRM_RECEIVED, VIEW_INVENTORY
- **MANUFACTURER**: CREATE_BATCH, CREATE_PRODUCT, TRANSFER_BATCH, TRANSFER_PRODUCT, CONFIRM_SENT, CONFIRM_RECEIVED, CREATE_BIRTH_CERTIFICATE
- **WAREHOUSE**: TRANSFER_BATCH, TRANSFER_PRODUCT, CONFIRM_SENT, CONFIRM_RECEIVED, VIEW_INVENTORY, UPDATE_LOCATION, ADD_SERVICE_RECORD
- **RETAILER**: TRANSFER_PRODUCT, CONFIRM_SENT, CONFIRM_RECEIVED, TAKE_OWNERSHIP, VIEW_PRODUCT, VERIFY_PRODUCT, ADD_SERVICE_RECORD