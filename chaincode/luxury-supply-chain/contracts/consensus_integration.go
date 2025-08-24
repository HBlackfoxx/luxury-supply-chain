package contracts

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ConsensusIntegration provides methods to integrate with 2-Check consensus chaincode
type ConsensusIntegration struct {
	ConsensusChaincodeName string
	ChannelName           string
}

// NewConsensusIntegration creates a new consensus integration helper
func NewConsensusIntegration(chaincodeName string, channelName string) *ConsensusIntegration {
	return &ConsensusIntegration{
		ConsensusChaincodeName: chaincodeName,
		ChannelName:           channelName,
	}
}

// SubmitToConsensus submits a supply chain transfer to 2-Check consensus
func (ci *ConsensusIntegration) SubmitToConsensus(ctx contractapi.TransactionContextInterface,
	transfer *Transfer) error {

	// Prepare metadata for consensus transaction
	metadata := map[string]string{
		"transferId":   transfer.ID,
		"productId":    transfer.ProductID,
		"transferType": string(transfer.TransferType),
		"initiatedAt":  transfer.InitiatedAt,
	}
	
	// Add batch info if present
	if transfer.Metadata != nil {
		if batchType, ok := transfer.Metadata["type"].(string); ok && batchType == "BATCH" {
			if qty, ok := transfer.Metadata["quantity"].(int); ok {
				metadata["batchQuantity"] = fmt.Sprintf("%d", qty)
			}
			if prodType, ok := transfer.Metadata["productType"].(string); ok {
				metadata["productType"] = prodType
			}
		}
	}

	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	
	// Determine item type and quantity
	itemType := "PRODUCT"
	quantity := "1" // Default for single product
	
	if transfer.Metadata != nil {
		if batchType, ok := transfer.Metadata["type"].(string); ok && batchType == "BATCH" {
			itemType = "BATCH"
			if qty, ok := transfer.Metadata["quantity"].(int); ok {
				quantity = fmt.Sprintf("%d", qty)
			}
		}
	}

	// Prepare arguments for consensus chaincode (now includes quantity)
	args := [][]byte{
		[]byte("SubmitTransaction"),
		[]byte(transfer.ID),
		[]byte(transfer.From),
		[]byte(transfer.To),
		[]byte(itemType),
		[]byte(transfer.ProductID),
		[]byte(quantity), // Add quantity parameter
		[]byte(string(metadataJSON)),
	}

	// Invoke consensus chaincode
	response := ctx.GetStub().InvokeChaincode(ci.ConsensusChaincodeName, args, ci.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to submit to consensus: %s", response.Message)
	}

	return nil
}

// NotifyConsensusOfSent notifies consensus that sender confirmed sent
func (ci *ConsensusIntegration) NotifyConsensusOfSent(ctx contractapi.TransactionContextInterface,
	transferID string, sender string) error {

	args := [][]byte{
		[]byte("ConfirmSent"),
		[]byte(transferID),
		[]byte(sender),
	}

	response := ctx.GetStub().InvokeChaincode(ci.ConsensusChaincodeName, args, ci.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to confirm sent in consensus: %s", response.Message)
	}

	return nil
}

// NotifyConsensusOfReceived notifies consensus that receiver confirmed receipt
func (ci *ConsensusIntegration) NotifyConsensusOfReceived(ctx contractapi.TransactionContextInterface,
	transferID string, receiver string) error {

	args := [][]byte{
		[]byte("ConfirmReceived"),
		[]byte(transferID),
		[]byte(receiver),
	}

	response := ctx.GetStub().InvokeChaincode(ci.ConsensusChaincodeName, args, ci.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to confirm received in consensus: %s", response.Message)
	}

	return nil
}

// GetConsensusStatus retrieves the consensus status for a transfer
func (ci *ConsensusIntegration) GetConsensusStatus(ctx contractapi.TransactionContextInterface,
	transferID string) (map[string]interface{}, error) {

	args := [][]byte{
		[]byte("GetTransaction"),
		[]byte(transferID),
	}

	response := ctx.GetStub().InvokeChaincode(ci.ConsensusChaincodeName, args, ci.ChannelName)
	if response.Status != 200 {
		return nil, fmt.Errorf("failed to get consensus status: %s", response.Message)
	}

	var consensusTransaction map[string]interface{}
	err := json.Unmarshal(response.Payload, &consensusTransaction)
	if err != nil {
		return nil, err
	}

	return consensusTransaction, nil
}

// GetTrustScore retrieves trust score from consensus chaincode
func (ci *ConsensusIntegration) GetTrustScore(ctx contractapi.TransactionContextInterface,
	partyID string) (float64, error) {

	args := [][]byte{
		[]byte("GetTrustScore"),
		[]byte(partyID),
	}

	response := ctx.GetStub().InvokeChaincode(ci.ConsensusChaincodeName, args, ci.ChannelName)
	if response.Status != 200 {
		return 0, fmt.Errorf("failed to get trust score: %s", response.Message)
	}

	var trustScore struct {
		Score float64 `json:"score"`
	}
	err := json.Unmarshal(response.Payload, &trustScore)
	if err != nil {
		return 0, err
	}

	return trustScore.Score, nil
}

