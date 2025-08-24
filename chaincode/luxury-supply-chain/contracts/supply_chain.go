package contracts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SupplyChainContract handles B2B supply chain operations
type SupplyChainContract struct {
	contractapi.Contract
}

// InitLedger initializes the ledger with organization roles
func (s *SupplyChainContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	// Initialize roles through RoleManagementContract
	roleContract := &RoleManagementContract{}
	err := roleContract.InitializeRoles(ctx)
	if err != nil {
		return fmt.Errorf("failed to initialize roles: %v", err)
	}
	
	return nil
}

// CreateBatch creates a batch of products using materials
func (s *SupplyChainContract) CreateBatch(ctx contractapi.TransactionContextInterface,
	batchID string, brand string, productType string, quantity int, materialsJSON string) error {
	
	// Check if batch already exists
	existing, err := ctx.GetStub().GetState("batch_" + batchID)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("batch %s already exists", batchID)
	}
	
	// Get manufacturer identity
	manufacturer, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get manufacturer identity: %v", err)
	}
	
	// CHECK PERMISSION - Only manufacturers can create batches
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, manufacturer, "CREATE_BATCH")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to create batches", manufacturer)
	}
	
	// MaterialInput represents input format for materials with quantities
	type MaterialInput struct {
		ID       string  `json:"id"`
		Quantity float64 `json:"quantity"`
	}
	
	// Parse materials with quantities
	var materials []MaterialInput
	if materialsJSON != "" {
		err = json.Unmarshal([]byte(materialsJSON), &materials)
		if err != nil {
			return fmt.Errorf("invalid materials format: %v", err)
		}
	}
	
	// Track material usage (initialize to empty array to avoid null)
	materialsUsed := []MaterialUsage{}
	for _, mat := range materials {
		// Get material inventory
		inventoryKey := fmt.Sprintf("material_inventory_%s_%s", mat.ID, manufacturer)
		inventoryJSON, err := ctx.GetStub().GetState(inventoryKey)
		if err != nil {
			return err
		}
		if inventoryJSON == nil {
			return fmt.Errorf("material %s not in manufacturer's inventory", mat.ID)
		}
		
		var inventory MaterialInventory
		err = json.Unmarshal(inventoryJSON, &inventory)
		if err != nil {
			return err
		}
		
		// Use the specified quantity per batch
		totalUsage := mat.Quantity
		
		if inventory.Available < totalUsage {
			return fmt.Errorf("insufficient material %s: need %.2f, have %.2f", mat.ID, totalUsage, inventory.Available)
		}
		
		// Deduct from inventory
		inventory.Available -= totalUsage
		inventory.Used += totalUsage
		
		// Update inventory
		updatedInventoryJSON, err := json.Marshal(inventory)
		if err != nil {
			return err
		}
		err = ctx.GetStub().PutState(inventoryKey, updatedInventoryJSON)
		if err != nil {
			return err
		}
		
		// Track usage
		materialsUsed = append(materialsUsed, MaterialUsage{
			MaterialID:   mat.ID,
			MaterialType: inventory.Type,
			Supplier:     inventory.Supplier,
			QuantityUsed: totalUsage,
			Batch:        inventory.Batch,
		})
	}
	
	// Generate product IDs for the batch
	var productIDs []string
	for i := 1; i <= quantity; i++ {
		productID := fmt.Sprintf("%s-P%04d", batchID, i)
		productIDs = append(productIDs, productID)
		
		// Create individual product
		product := Product{
			ID:               productID,
			BatchID:          batchID,
			Brand:            brand,
			Name:             fmt.Sprintf("%s #%d", productType, i),
			Type:             productType,
			SerialNumber:     fmt.Sprintf("%s-%04d", batchID, i),
			UniqueIdentifier: fmt.Sprintf("%04d", i),
			CreatedAt:        time.Now().Format(time.RFC3339),
			CurrentOwner:     manufacturer,
			CurrentLocation:  manufacturer,
			Status:           ProductStatusCreated,
			IsStolen:         false,
			StolenDate:       "N/A",
			RecoveredDate:    "N/A",
			Materials:        []Material{},
			Metadata:         make(map[string]interface{}),
		}
		
		// Add materials info to product
		for _, matUsage := range materialsUsed {
			product.Materials = append(product.Materials, Material{
				ID:           matUsage.MaterialID,
				Type:         matUsage.MaterialType,
				Supplier:     matUsage.Supplier,
				Batch:        matUsage.Batch,
				QuantityUsed: matUsage.QuantityUsed / float64(quantity), // Per product
				Verification: "batch_verified",
				ReceivedDate: time.Now().Format(time.RFC3339),
			})
		}
		
		productJSON, err := json.Marshal(product)
		if err != nil {
			return err
		}
		err = ctx.GetStub().PutState(productID, productJSON)
		if err != nil {
			return err
		}
		
		// Create birth certificate for each product
		// Create material records from product materials
		// Initialize as empty slice to ensure it's never nil
		materialRecords := []MaterialRecord{}
		for _, material := range product.Materials {
			record := MaterialRecord{
				Type:     material.Type,
				Source:   material.Source,
				Supplier: material.Supplier,
				Batch:    material.Batch,
			}
			materialRecords = append(materialRecords, record)
		}
		
		// Create certificate
		certificate := DigitalBirthCertificate{
			ProductID:          productID,
			Brand:              product.Brand,
			ManufacturingDate:  product.CreatedAt,
			ManufacturingPlace: manufacturer,
			Craftsman:          fmt.Sprintf("%s Production Team", manufacturer),
			Materials:          materialRecords,
			Authenticity:       AuthenticityDetails{
				NFCChipID:        fmt.Sprintf("NFC-%s", product.SerialNumber),
				QRCodeData:       fmt.Sprintf("QR-%s", productID),
				HologramID:       fmt.Sprintf("HOLO-%s", product.SerialNumber),
				SecurityFeatures: []string{"Anti-counterfeit tag", "Hologram", "NFC chip"},
			},
			InitialPhotos:      []string{},
		}
		
		// Calculate certificate hash
		certData, _ := json.Marshal(certificate)
		hash := sha256.Sum256(certData)
		certificate.CertificateHash = hex.EncodeToString(hash[:])
		
		// Store certificate
		certKey := "cert_" + productID
		certJSON, err := json.Marshal(certificate)
		if err != nil {
			return err
		}
		
		err = ctx.GetStub().PutState(certKey, certJSON)
		if err != nil {
			return err
		}
	}
	
	// Create batch record
	batch := ProductBatch{
		ID:              batchID,
		Manufacturer:    manufacturer,
		Brand:           brand,
		ProductType:     productType,
		Quantity:        quantity,
		ProductIDs:      productIDs,
		MaterialsUsed:   materialsUsed,
		ManufactureDate: time.Now().Format(time.RFC3339),
		QRCode:          fmt.Sprintf("QR-%s-%d", batchID, time.Now().Unix()),
		CurrentOwner:    manufacturer,
		CurrentLocation: manufacturer,
		Status:          BatchStatusCreated,
		Metadata:        make(map[string]string),
	}
	
	batchJSON, err := json.Marshal(batch)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState("batch_"+batchID, batchJSON)
}

// Note: AddMaterial removed - materials are only added during batch creation
// Products receive their materials when created as part of a batch

