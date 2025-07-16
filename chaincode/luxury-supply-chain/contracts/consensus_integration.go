package contracts

import (
	"encoding/json"
	"fmt"

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
		"initiatedAt":  transfer.InitiatedAt.Format("2006-01-02T15:04:05Z"),
	}

	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}

	// Prepare arguments for consensus chaincode
	args := [][]byte{
		[]byte("SubmitTransaction"),
		[]byte(transfer.ID),
		[]byte(transfer.From),
		[]byte(transfer.To),
		[]byte("product_transfer"),
		[]byte(transfer.ProductID),
		metadataJSON,
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

// InitiateTransferWithConsensus creates a transfer and submits to 2-Check consensus
func (s *SupplyChainContract) InitiateTransferWithConsensus(ctx contractapi.TransactionContextInterface,
	transferID string, productID string, to string, transferType TransferType) error {

	// First create the transfer using the base method
	err := s.InitiateTransfer(ctx, transferID, productID, to, transferType)
	if err != nil {
		return err
	}

	// Get the created transfer
	transfer, err := s.GetTransfer(ctx, transferID)
	if err != nil {
		return err
	}

	// Submit to consensus chaincode
	consensus := NewConsensusIntegration("2check-consensus", "luxurychannel")
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
	consensus := NewConsensusIntegration("2check-consensus", "luxurychannel")
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
	consensus := NewConsensusIntegration("2check-consensus", "luxurychannel")
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
	consensus := NewConsensusIntegration("2check-consensus", "luxurychannel")
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

	consensus := NewConsensusIntegration("2check-consensus", "luxurychannel")
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