// Enhanced SupplyChainContract methods with consensus integration

// InitiateBatchTransferWithConsensus creates a batch transfer and submits to 2-Check consensus
func (s *SupplyChainContract) InitiateBatchTransferWithConsensus(ctx contractapi.TransactionContextInterface,
	transferID string, batchID string, to string) error {
	
	// First create the batch transfer
	err := s.TransferBatch(ctx, transferID, batchID, to)
	if err != nil {
		return err
	}
	
	// Get the created transfer
	transfer, err := s.GetTransfer(ctx, transferID)
	if err != nil {
		return err
	}
	
	// Submit to consensus chaincode
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	err = consensus.SubmitToConsensus(ctx, transfer)
	if err != nil {
		// Rollback transfer creation if consensus submission fails
		ctx.GetStub().DelState("transfer_" + transferID)
		return fmt.Errorf("failed to submit batch transfer to consensus: %v", err)
	}
	
	return nil
}

// InitiateTransferWithConsensus creates a transfer and submits to 2-Check consensus
func (s *SupplyChainContract) InitiateTransferWithConsensus(ctx contractapi.TransactionContextInterface,
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
		transferType = TransferTypeSupplyChain // Default to supply chain
	}

	// First create the transfer using the base method (convert back to string)
	err := s.InitiateTransfer(ctx, transferID, productID, to, string(transferType))
	if err != nil {
		return err
	}

	// Get the created transfer
	transfer, err := s.GetTransfer(ctx, transferID)
	if err != nil {
		return err
	}

	// Submit to consensus chaincode
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	err = consensus.SubmitToConsensus(ctx, transfer)
	if err != nil {
		// Rollback transfer creation if consensus submission fails
		ctx.GetStub().DelState("transfer_" + transferID)
		return fmt.Errorf("failed to submit to consensus: %v", err)
	}

	return nil
}

// ConfirmSentWithConsensus confirms sent and updates consensus
func (s *SupplyChainContract) ConfirmSentWithConsensus(ctx contractapi.TransactionContextInterface,
	transferID string) error {

	// Get sender identity
	sender, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}

	// First confirm in supply chain
	err = s.ConfirmSent(ctx, transferID)
	if err != nil {
		return err
	}

	// Then notify consensus
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	err = consensus.NotifyConsensusOfSent(ctx, transferID, sender)
	if err != nil {
		// Log error but don't rollback - consensus will handle timeout
		fmt.Printf("Warning: Failed to notify consensus of sent confirmation: %v\n", err)
	}

	return nil
}

// ConfirmReceivedWithConsensus confirms receipt and updates consensus
func (s *SupplyChainContract) ConfirmReceivedWithConsensus(ctx contractapi.TransactionContextInterface,
	transferID string) error {

	// Get receiver identity
	receiver, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}

	// First confirm in supply chain
	err = s.ConfirmReceived(ctx, transferID)
	if err != nil {
		return err
	}

	// Then notify consensus
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	err = consensus.NotifyConsensusOfReceived(ctx, transferID, receiver)
	if err != nil {
		// Log error but don't rollback
		fmt.Printf("Warning: Failed to notify consensus of receipt confirmation: %v\n", err)
	}

	return nil
}

// GetTransferWithConsensusStatus returns transfer with consensus status
func (s *SupplyChainContract) GetTransferWithConsensusStatus(ctx contractapi.TransactionContextInterface,
	transferID string) (map[string]interface{}, error) {

	// Get transfer from supply chain
	transfer, err := s.GetTransfer(ctx, transferID)
	if err != nil {
		return nil, err
	}

	// Get consensus status
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	consensusStatus, err := consensus.GetConsensusStatus(ctx, transferID)
	if err != nil {
		// Return transfer without consensus status if unavailable
		result := map[string]interface{}{
			"transfer":        transfer,
			"consensusStatus": "unavailable",
		}
		return result, nil
	}

	// Combine results
	result := map[string]interface{}{
		"transfer":        transfer,
		"consensusStatus": consensusStatus,
	}

	return result, nil
}

// GetPartyTrustScore retrieves trust score for a party
func (s *SupplyChainContract) GetPartyTrustScore(ctx contractapi.TransactionContextInterface,
	partyID string) (map[string]interface{}, error) {

	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	score, err := consensus.GetTrustScore(ctx, partyID)
	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"partyId":    partyID,
		"trustScore": score,
		"trusted":    score > 0.8,
	}

	return result, nil
}