// REMOVED: AddQualityCheckpoint - Quality checks are not part of the flow
// Quality is assumed to be verified through the 2-check consensus process
// when parties confirm sending/receiving

// TransferBatch transfers an entire batch between organizations
func (s *SupplyChainContract) TransferBatch(ctx contractapi.TransactionContextInterface,
	transferID string, batchID string, to string) error {
	
	// Get batch
	batchJSON, err := ctx.GetStub().GetState("batch_" + batchID)
	if err != nil {
		return err
	}
	if batchJSON == nil {
		return fmt.Errorf("batch %s does not exist", batchID)
	}
	
	var batch ProductBatch
	err = json.Unmarshal(batchJSON, &batch)
	if err != nil {
		return err
	}
	
	// Get sender identity
	sender, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	
	// Verify sender owns the batch
	if batch.CurrentOwner != sender {
		return fmt.Errorf("sender does not own the batch")
	}
	
	// Create transfer record
	transfer := Transfer{
		ID:           transferID,
		ProductID:    batchID, // Using batch ID as product ID
		From:         sender,
		To:           to,
		TransferType: TransferTypeSupplyChain,
		InitiatedAt:  time.Now().Format(time.RFC3339),
		CompletedAt:  "PENDING",
		Status:       TransferStatusInitiated,
		ConsensusDetails: ConsensusInfo{
			SenderConfirmed:   false,
			ReceiverConfirmed: false,
			SenderTimestamp:   "PENDING",
			ReceiverTimestamp: "PENDING",
			TimeoutAt:         time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		},
	}
	
	// Store metadata about batch transfer
	if transfer.Metadata == nil {
		transfer.Metadata = make(map[string]interface{})
	}
	transfer.Metadata["type"] = "BATCH"
	transfer.Metadata["quantity"] = batch.Quantity
	transfer.Metadata["productType"] = batch.ProductType
	
	transferJSON, err := json.Marshal(transfer)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState("transfer_"+transferID, transferJSON)
	if err != nil {
		return err
	}
	
	// Emit event
	err = ctx.GetStub().SetEvent("BatchTransferInitiated", transferJSON)
	if err != nil {
		return err
	}
	
	return nil
}

// InitiateTransfer starts a B2B transfer with 2-Check consensus
func (s *SupplyChainContract) InitiateTransfer(ctx contractapi.TransactionContextInterface,
	transferID string, productID string, to string, transferTypeStr string) error {
	
	// Convert string to TransferType
	var transferType TransferType
	switch transferTypeStr {
	case "SUPPLY_CHAIN":
		transferType = TransferTypeSupplyChain
	case "OWNERSHIP":
		transferType = TransferTypeOwnership
	case "RETURN":
		transferType = TransferTypeReturn
	default:
		transferType = TransferTypeSupplyChain
	}

	// Check if transfer already exists
	existingTransfer, _ := s.GetTransfer(ctx, transferID)
	if existingTransfer != nil {
		return fmt.Errorf("transfer %s already exists", transferID)
	}

	// Get product
	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return err
	}

	// Get sender identity
	sender, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get sender identity: %v", err)
	}

	// Verify sender owns the product
	if product.CurrentOwner != sender {
		return fmt.Errorf("sender does not own the product")
	}

	// Create transfer with 2-Check consensus
	transfer := Transfer{
		ID:           transferID,
		ProductID:    productID,
		From:         sender,
		To:           to,
		TransferType: transferType,
		InitiatedAt:  time.Now().Format(time.RFC3339),
		CompletedAt:  "PENDING",
		Status:       TransferStatusInitiated,
		ConsensusDetails: ConsensusInfo{
			SenderConfirmed: false,
			ReceiverConfirmed: false,
			SenderTimestamp:   "PENDING",
			ReceiverTimestamp: "PENDING",
			TimeoutAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339), // 24 hour timeout
		},
	}

	transferJSON, err := json.Marshal(transfer)
	if err != nil {
		return err
	}

	// Store transfer
	err = ctx.GetStub().PutState("transfer_"+transferID, transferJSON)
	if err != nil {
		return err
	}

	// Emit event for 2-Check consensus system
	err = ctx.GetStub().SetEvent("TransferInitiated", transferJSON)
	if err != nil {
		return err
	}

	return nil
}

// ConfirmSent confirms the sender has sent the item (2-Check consensus)
func (s *SupplyChainContract) ConfirmSent(ctx contractapi.TransactionContextInterface,
	transferID string) error {

	transfer, err := s.GetTransfer(ctx, transferID)
	if err != nil {
		return err
	}

	// Get sender identity
	sender, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get sender identity: %v", err)
	}

	// Verify it's the sender confirming
	if transfer.From != sender {
		return fmt.Errorf("only the sender can confirm sent")
	}

	// Update consensus info
	now := time.Now().Format(time.RFC3339)
	transfer.ConsensusDetails.SenderConfirmed = true
	transfer.ConsensusDetails.SenderTimestamp = now
	transfer.Status = TransferStatusPending

	transferJSON, err := json.Marshal(transfer)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState("transfer_"+transferID, transferJSON)
	if err != nil {
		return err
	}

	// Emit event
	err = ctx.GetStub().SetEvent("TransferSentConfirmed", transferJSON)
	if err != nil {
		return err
	}

	return nil
}

