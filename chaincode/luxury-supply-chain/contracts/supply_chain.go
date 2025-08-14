package contracts

import (
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

// InitLedger initializes the ledger with sample data (for testing)
func (s *SupplyChainContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	// This is optional, for demo purposes
	return nil
}

// CreateProduct creates a new luxury product in the supply chain
func (s *SupplyChainContract) CreateProduct(ctx contractapi.TransactionContextInterface,
	id string, brand string, name string, productType string, serialNumber string) error {

	// Check if product already exists
	exists, err := s.ProductExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("product %s already exists", id)
	}

	// Get creator's MSP ID
	creator, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get creator identity: %v", err)
	}

	product := Product{
		ID:              id,
		Brand:           brand,
		Name:            name,
		Type:            productType,
		SerialNumber:    serialNumber,
		CreatedAt:       time.Now().Format(time.RFC3339),
		CurrentOwner:    creator,
		CurrentLocation: creator,
		Status:          ProductStatusCreated,
		Materials:       []Material{},
		QualityCheckpoints: []QualityCheckpoint{},
		Metadata:        make(map[string]interface{}),
	}

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, productJSON)
}

// AddMaterial adds material information to a product WITH VALIDATION
func (s *SupplyChainContract) AddMaterial(ctx contractapi.TransactionContextInterface,
	productID string, materialID string, materialType string, source string, 
	supplier string, batch string, verification string) error {

	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return err
	}

	// Only allow material addition in created or in-production status
	if product.Status != ProductStatusCreated && product.Status != ProductStatusInProduction {
		return fmt.Errorf("cannot add materials to product in status: %s", product.Status)
	}

	// Get manufacturer identity
	manufacturer, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get manufacturer identity: %v", err)
	}

	// Verify manufacturer owns the product
	if product.CurrentOwner != manufacturer {
		return fmt.Errorf("only the product owner can add materials")
	}

	// CRITICAL: Verify material inventory exists and is owned by manufacturer
	inventoryKey := fmt.Sprintf("material_inventory_%s_%s", materialID, manufacturer)
	inventoryJSON, err := ctx.GetStub().GetState(inventoryKey)
	if err != nil {
		return fmt.Errorf("failed to read material inventory: %v", err)
	}
	if inventoryJSON == nil {
		return fmt.Errorf("material %s not found in %s's inventory - material must be properly transferred first", materialID, manufacturer)
	}

	var inventory MaterialInventory
	err = json.Unmarshal(inventoryJSON, &inventory)
	if err != nil {
		return err
	}

	// Check if material is available
	if inventory.Available <= 0 {
		return fmt.Errorf("insufficient material %s in inventory: available=%.2f", materialID, inventory.Available)
	}

	// Deduct from inventory (assuming 1 unit used, could be parameterized)
	usageAmount := 1.0
	if inventory.Available < usageAmount {
		return fmt.Errorf("insufficient material %s: need %.2f, have %.2f", materialID, usageAmount, inventory.Available)
	}

	inventory.Available -= usageAmount
	inventory.Used += usageAmount

	// Update inventory
	updatedInventoryJSON, err := json.Marshal(inventory)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState(inventoryKey, updatedInventoryJSON)
	if err != nil {
		return err
	}

	// Add material to product with verified supplier
	material := Material{
		ID:           materialID,
		Type:         materialType,
		Source:       source,
		Supplier:     inventory.Supplier, // Use verified supplier from inventory
		Batch:        batch,
		Verification: "verified_from_inventory",
		ReceivedDate: time.Now().Format(time.RFC3339),
	}

	product.Materials = append(product.Materials, material)

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(productID, productJSON)
}

// AddQualityCheckpoint records quality verification
func (s *SupplyChainContract) AddQualityCheckpoint(ctx contractapi.TransactionContextInterface,
	productID string, checkpointID string, stage string, passed bool, details string) error {

	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return err
	}

	// Get inspector identity
	inspector, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get inspector identity: %v", err)
	}

	checkpoint := QualityCheckpoint{
		ID:        checkpointID,
		Stage:     stage,
		Inspector: inspector,
		Date:      time.Now().Format(time.RFC3339),
		Passed:    passed,
		Details:   details,
	}

	product.QualityCheckpoints = append(product.QualityCheckpoints, checkpoint)

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(productID, productJSON)
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
		Status:       TransferStatusInitiated,
		ConsensusDetails: ConsensusInfo{
			SenderConfirmed: false,
			ReceiverConfirmed: false,
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

	// Update product ownership
	product, err := s.GetProduct(ctx, transfer.ProductID)
	if err != nil {
		return err
	}

	product.CurrentOwner = transfer.To
	product.CurrentLocation = transfer.To

	// Update product status based on transfer type
	if transfer.To == product.Brand {
		product.Status = ProductStatusInStore
	} else {
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

// TransferMaterialInventory transfers material from one organization to another
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

	return ctx.GetStub().PutState(receiverInventoryKey, updatedReceiverJSON)
}

// ConfirmMaterialReceived confirms material receipt and updates inventory
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

		// Verify it's actually a product by checking required fields
		if product.ID != "" && product.Brand != "" {
			products = append(products, &product)
		}
	}

	return products, nil
}