// CreateReturnTransferAfterDispute creates a return/resend transfer after dispute resolution
func (s *SupplyChainContract) CreateReturnTransferAfterDispute(ctx contractapi.TransactionContextInterface,
	disputeID string) error {
	
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	
	// Get dispute resolution from consensus
	args := [][]byte{
		[]byte("GetDisputeResolution"),
		[]byte(disputeID),
	}
	
	response := ctx.GetStub().InvokeChaincode(consensus.ConsensusChaincodeName, args, consensus.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to get dispute resolution: %s", response.Message)
	}
	
	var resolution map[string]interface{}
	err := json.Unmarshal(response.Payload, &resolution)
	if err != nil {
		return err
	}
	
	// Check if action is already completed
	if actionCompleted, ok := resolution["actionCompleted"].(bool); ok && actionCompleted {
		return fmt.Errorf("return transfer already created for dispute %s", disputeID)
	}
	
	// Check if action is required
	requiredAction, ok := resolution["requiredAction"].(string)
	if !ok || requiredAction == "NONE" {
		return nil // No action needed
	}
	
	// Get transaction details
	transactionID := resolution["transactionId"].(string)
	winner := resolution["winner"].(string)
	actionQuantity := int(resolution["actionQuantity"].(float64))
	
	// Get the original transaction to get the itemId (materialId)
	args = [][]byte{
		[]byte("GetTransaction"),
		[]byte(transactionID),
	}
	
	response = ctx.GetStub().InvokeChaincode(consensus.ConsensusChaincodeName, args, consensus.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to get original transaction: %s", response.Message)
	}
	
	var originalTx map[string]interface{}
	err = json.Unmarshal(response.Payload, &originalTx)
	if err != nil {
		return err
	}
	
	// Get the itemId (materialId) from the original transaction
	itemId := ""
	if id, ok := originalTx["itemId"].(string); ok {
		itemId = id
	}
	
	// Create appropriate transfer based on required action
	var transferType TransferType
	var from, to string
	
	switch requiredAction {
	case "RETURN":
		transferType = TransferTypeReturn
		// Return goes from winner (who has the defective materials) back to loser
		from = winner  // Manufacturer sends back defective materials
		to = resolution["loser"].(string)  // Supplier receives them back
	case "RESEND", "REPLACE":
		transferType = TransferTypeSupplyChain
		// Resend/Replace goes from loser (supplier) to winner (manufacturer)
		from = resolution["loser"].(string)  // Supplier sends new materials
		to = winner  // Manufacturer receives replacement
	default:
		return fmt.Errorf("unknown required action: %s", requiredAction)
	}
	
	// Create new transfer ID
	transferID := fmt.Sprintf("%s-RESOLUTION-%d", transactionID, time.Now().Unix())
	
	// Create transfer with metadata about dispute
	currentTime := time.Now().Format(time.RFC3339)
	transfer := Transfer{
		ID:           transferID,
		ProductID:    itemId, // Use the actual materialId from original transaction
		From:         from,
		To:           to,
		TransferType: transferType,
		InitiatedAt:  currentTime,
		Status:       TransferStatusInitiated,
		ConsensusDetails: ConsensusInfo{
			SenderConfirmed:   false,
			ReceiverConfirmed: false,
			SenderTimestamp:   currentTime, // Set to current time as placeholder
			ReceiverTimestamp: currentTime, // Set to current time as placeholder
			TimeoutAt:         time.Now().Add(72 * time.Hour).Format(time.RFC3339),
		},
		CompletedAt: currentTime, // Set to current time as placeholder
		Metadata: map[string]interface{}{
			"disputeID":         disputeID,
			"requiredAction":    requiredAction,
			"quantity":          actionQuantity,
			"resolutionType":    "dispute_resolution",
			"originalTransactionId": transactionID, // Store original transaction ID
			"materialId":        itemId, // Also store materialId in metadata for easy access
		},
	}
	
	transferJSON, err := json.Marshal(transfer)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState("transfer_"+transferID, transferJSON)
	if err != nil {
		return err
	}
	
	// Submit to consensus
	err = consensus.SubmitToConsensus(ctx, &transfer)
	if err != nil {
		return err
	}
	
	// Mark action as completed in consensus
	args = [][]byte{
		[]byte("MarkActionCompleted"),
		[]byte(disputeID),
		[]byte(transferID),
	}
	
	response = ctx.GetStub().InvokeChaincode(consensus.ConsensusChaincodeName, args, consensus.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to mark action completed: %s", response.Message)
	}
	
	return nil
}

// SubmitMaterialTransferToConsensus submits material transfers to consensus
func (s *SupplyChainContract) SubmitMaterialTransferToConsensus(ctx contractapi.TransactionContextInterface,
	transferID string, materialID string, from string, to string, quantity float64) error {
	
	consensus := NewConsensusIntegration("2check-consensus", "luxury-supply-chain")
	
	// Create metadata for the transfer
	metadata := map[string]string{
		"type":       "MATERIAL",
		"materialId": materialID,
		"quantity":   fmt.Sprintf("%.2f", quantity),
	}
	
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	
	// Submit to consensus
	args := [][]byte{
		[]byte("SubmitTransaction"),
		[]byte(transferID),
		[]byte(from),
		[]byte(to),
		[]byte("MATERIAL"),
		[]byte(materialID),
		[]byte(fmt.Sprintf("%.0f", quantity)), // Convert to int string for consensus
		[]byte(string(metadataJSON)),
	}
	
	response := ctx.GetStub().InvokeChaincode(consensus.ConsensusChaincodeName, args, consensus.ChannelName)
	if response.Status != 200 {
		return fmt.Errorf("failed to submit material transfer to consensus: %s", response.Message)
	}
	
	return nil
}