// ConfirmReceived confirms the receiver has received the item (2-Check consensus)
func (s *SupplyChainContract) ConfirmReceived(ctx contractapi.TransactionContextInterface,
	transferID string) error {

	transfer, err := s.GetTransfer(ctx, transferID)
	if err != nil {
		return err
	}

	// Get receiver identity
	receiver, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get receiver identity: %v", err)
	}

	// Verify it's the receiver confirming
	if transfer.To != receiver {
		return fmt.Errorf("only the receiver can confirm receipt")
	}

	// Check if sender has confirmed
	if !transfer.ConsensusDetails.SenderConfirmed {
		return fmt.Errorf("sender must confirm sent before receiver can confirm receipt")
	}

	// Update consensus info
	now := time.Now().Format(time.RFC3339)
	transfer.ConsensusDetails.ReceiverConfirmed = true
	transfer.ConsensusDetails.ReceiverTimestamp = now
	transfer.Status = TransferStatusCompleted
	transfer.CompletedAt = now

	// Get receiver's role using RoleManagementContract
	roleContract := &RoleManagementContract{}
	receiverRole, err := roleContract.GetOrganizationRole(ctx, receiver)
	if err != nil {
		return fmt.Errorf("failed to get receiver role: %v", err)
	}

	// Check if this is a batch transfer
	if transfer.Metadata != nil {
		if batchType, ok := transfer.Metadata["type"].(string); ok && batchType == "BATCH" {
			// Handle batch transfer
			batch, err := s.GetBatch(ctx, transfer.ProductID) // ProductID is actually batchID for batch transfers
			if err != nil {
				return fmt.Errorf("failed to get batch: %v", err)
			}
			
			// Update batch ownership and location
			batch.CurrentOwner = transfer.To
			batch.CurrentLocation = transfer.To
			
			// Update batch status based on receiver's role
			switch receiverRole {
			case RoleRetailer:
				batch.Status = BatchStatusAtRetailer
			case RoleWarehouse:
				batch.Status = BatchStatusAtWarehouse
			case RoleManufacturer:
				batch.Status = BatchStatusCreated
			default:
				batch.Status = BatchStatusInTransit
			}
			
			// Save batch
			batchJSON, err := json.Marshal(batch)
			if err != nil {
				return err
			}
			err = ctx.GetStub().PutState("batch_"+batch.ID, batchJSON)
			if err != nil {
				return err
			}
			
			// Update all products in batch
			for _, productID := range batch.ProductIDs {
				product, err := s.GetProduct(ctx, productID)
				if err != nil {
					continue // Skip if product not found
				}
				product.CurrentOwner = transfer.To
				product.CurrentLocation = transfer.To
				
				// Update product status based on receiver's role
				switch receiverRole {
				case RoleRetailer:
					product.Status = ProductStatusInStore
				case RoleWarehouse:
					product.Status = ProductStatusInTransit
				case RoleManufacturer:
					product.Status = ProductStatusInProduction
				default:
					product.Status = ProductStatusInTransit
				}
				
				productJSON, err := json.Marshal(product)
				if err != nil {
					continue
				}
				ctx.GetStub().PutState(productID, productJSON)
			}
		} else {
			// Handle single product transfer
			product, err := s.GetProduct(ctx, transfer.ProductID)
			if err != nil {
				return err
			}

			product.CurrentOwner = transfer.To
			product.CurrentLocation = transfer.To

			// Update product status based on receiver's role
			switch receiverRole {
			case RoleRetailer:
				product.Status = ProductStatusInStore
			case RoleWarehouse:
				product.Status = ProductStatusInTransit
			case RoleManufacturer:
				product.Status = ProductStatusInProduction
			default:
				product.Status = ProductStatusInTransit
			}

			// Save product
			productJSON, err := json.Marshal(product)
			if err != nil {
				return err
			}
			err = ctx.GetStub().PutState(product.ID, productJSON)
			if err != nil {
				return err
			}
		}
	} else {
		// Legacy single product transfer (no metadata)
		product, err := s.GetProduct(ctx, transfer.ProductID)
		if err != nil {
			return err
		}

		product.CurrentOwner = transfer.To
		product.CurrentLocation = transfer.To

		// Update product status based on receiver's role
		switch receiverRole {
		case RoleRetailer:
			product.Status = ProductStatusInStore
		case RoleWarehouse:
			product.Status = ProductStatusInTransit
		case RoleManufacturer:
			product.Status = ProductStatusInProduction
		default:
			product.Status = ProductStatusInTransit
		}

		// Save product
		productJSON, err := json.Marshal(product)
		if err != nil {
			return err
		}
		err = ctx.GetStub().PutState(product.ID, productJSON)
		if err != nil {
			return err
		}
	}

	// Save transfer
	transferJSON, err := json.Marshal(transfer)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState("transfer_"+transferID, transferJSON)
	if err != nil {
		return err
	}

	// Emit event
	err = ctx.GetStub().SetEvent("TransferCompleted", transferJSON)
	if err != nil {
		return err
	}

	return nil
}

// GetProduct retrieves a product by ID
func (s *SupplyChainContract) GetProduct(ctx contractapi.TransactionContextInterface, 
	productID string) (*Product, error) {

	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return nil, fmt.Errorf("failed to read product: %v", err)
	}
	if productJSON == nil {
		return nil, fmt.Errorf("product %s does not exist", productID)
	}

	var product Product
	err = json.Unmarshal(productJSON, &product)
	if err != nil {
		return nil, err
	}

	// Ensure Materials is never nil (empty array instead)
	if product.Materials == nil {
		product.Materials = []Material{}
	}

	return &product, nil
}

// GetTransfer retrieves a transfer by ID
func (s *SupplyChainContract) GetTransfer(ctx contractapi.TransactionContextInterface,
	transferID string) (*Transfer, error) {

	transferJSON, err := ctx.GetStub().GetState("transfer_" + transferID)
	if err != nil {
		return nil, fmt.Errorf("failed to read transfer: %v", err)
	}
	if transferJSON == nil {
		return nil, fmt.Errorf("transfer %s does not exist", transferID)
	}

	var transfer Transfer
	err = json.Unmarshal(transferJSON, &transfer)
	if err != nil {
		return nil, err
	}

	return &transfer, nil
}

// ProductExists checks if a product exists
func (s *SupplyChainContract) ProductExists(ctx contractapi.TransactionContextInterface,
	productID string) (bool, error) {

	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return false, fmt.Errorf("failed to read product: %v", err)
	}

	return productJSON != nil, nil
}

// GetProductHistory returns the history of a product
func (s *SupplyChainContract) GetProductHistory(ctx contractapi.TransactionContextInterface,
	productID string) ([]map[string]interface{}, error) {

	resultsIterator, err := ctx.GetStub().GetHistoryForKey(productID)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var history []map[string]interface{}
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var record map[string]interface{}
		record = make(map[string]interface{})
		record["txId"] = response.TxId
		record["timestamp"] = response.Timestamp
		record["isDelete"] = response.IsDelete

		if !response.IsDelete {
			var product Product
			err = json.Unmarshal(response.Value, &product)
			if err != nil {
				return nil, err
			}
			// Ensure Materials is never nil
			if product.Materials == nil {
				product.Materials = []Material{}
			}
			record["value"] = product
		}

		history = append(history, record)
	}

	return history, nil
}

// QueryProductsByBrand queries products by brand
func (s *SupplyChainContract) QueryProductsByBrand(ctx contractapi.TransactionContextInterface,
	brand string) ([]*Product, error) {

	queryString := fmt.Sprintf(`{"selector":{"brand":"%s"}}`, brand)
	return s.queryProducts(ctx, queryString)
}

// QueryProductsByStatus queries products by status
func (s *SupplyChainContract) QueryProductsByStatus(ctx contractapi.TransactionContextInterface,
	status ProductStatus) ([]*Product, error) {

	queryString := fmt.Sprintf(`{"selector":{"status":"%s"}}`, status)
	return s.queryProducts(ctx, queryString)
}

// Helper function to execute queries
func (s *SupplyChainContract) queryProducts(ctx contractapi.TransactionContextInterface,
	queryString string) ([]*Product, error) {

	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var products []*Product
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var product Product
		err = json.Unmarshal(queryResponse.Value, &product)
		if err != nil {
			return nil, err
		}
		// Ensure Materials is never nil
		if product.Materials == nil {
			product.Materials = []Material{}
		}
		products = append(products, &product)
	}

	return products, nil
}

// ============= MATERIAL INVENTORY MANAGEMENT =============

// CreateMaterialInventory creates initial material inventory for a supplier
func (s *SupplyChainContract) CreateMaterialInventory(ctx contractapi.TransactionContextInterface,
	materialID string, materialType string, batch string, quantityStr string) error {
	
	// Parse quantity
	quantity, err := strconv.ParseFloat(quantityStr, 64)
	if err != nil {
		return fmt.Errorf("invalid quantity: %v", err)
	}

	// Get supplier identity
	supplier, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get supplier identity: %v", err)
	}
	
	// CHECK PERMISSION - Only suppliers can create material inventory
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, supplier, "CREATE_MATERIAL")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to create material inventory", supplier)
	}

	// Check if inventory already exists
	inventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, supplier)
	existing, err := ctx.GetStub().GetState(inventoryKey)
	if err != nil {
		return err
	}
	if existing != nil {
		return fmt.Errorf("material inventory %s already exists for %s", materialID, supplier)
	}

	// Create new inventory
	inventory := MaterialInventory{
		ID:            inventoryKey,
		MaterialID:    materialID,
		Batch:         batch,
		Owner:         supplier,
		Supplier:      supplier,
		Type:          materialType,
		TotalReceived: quantity,
		Available:     quantity,
		Used:          0,
		Transfers:     []MaterialTransferRecord{},
	}

	inventoryJSON, err := json.Marshal(inventory)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(inventoryKey, inventoryJSON)
}

