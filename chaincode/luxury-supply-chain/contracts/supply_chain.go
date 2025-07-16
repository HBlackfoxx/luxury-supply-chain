package contracts

import (
	"encoding/json"
	"fmt"
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
		CreatedAt:       time.Now(),
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

// AddMaterial adds material information to a product
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

	material := Material{
		ID:           materialID,
		Type:         materialType,
		Source:       source,
		Supplier:     supplier,
		Batch:        batch,
		Verification: verification,
		ReceivedDate: time.Now(),
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
		Date:      time.Now(),
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
	transferID string, productID string, to string, transferType TransferType) error {

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
		InitiatedAt:  time.Now(),
		Status:       TransferStatusInitiated,
		ConsensusDetails: ConsensusInfo{
			SenderConfirmed: false,
			ReceiverConfirmed: false,
			TimeoutAt: time.Now().Add(24 * time.Hour), // 24 hour timeout
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
	now := time.Now()
	transfer.ConsensusDetails.SenderConfirmed = true
	transfer.ConsensusDetails.SenderTimestamp = &now
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
	now := time.Now()
	transfer.ConsensusDetails.ReceiverConfirmed = true
	transfer.ConsensusDetails.ReceiverTimestamp = &now
	transfer.Status = TransferStatusCompleted
	transfer.CompletedAt = &now

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