// TransferMaterialInventory transfers material from one organization to another with consensus
func (s *SupplyChainContract) TransferMaterialInventory(ctx contractapi.TransactionContextInterface,
	transferID string, materialID string, toOrganization string, quantityStr string) error {
	
	// Parse quantity
	quantity, err := strconv.ParseFloat(quantityStr, 64)
	if err != nil {
		return fmt.Errorf("invalid quantity: %v", err)
	}

	// Get sender identity
	fromOrganization, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get sender identity: %v", err)
	}
	
	// CHECK PERMISSION - Only suppliers and manufacturers can transfer materials
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, fromOrganization, "TRANSFER_MATERIAL")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to transfer materials", fromOrganization)
	}
	
	// Submit to consensus first
	err = s.SubmitMaterialTransferToConsensus(ctx, transferID, materialID, fromOrganization, toOrganization, quantity)
	if err != nil {
		return fmt.Errorf("failed to submit material transfer to consensus: %v", err)
	}

	// Get sender's inventory
	senderInventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, fromOrganization)
	senderInventoryJSON, err := ctx.GetStub().GetState(senderInventoryKey)
	if err != nil {
		return err
	}
	if senderInventoryJSON == nil {
		return fmt.Errorf("material %s not found in %s's inventory", materialID, fromOrganization)
	}

	var senderInventory MaterialInventory
	err = json.Unmarshal(senderInventoryJSON, &senderInventory)
	if err != nil {
		return err
	}

	// Check available quantity
	if senderInventory.Available < quantity {
		return fmt.Errorf("insufficient material: requested %.2f, available %.2f", quantity, senderInventory.Available)
	}

	// Deduct from sender
	senderInventory.Available -= quantity
	transferRecord := MaterialTransferRecord{
		TransferID:   transferID,
		From:         fromOrganization,
		To:           toOrganization,
		Quantity:     quantity,
		TransferDate: time.Now().Format(time.RFC3339),
		Verified:     false, // Will be set to true after 2-check consensus
		Status:       "PENDING", // Default status for new transfers
	}
	senderInventory.Transfers = append(senderInventory.Transfers, transferRecord)

	// Update sender inventory
	updatedSenderJSON, err := json.Marshal(senderInventory)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState(senderInventoryKey, updatedSenderJSON)
	if err != nil {
		return err
	}

	// Create or update receiver's inventory
	receiverInventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, toOrganization)
	receiverInventoryJSON, err := ctx.GetStub().GetState(receiverInventoryKey)
	if err != nil {
		return err
	}

	var receiverInventory MaterialInventory
	if receiverInventoryJSON == nil {
		// Create new inventory for receiver
		receiverInventory = MaterialInventory{
			ID:            receiverInventoryKey,
			MaterialID:    materialID,
			Batch:         senderInventory.Batch,
			Owner:         toOrganization,
			Supplier:      senderInventory.Supplier, // Original supplier
			Type:          senderInventory.Type,
			TotalReceived: 0, // Will be updated after confirmation
			Available:     0, // Will be updated after confirmation
			Used:          0,
			Transfers:     []MaterialTransferRecord{},
		}
	} else {
		err = json.Unmarshal(receiverInventoryJSON, &receiverInventory)
		if err != nil {
			return err
		}
	}

	// Add pending transfer (will be confirmed through 2-check)
	receiverInventory.Transfers = append(receiverInventory.Transfers, transferRecord)

	// Update receiver inventory
	updatedReceiverJSON, err := json.Marshal(receiverInventory)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(receiverInventoryKey, updatedReceiverJSON)
	if err != nil {
		return err
	}
	
	// Emit event for consensus tracking
	eventData := map[string]interface{}{
		"transferID": transferID,
		"materialID": materialID,
		"from":       fromOrganization,
		"to":         toOrganization,
		"quantity":   quantity,
	}
	eventJSON, _ := json.Marshal(eventData)
	ctx.GetStub().SetEvent("MaterialTransferInitiated", eventJSON)
	
	return nil
}

// ConfirmMaterialReceived confirms material receipt and updates inventory with consensus
func (s *SupplyChainContract) ConfirmMaterialReceived(ctx contractapi.TransactionContextInterface,
	transferID string, materialID string) error {

	// Get receiver identity
	receiver, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get receiver identity: %v", err)
	}

	// Get receiver's inventory
	inventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, receiver)
	inventoryJSON, err := ctx.GetStub().GetState(inventoryKey)
	if err != nil {
		return err
	}
	if inventoryJSON == nil {
		return fmt.Errorf("material inventory not found for %s", receiver)
	}

	var inventory MaterialInventory
	err = json.Unmarshal(inventoryJSON, &inventory)
	if err != nil {
		return err
	}

	// Find and verify the transfer
	var transferFound bool
	var transferQuantity float64
	for i, transfer := range inventory.Transfers {
		if transfer.TransferID == transferID && transfer.To == receiver {
			if transfer.Verified {
				return fmt.Errorf("transfer %s already confirmed", transferID)
			}
			inventory.Transfers[i].Verified = true
			inventory.Transfers[i].Status = "COMPLETED" // Update status when verified
			transferQuantity = transfer.Quantity
			transferFound = true
			break
		}
	}

	if !transferFound {
		return fmt.Errorf("transfer %s not found for material %s", transferID, materialID)
	}

	// Update quantities after confirmation
	inventory.TotalReceived += transferQuantity
	inventory.Available += transferQuantity

	// Update receiver's inventory
	updatedInventoryJSON, err := json.Marshal(inventory)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState(inventoryKey, updatedInventoryJSON)
	if err != nil {
		return err
	}
	
	// Also update sender's inventory to mark transfer as verified
	// First, find the sender from the transfer record
	var senderMSP string
	for _, transfer := range inventory.Transfers {
		if transfer.TransferID == transferID {
			senderMSP = transfer.From
			break
		}
	}
	
	// Get sender's inventory
	senderInventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, senderMSP)
	senderInventoryJSON, err := ctx.GetStub().GetState(senderInventoryKey)
	if err != nil {
		return err
	}
	
	if senderInventoryJSON != nil {
		var senderInventory MaterialInventory
		err = json.Unmarshal(senderInventoryJSON, &senderInventory)
		if err != nil {
			return err
		}
		
		// Mark the transfer as verified in sender's inventory
		for i, transfer := range senderInventory.Transfers {
			if transfer.TransferID == transferID {
				senderInventory.Transfers[i].Verified = true
				senderInventory.Transfers[i].Status = "COMPLETED" // Update status when verified
				break
			}
		}
		
		// Update sender's inventory
		updatedSenderJSON, err := json.Marshal(senderInventory)
		if err != nil {
			return err
		}
		
		err = ctx.GetStub().PutState(senderInventoryKey, updatedSenderJSON)
		if err != nil {
			return err
		}
	}
	
	// Notify consensus of receipt confirmation
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	err = consensus.NotifyConsensusOfReceived(ctx, transferID, receiver)
	if err != nil {
		// Log but don't fail - material transfer is already complete
		fmt.Printf("Warning: Failed to notify consensus of material receipt: %v\n", err)
	}
	
	// Emit event
	eventData := map[string]interface{}{
		"transferID": transferID,
		"materialID": materialID,
		"receiver":   receiver,
		"quantity":   transferQuantity,
	}
	eventJSON, _ := json.Marshal(eventData)
	ctx.GetStub().SetEvent("MaterialReceiptConfirmed", eventJSON)

	return nil
}

// ConfirmReturnTransferReceived confirms receipt of a return transfer from dispute resolution
// This handles the case where inventory might not exist (e.g., supplier receiving returns)
func (s *SupplyChainContract) ConfirmReturnTransferReceived(ctx contractapi.TransactionContextInterface,
	transferID string, materialID string) error {

	// Get receiver identity
	receiver, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get receiver identity: %v", err)
	}

	// For return transfers, create inventory if it doesn't exist
	inventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, receiver)
	inventoryJSON, err := ctx.GetStub().GetState(inventoryKey)
	if err != nil {
		return err
	}

	var inventory MaterialInventory
	var transferQuantity float64 = 1 // Default quantity

	// Get the transfer details to find actual quantity
	transferKey := "transfer_" + transferID
	transferJSON, err := ctx.GetStub().GetState(transferKey)
	if err == nil && transferJSON != nil {
		var transfer Transfer
		err = json.Unmarshal(transferJSON, &transfer)
		if err == nil {
			// Get quantity from metadata
			if qtyVal, ok := transfer.Metadata["quantity"]; ok {
				switch v := qtyVal.(type) {
				case float64:
					transferQuantity = v
				case int:
					transferQuantity = float64(v)
				case string:
					qty, _ := strconv.ParseFloat(v, 64)
					transferQuantity = qty
				}
			}
		}
	}

	if inventoryJSON == nil {
		// Create new inventory for returned materials
		inventory = MaterialInventory{
			ID:           fmt.Sprintf("%s_%s", materialID, receiver),
			MaterialID:   materialID,
			Batch:        "RETURN-" + transferID,
			Owner:        receiver,
			Supplier:     "RETURN", // Return transfer supplier
			Type:         "RETURNED",
			TotalReceived: 0, // Will be updated below
			Available:    0, // Will be updated below
			Used:         0,
			Transfers:    []MaterialTransferRecord{},
		}
	} else {
		err = json.Unmarshal(inventoryJSON, &inventory)
		if err != nil {
			return err
		}
	}

	// Add the return transfer to transfers list
	inventory.Transfers = append(inventory.Transfers, MaterialTransferRecord{
		TransferID:   transferID,
		From:         "RETURN", // Return transfer
		To:           receiver,
		Quantity:     transferQuantity,
		TransferDate: time.Now().Format(time.RFC3339),
		Status:       "COMPLETED",
		Verified:     true,
	})

	// Update inventory quantities (add returned quantity)
	inventory.TotalReceived += transferQuantity
	inventory.Available += transferQuantity

	// Save updated inventory
	updatedJSON, err := json.Marshal(inventory)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(inventoryKey, updatedJSON)
	if err != nil {
		return err
	}

	// Notify consensus of receipt confirmation
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	err = consensus.NotifyConsensusOfReceived(ctx, transferID, receiver)
	if err != nil {
		// Log but don't fail - return transfer is already complete
		fmt.Printf("Warning: Failed to notify consensus of return receipt: %v\n", err)
	}

	// Emit event
	eventData := map[string]interface{}{
		"transferID": transferID,
		"materialID": materialID,
		"receiver":   receiver,
		"quantity":   transferQuantity,
		"isReturn":   true,
	}
	eventJSON, _ := json.Marshal(eventData)
	ctx.GetStub().SetEvent("ReturnTransferReceiptConfirmed", eventJSON)

	return nil
}

// GetMaterialInventory retrieves material inventory for an organization
func (s *SupplyChainContract) GetMaterialInventory(ctx contractapi.TransactionContextInterface,
	materialID string, organization string) (*MaterialInventory, error) {

	inventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, organization)
	inventoryJSON, err := ctx.GetStub().GetState(inventoryKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read inventory: %v", err)
	}
	if inventoryJSON == nil {
		return nil, fmt.Errorf("inventory not found for material %s and organization %s", materialID, organization)
	}

	var inventory MaterialInventory
	err = json.Unmarshal(inventoryJSON, &inventory)
	if err != nil {
		return nil, err
	}

	return &inventory, nil
}

// GetAllMaterialInventories returns all material inventories from the blockchain
func (s *SupplyChainContract) GetAllMaterialInventories(ctx contractapi.TransactionContextInterface) ([]*MaterialInventory, error) {
	// Use GetStateByRange to query all material inventories
	resultsIterator, err := ctx.GetStub().GetStateByRange("material_inventory_", "material_inventory_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query material inventories: %v", err)
	}
	defer resultsIterator.Close()

	var inventories []*MaterialInventory
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var inventory MaterialInventory
		err = json.Unmarshal(queryResponse.Value, &inventory)
		if err != nil {
			return nil, err
		}

		inventories = append(inventories, &inventory)
	}

	return inventories, nil
}

// VerifyProductByBatch allows customer to verify a product using batch QR code and unique identifier
func (s *SupplyChainContract) VerifyProductByBatch(ctx contractapi.TransactionContextInterface,
	batchID string, uniqueIdentifier string) (*Product, error) {
	
	// Get batch
	batchJSON, err := ctx.GetStub().GetState("batch_" + batchID)
	if err != nil {
		return nil, err
	}
	if batchJSON == nil {
		return nil, fmt.Errorf("batch %s not found", batchID)
	}
	
	var batch ProductBatch
	err = json.Unmarshal(batchJSON, &batch)
	if err != nil {
		return nil, err
	}
	
	// Find product with matching unique identifier
	var targetProductID string
	for _, productID := range batch.ProductIDs {
		product, err := s.GetProduct(ctx, productID)
		if err != nil {
			continue
		}
		if product.UniqueIdentifier == uniqueIdentifier {
			targetProductID = productID
			break
		}
	}
	
	if targetProductID == "" {
		return nil, fmt.Errorf("product with identifier %s not found in batch %s", uniqueIdentifier, batchID)
	}
	
	// Get and return the product
	return s.GetProduct(ctx, targetProductID)
}

// TakeOwnership records customer ownership of a product
// Called by RETAILER organization after customer purchase (customer auth handled off-chain)
// Now includes securityHash (password+PIN) for secure transfers
func (s *SupplyChainContract) TakeOwnership(ctx contractapi.TransactionContextInterface,
	productID string, ownerHash string, securityHash string, purchaseLocation string) error {
	
	// Get caller identity
	caller, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get caller identity: %v", err)
	}
	
	// CHECK PERMISSION - Only retailers can assign ownership to customers
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, caller, "TAKE_OWNERSHIP")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to assign ownership", caller)
	}
	
	// Get product
	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return err
	}
	
	// Verify product is at retailer and available for sale
	if product.Status != ProductStatusInStore {
		return fmt.Errorf("product is not available for sale, current status: %s", product.Status)
	}
	
	// Check if already owned
	ownershipKey := "ownership_" + productID
	existingOwnership, _ := ctx.GetStub().GetState(ownershipKey)
	if existingOwnership != nil {
		return fmt.Errorf("product already has an owner")
	}
	
	// Create ownership record
	ownership := Ownership{
		ProductID:        productID,
		OwnerHash:        ownerHash,
		SecurityHash:     securityHash,  // Store security hash for PIN verification
		OwnershipDate:    time.Now().Format(time.RFC3339),
		PurchaseLocation: purchaseLocation,
		Status:           OwnershipStatusActive,
		ServiceHistory:   []ServiceRecord{},
		PreviousOwners:   []PreviousOwner{},
	}
	
	// Store ownership
	ownershipJSON, err := json.Marshal(ownership)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState(ownershipKey, ownershipJSON)
	if err != nil {
		return err
	}
	
	// Update product status and ownership
	product.Status = ProductStatusSold
	product.OwnershipHash = ownerHash
	product.CurrentOwner = "customer" // Generic label for privacy (actual owner identified by hash)
	product.IsStolen = false
	
	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState(productID, productJSON)
	if err != nil {
		return err
	}
	
	// Update batch status if needed
	if product.BatchID != "" {
		err = s.updateBatchStatus(ctx, product.BatchID)
		if err != nil {
			// Log error but don't fail the ownership transfer
			fmt.Printf("Warning: failed to update batch status: %v\n", err)
		}
	}
	
	// Emit event
	ctx.GetStub().SetEvent("OwnershipTaken", ownershipJSON)
	
	return nil
}

// updateBatchStatus updates batch status based on sold products
func (s *SupplyChainContract) updateBatchStatus(ctx contractapi.TransactionContextInterface,
	batchID string) error {
	
	// Get batch
	batch, err := s.GetBatch(ctx, batchID)
	if err != nil {
		return err
	}
	
	// Count sold products
	soldCount := 0
	for _, productID := range batch.ProductIDs {
		product, err := s.GetProduct(ctx, productID)
		if err != nil {
			continue
		}
		if product.Status == ProductStatusSold {
			soldCount++
		}
	}
	
	// Update batch status
	if soldCount == 0 {
		// No change needed
		return nil
	} else if soldCount == batch.Quantity {
		batch.Status = BatchStatusSold
	} else {
		batch.Status = BatchStatusPartial
	}
	
	// Save updated batch
	batchJSON, err := json.Marshal(batch)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState("batch_"+batchID, batchJSON)
}

// GetBatch retrieves a batch by ID
func (s *SupplyChainContract) GetBatch(ctx contractapi.TransactionContextInterface,
	batchID string) (*ProductBatch, error) {
	
	batchJSON, err := ctx.GetStub().GetState("batch_" + batchID)
	if err != nil {
		return nil, fmt.Errorf("failed to read batch: %v", err)
	}
	if batchJSON == nil {
		return nil, fmt.Errorf("batch %s does not exist", batchID)
	}
	
	var batch ProductBatch
	err = json.Unmarshal(batchJSON, &batch)
	if err != nil {
		return nil, err
	}
	
	return &batch, nil
}

// GetPublicProductInfo returns only public information about a product
func (s *SupplyChainContract) GetPublicProductInfo(ctx contractapi.TransactionContextInterface, 
	productID string) (map[string]interface{}, error) {
	
	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return nil, err
	}
	
	// Return only public fields
	publicInfo := map[string]interface{}{
		"id":           product.ID,
		"batchId":      product.BatchID,
		"brand":        product.Brand,
		"type":         product.Type,
		"status":       product.Status,
		"isStolen":     product.IsStolen,
		"hasOwner":     product.OwnershipHash != "",
		"createdAt":    product.CreatedAt,
	}
	
	return publicInfo, nil
}

// GetAllProducts returns all products from the blockchain
func (s *SupplyChainContract) GetAllProducts(ctx contractapi.TransactionContextInterface) ([]*Product, error) {
	// Query all products - we'll use a range query to get all product keys
	// Products are stored with their productID as the key directly
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("failed to query products: %v", err)
	}
	defer resultsIterator.Close()

	var products []*Product
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		// Skip if this is not a product (e.g., transfers or material inventories)
		key := queryResponse.Key
		if strings.HasPrefix(key, "transfer_") || strings.HasPrefix(key, "material_inventory_") {
			continue
		}

		var product Product
		err = json.Unmarshal(queryResponse.Value, &product)
		if err != nil {
			// Skip items that don't unmarshal as products
			continue
		}
		// Ensure Materials is never nil
		if product.Materials == nil {
			product.Materials = []Material{}
		}

		// Verify it's actually a product by checking required fields
		if product.ID != "" && product.Brand != "" {
			products = append(products, &product)
		}
	}

	return products, nil
}

// UpdateTransferStatus updates the status of a material transfer
func (s *SupplyChainContract) UpdateTransferStatus(ctx contractapi.TransactionContextInterface, 
	transferID string, status string) error {
	
	// Query all material inventories to find the transfer
	inventories, err := s.GetAllMaterialInventories(ctx)
	if err != nil {
		return fmt.Errorf("failed to get inventories: %v", err)
	}
	
	// Find and update the transfer
	found := false
	for _, inventory := range inventories {
		for i, transfer := range inventory.Transfers {
			if transfer.TransferID == transferID {
				// Update the transfer status
				inventory.Transfers[i].Status = status
				
				// If disputed, mark as not verified
				if status == "DISPUTED" {
					inventory.Transfers[i].Verified = false
				}
				
				// Save the updated inventory
				inventoryKey := fmt.Sprintf("material_inventory_%s_%s", inventory.MaterialID, inventory.Owner)
				inventoryJSON, err := json.Marshal(inventory)
				if err != nil {
					return fmt.Errorf("failed to marshal inventory: %v", err)
				}
				
				err = ctx.GetStub().PutState(inventoryKey, inventoryJSON)
				if err != nil {
					return fmt.Errorf("failed to update inventory: %v", err)
				}
				
				found = true
				break
			}
		}
		if found {
			break
		}
	}
	
	if !found {
		return fmt.Errorf("transfer %s not found", transferID)
	}
	
	return nil
}

// GetMaterialTransfer retrieves a material transfer by ID
func (s *SupplyChainContract) GetMaterialTransfer(ctx contractapi.TransactionContextInterface, transferID string) (*MaterialTransferRecord, error) {
	// Search through all material inventories to find the transfer
	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("material_inventory", []string{})
	if err != nil {
		return nil, fmt.Errorf("failed to get material inventories: %v", err)
	}
	defer resultsIterator.Close()
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate: %v", err)
		}
		
		var inventory MaterialInventory
		err = json.Unmarshal(queryResponse.Value, &inventory)
		if err != nil {
			continue
		}
		
		for _, transfer := range inventory.Transfers {
			if transfer.TransferID == transferID {
				return &transfer, nil
			}
		}
	}
	
	return nil, fmt.Errorf("transfer %s not found", transferID)
}

// ============= MISSING FUNCTIONS IMPLEMENTATION =============

// GetProductsByBatch retrieves all products in a batch
func (s *SupplyChainContract) GetProductsByBatch(ctx contractapi.TransactionContextInterface,
	batchID string) ([]*Product, error) {
	
	// Get the batch first
	batch, err := s.GetBatch(ctx, batchID)
	if err != nil {
		return nil, err
	}
	
	// Get all products in the batch
	var products []*Product
	for _, productID := range batch.ProductIDs {
		product, err := s.GetProduct(ctx, productID)
		if err != nil {
			continue // Skip if product not found
		}
		products = append(products, product)
	}
	
	return products, nil
}

// GetAllBatches retrieves all batches from the blockchain
func (s *SupplyChainContract) GetAllBatches(ctx contractapi.TransactionContextInterface) ([]*ProductBatch, error) {
	// Query all batches
	resultsIterator, err := ctx.GetStub().GetStateByRange("batch_", "batch_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query batches: %v", err)
	}
	defer resultsIterator.Close()
	
	var batches []*ProductBatch
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var batch ProductBatch
		err = json.Unmarshal(queryResponse.Value, &batch)
		if err != nil {
			continue
		}
		
		batches = append(batches, &batch)
	}
	
	return batches, nil
}

// GetBatchesByOrganization retrieves all batches owned by an organization
func (s *SupplyChainContract) GetBatchesByOrganization(ctx contractapi.TransactionContextInterface,
	orgMSPID string) ([]*ProductBatch, error) {
	
	// Get all batches
	allBatches, err := s.GetAllBatches(ctx)
	if err != nil {
		return nil, err
	}
	
	// Filter by organization
	var orgBatches []*ProductBatch
	for _, batch := range allBatches {
		if batch.CurrentOwner == orgMSPID {
			orgBatches = append(orgBatches, batch)
		}
	}
	
	return orgBatches, nil
}

// UpdateBatchLocation updates the location and status of a batch
func (s *SupplyChainContract) UpdateBatchLocation(ctx contractapi.TransactionContextInterface,
	batchID string, newLocation string, newStatus string) error {
	
	// Get caller identity to verify permission
	caller, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get caller identity: %v", err)
	}
	
	// CHECK PERMISSION - Only warehouses can update locations
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, caller, "UPDATE_LOCATION")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to update batch location", caller)
	}
	
	// Get batch
	batch, err := s.GetBatch(ctx, batchID)
	if err != nil {
		return err
	}
	
	// Verify caller owns the batch
	if batch.CurrentOwner != caller {
		return fmt.Errorf("only the current owner can update batch location")
	}
	
	// Update location
	batch.CurrentLocation = newLocation
	
	// Update status if provided
	if newStatus != "" {
		var status BatchStatus
		switch newStatus {
		case "CREATED":
			status = BatchStatusCreated
		case "IN_TRANSIT":
			status = BatchStatusInTransit
		case "AT_WAREHOUSE":
			status = BatchStatusAtWarehouse
		case "AT_RETAILER":
			status = BatchStatusAtRetailer
		case "PARTIAL":
			status = BatchStatusPartial
		case "SOLD_OUT":
			status = BatchStatusSold
		default:
			return fmt.Errorf("invalid batch status: %s", newStatus)
		}
		batch.Status = status
	}
	
	// Save updated batch
	batchJSON, err := json.Marshal(batch)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState("batch_"+batchID, batchJSON)
}

// ProcessReturn handles inventory adjustments after dispute resolution
func (s *SupplyChainContract) ProcessReturn(ctx contractapi.TransactionContextInterface,
	returnTransferID string, itemType string, itemID string, quantity int) error {
	
	// Get the return transfer
	transfer, err := s.GetTransfer(ctx, returnTransferID)
	if err != nil {
		return err
	}
	
	// Verify this is a return transfer
	if transfer.TransferType != TransferTypeReturn {
		return fmt.Errorf("transfer %s is not a return transfer", returnTransferID)
	}
	
	// Check item type
	if itemType == "MATERIAL" {
		// Handle material return
		fromInventoryKey := fmt.Sprintf("material_inventory_%s_%s", itemID, transfer.From)
		toInventoryKey := fmt.Sprintf("material_inventory_%s_%s", itemID, transfer.To)
		
		// Reduce from sender's inventory
		fromInventoryJSON, err := ctx.GetStub().GetState(fromInventoryKey)
		if err != nil {
			return err
		}
		if fromInventoryJSON != nil {
			var fromInventory MaterialInventory
			json.Unmarshal(fromInventoryJSON, &fromInventory)
			fromInventory.Available -= float64(quantity)
			
			updatedFromJSON, _ := json.Marshal(fromInventory)
			ctx.GetStub().PutState(fromInventoryKey, updatedFromJSON)
		}
		
		// Add to receiver's inventory
		toInventoryJSON, err := ctx.GetStub().GetState(toInventoryKey)
		if err != nil {
			return err
		}
		if toInventoryJSON != nil {
			var toInventory MaterialInventory
			json.Unmarshal(toInventoryJSON, &toInventory)
			toInventory.Available += float64(quantity)
			
			updatedToJSON, _ := json.Marshal(toInventory)
			ctx.GetStub().PutState(toInventoryKey, updatedToJSON)
		}
	} else if itemType == "PRODUCT" || itemType == "BATCH" {
		// Handle product/batch return
		if itemType == "BATCH" {
			// Update batch ownership
			batch, err := s.GetBatch(ctx, itemID)
			if err != nil {
				return err
			}
			
			batch.CurrentOwner = transfer.To
			batch.CurrentLocation = transfer.To
			
			batchJSON, _ := json.Marshal(batch)
			ctx.GetStub().PutState("batch_"+itemID, batchJSON)
			
			// Update all products in batch
			for _, productID := range batch.ProductIDs {
				product, err := s.GetProduct(ctx, productID)
				if err == nil {
					product.CurrentOwner = transfer.To
					product.CurrentLocation = transfer.To
					productJSON, _ := json.Marshal(product)
					ctx.GetStub().PutState(productID, productJSON)
				}
			}
		} else {
			// Update single product
			product, err := s.GetProduct(ctx, itemID)
			if err != nil {
				return err
			}
			
			product.CurrentOwner = transfer.To
			product.CurrentLocation = transfer.To
			
			productJSON, _ := json.Marshal(product)
			ctx.GetStub().PutState(itemID, productJSON)
		}
	}
	
	// Mark transfer as processed
	transfer.Status = TransferStatusCompleted
	transfer.CompletedAt = time.Now().Format(time.RFC3339)
	
	transferJSON, _ := json.Marshal(transfer)
	ctx.GetStub().PutState("transfer_"+returnTransferID, transferJSON)
	
	// Emit event
	eventData := map[string]interface{}{
		"transferID": returnTransferID,
		"itemType":   itemType,
		"itemID":     itemID,
		"quantity":   quantity,
		"from":       transfer.From,
		"to":         transfer.To,
	}
	eventJSON, _ := json.Marshal(eventData)
	ctx.GetStub().SetEvent("ReturnProcessed", eventJSON)
	
	return nil
}

// ProcessCustomerReturn handles direct returns from customers to retailers
// No consensus needed since customers aren't blockchain participants
func (s *SupplyChainContract) ProcessCustomerReturn(ctx contractapi.TransactionContextInterface,
	productID string, reason string, retailerMSPID string) error {
	
	// Get product
	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return fmt.Errorf("failed to get product: %v", err)
	}
	
	// Verify product has customer ownership
	if product.OwnershipHash == "" {
		return fmt.Errorf("product %s has no customer owner", productID)
	}
	
	// Verify retailer is valid
	roleContract := &RoleManagementContract{}
	retailerRole, err := roleContract.GetOrganizationRole(ctx, retailerMSPID)
	if err != nil {
		return fmt.Errorf("invalid retailer: %v", err)
	}
	if retailerRole != RoleRetailer {
		return fmt.Errorf("%s is not a retailer", retailerMSPID)
	}
	
	// Clear customer ownership
	product.OwnershipHash = "NONE"
	product.Status = ProductStatusInStore // Back in store, not "SOLD" anymore
	product.CurrentOwner = retailerMSPID
	product.CurrentLocation = retailerMSPID
	
	// Add return reason to metadata
	if product.Metadata == nil {
		product.Metadata = make(map[string]interface{})
	}
	product.Metadata["lastReturnReason"] = reason
	product.Metadata["lastReturnDate"] = time.Now().Format(time.RFC3339)
	product.Metadata["returnedFrom"] = "CUSTOMER"
	
	// Clear ownership record
	ownershipKey := "ownership_" + productID
	err = ctx.GetStub().DelState(ownershipKey)
	if err != nil {
		return fmt.Errorf("failed to clear ownership record: %v", err)
	}
	
	// Save updated product
	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState(productID, productJSON)
	if err != nil {
		return err
	}
	
	// Update batch status if needed
	if product.BatchID != "" {
		batch, err := s.GetBatch(ctx, product.BatchID)
		if err == nil {
			// Check if any products from this batch are still sold
			stillSold := false
			for _, pid := range batch.ProductIDs {
				p, err := s.GetProduct(ctx, pid)
				if err == nil && p.Status == ProductStatusSold {
					stillSold = true
					break
				}
			}
			if !stillSold {
				batch.Status = BatchStatusAtRetailer
				batchJSON, _ := json.Marshal(batch)
				ctx.GetStub().PutState("batch_"+batch.ID, batchJSON)
			}
		}
	}
	
	// Emit event
	eventData := map[string]interface{}{
		"productID": productID,
		"reason":    reason,
		"retailer":  retailerMSPID,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	eventJSON, _ := json.Marshal(eventData)
	ctx.GetStub().SetEvent("CustomerReturnProcessed", eventJSON)
	
	return nil
}

// GetTransfersByProduct retrieves all transfers for a specific product
func (s *SupplyChainContract) GetTransfersByProduct(ctx contractapi.TransactionContextInterface,
	productID string) ([]*Transfer, error) {
	
	// Query all transfers
	resultsIterator, err := ctx.GetStub().GetStateByRange("transfer_", "transfer_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query transfers: %v", err)
	}
	defer resultsIterator.Close()
	
	var transfers []*Transfer
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var transfer Transfer
		err = json.Unmarshal(queryResponse.Value, &transfer)
		if err != nil {
			continue
		}
		
		// Check if this transfer involves the product
		if transfer.ProductID == productID {
			transfers = append(transfers, &transfer)
		}
		
		// Also check if it's a batch containing this product
		if transfer.Metadata != nil {
			if batchType, ok := transfer.Metadata["type"].(string); ok && batchType == "BATCH" {
				// Get the batch to check if it contains the product
				batch, err := s.GetBatch(ctx, transfer.ProductID)
				if err == nil {
					for _, pid := range batch.ProductIDs {
						if pid == productID {
							transfers = append(transfers, &transfer)
							break
						}
					}
				}
			}
		}
	}
	
	return transfers, nil
}

// GetPendingTransfers retrieves all pending transfers for an organization
func (s *SupplyChainContract) GetPendingTransfers(ctx contractapi.TransactionContextInterface,
	orgMSPID string) ([]*Transfer, error) {
	
	// Query all transfers
	resultsIterator, err := ctx.GetStub().GetStateByRange("transfer_", "transfer_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query transfers: %v", err)
	}
	defer resultsIterator.Close()
	
	var pendingTransfers []*Transfer
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var transfer Transfer
		err = json.Unmarshal(queryResponse.Value, &transfer)
		if err != nil {
			continue
		}
		
		// Check if transfer is pending and involves the organization
		if transfer.Status != TransferStatusCompleted && transfer.Status != TransferStatusCancelled {
			if transfer.From == orgMSPID || transfer.To == orgMSPID {
				// Skip return transfers from dispute resolutions - they should be handled separately
				if metadata, ok := transfer.Metadata["resolutionType"].(string); ok && metadata == "dispute_resolution" {
					continue
				}
				pendingTransfers = append(pendingTransfers, &transfer)
			}
		}
	}
	
	return pendingTransfers, nil
}

// GetDisputeReturnTransfers retrieves all pending return transfers from dispute resolutions
func (s *SupplyChainContract) GetDisputeReturnTransfers(ctx contractapi.TransactionContextInterface,
	orgMSPID string) ([]*Transfer, error) {
	
	// Query all transfers
	resultsIterator, err := ctx.GetStub().GetStateByRange("transfer_", "transfer_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query transfers: %v", err)
	}
	defer resultsIterator.Close()
	
	var returnTransfers []*Transfer
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var transfer Transfer
		err = json.Unmarshal(queryResponse.Value, &transfer)
		if err != nil {
			continue
		}
		
		// Check if this is a dispute return transfer
		if resolutionType, ok := transfer.Metadata["resolutionType"].(string); ok && resolutionType == "dispute_resolution" {
			// Check if transfer is pending and involves the organization
			if transfer.Status != TransferStatusCompleted && transfer.Status != TransferStatusCancelled {
				if transfer.From == orgMSPID || transfer.To == orgMSPID {
					returnTransfers = append(returnTransfers, &transfer)
				}
			}
		}
	}
	
	return returnTransfers, nil
}

// GetDashboardStats returns dashboard statistics for an organization
func (s *SupplyChainContract) GetDashboardStats(ctx contractapi.TransactionContextInterface,
	orgMSPID string) (map[string]interface{}, error) {
	
	stats := make(map[string]interface{})
	
	// Get organization role
	roleContract := &RoleManagementContract{}
	orgRole, _ := roleContract.GetOrganizationRole(ctx, orgMSPID)
	stats["organizationRole"] = string(orgRole)
	
	// Count products owned
	allProducts, _ := s.GetAllProducts(ctx)
	productCount := 0
	for _, product := range allProducts {
		if product.CurrentOwner == orgMSPID {
			productCount++
		}
	}
	stats["totalProducts"] = productCount
	
	// Count batches owned
	batches, _ := s.GetBatchesByOrganization(ctx, orgMSPID)
	stats["totalBatches"] = len(batches)
	
	// Count pending transfers
	pendingTransfers, _ := s.GetPendingTransfers(ctx, orgMSPID)
	stats["pendingTransfers"] = len(pendingTransfers)
	
	// Count materials (if applicable)
	if orgRole == RoleSupplier || orgRole == RoleManufacturer {
		inventories, _ := s.GetAllMaterialInventories(ctx)
		materialCount := 0
		totalAvailable := 0.0
		for _, inv := range inventories {
			if inv.Owner == orgMSPID {
				materialCount++
				totalAvailable += inv.Available
			}
		}
		stats["totalMaterials"] = materialCount
		stats["availableMaterialQuantity"] = totalAvailable
	}
	
	// Add timestamp
	stats["timestamp"] = time.Now().Format(time.RFC3339)
	
	return stats, nil
}