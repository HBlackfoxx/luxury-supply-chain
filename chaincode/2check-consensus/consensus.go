package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ConsensusContract provides 2-Check consensus functionality
type ConsensusContract struct {
	contractapi.Contract
}

// TransactionState represents the state of a transaction
type TransactionState string

const (
	StateInitiated TransactionState = "INITIATED"
	StateSent      TransactionState = "SENT"
	StateReceived  TransactionState = "RECEIVED"
	StateValidated TransactionState = "VALIDATED"
	StateDisputed  TransactionState = "DISPUTED"
	StateTimeout   TransactionState = "TIMEOUT"
)

// Transaction represents a supply chain transaction
type Transaction struct {
	ID              string           `json:"id"`
	Sender          string           `json:"sender"`
	Receiver        string           `json:"receiver"`
	State           TransactionState `json:"state"`
	ItemType        string           `json:"itemType"`
	ItemID          string           `json:"itemId"`
	Timestamp       string           `json:"timestamp"`
	SentTimestamp   string           `json:"sentTimestamp,omitempty"`
	ReceivedTimestamp string         `json:"receivedTimestamp,omitempty"`
	Metadata        map[string]string `json:"metadata"`
	DisputeReason   string           `json:"disputeReason,omitempty"`
	Evidence        []Evidence       `json:"evidence,omitempty"`
}

// Evidence represents proof submitted for a transaction
type Evidence struct {
	Type        string    `json:"type"`
	SubmittedBy string    `json:"submittedBy"`
	Timestamp   string    `json:"timestamp"`
	Hash        string    `json:"hash"`
	Verified    bool      `json:"verified"`
}

// TrustScore represents the trust score of a participant
type TrustScore struct {
	PartyID          string    `json:"partyId"`
	Score            float64   `json:"score"`
	TotalTransactions int      `json:"totalTransactions"`
	SuccessfulTx     int       `json:"successfulTransactions"`
	DisputedTx       int       `json:"disputedTransactions"`
	LastUpdated      string `json:"lastUpdated"`
}

// ConsensusEvent represents an event in the consensus process
type ConsensusEvent struct {
	TransactionID string                 `json:"transactionId"`
	EventType     string                 `json:"eventType"`
	Timestamp     string              `json:"timestamp"`
	Payload       map[string]interface{} `json:"payload"`
}

// InitLedger initializes the chaincode
func (c *ConsensusContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	// Initialize default trust scores for known parties
	defaultParties := []string{"luxebags", "italianleather", "craftworkshop", "luxuryretail"}
	
	for _, party := range defaultParties {
		trustScore := TrustScore{
			PartyID:          party,
			Score:            0.5, // Start with neutral score
			TotalTransactions: 0,
			SuccessfulTx:     0,
			DisputedTx:       0,
			LastUpdated:      time.Now().Format(time.RFC3339),
		}
		
		scoreJSON, err := json.Marshal(trustScore)
		if err != nil {
			return err
		}
		
		err = ctx.GetStub().PutState("TRUST_"+party, scoreJSON)
		if err != nil {
			return fmt.Errorf("failed to initialize trust score for %s: %v", party, err)
		}
	}
	
	return nil
}

// SubmitTransaction creates a new transaction in the system
func (c *ConsensusContract) SubmitTransaction(ctx contractapi.TransactionContextInterface, 
	id string, sender string, receiver string, itemType string, itemID string, metadata string) error {
	
	// Check if transaction already exists
	existing, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("failed to read transaction: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("transaction %s already exists", id)
	}
	
	// Parse metadata
	var metadataMap map[string]string
	if metadata != "" {
		err = json.Unmarshal([]byte(metadata), &metadataMap)
		if err != nil {
			return fmt.Errorf("invalid metadata format: %v", err)
		}
	}
	
	// Create transaction
	tx := Transaction{
		ID:        id,
		Sender:    sender,
		Receiver:  receiver,
		State:     StateInitiated,
		ItemType:  itemType,
		ItemID:    itemID,
		Timestamp: time.Now().Format(time.RFC3339),
		Metadata:  metadataMap,
	}
	
	txJSON, err := json.Marshal(tx)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState(id, txJSON)
	if err != nil {
		return fmt.Errorf("failed to create transaction: %v", err)
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: id,
		EventType:     "TRANSACTION_INITIATED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"sender":   sender,
			"receiver": receiver,
			"itemType": itemType,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// ConfirmSent marks a transaction as sent by the sender
func (c *ConsensusContract) ConfirmSent(ctx contractapi.TransactionContextInterface, 
	transactionID string, sender string) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Validate sender
	if tx.Sender != sender {
		return fmt.Errorf("unauthorized: only sender can confirm sent")
	}
	
	// Validate state
	if tx.State != StateInitiated {
		return fmt.Errorf("invalid state transition: cannot confirm sent from state %s", tx.State)
	}
	
	// Check trust score for auto-confirmation
	trustScore, err := c.getTrustScore(ctx, sender)
	if err == nil && trustScore.Score > 0.95 {
		// High trust - can auto-confirm
		return c.autoConfirmTransaction(ctx, tx, "high_trust_sender")
	}
	
	// Update transaction
	now := time.Now().Format(time.RFC3339)
	tx.State = StateSent
	tx.SentTimestamp = now
	
	err = c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: transactionID,
		EventType:     "CONFIRMATION_SENT",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"sender": sender,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// ConfirmReceived marks a transaction as received by the receiver
func (c *ConsensusContract) ConfirmReceived(ctx contractapi.TransactionContextInterface, 
	transactionID string, receiver string) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Validate receiver
	if tx.Receiver != receiver {
		return fmt.Errorf("unauthorized: only receiver can confirm receipt")
	}
	
	// Validate state
	if tx.State != StateSent {
		return fmt.Errorf("invalid state transition: cannot confirm received from state %s", tx.State)
	}
	
	// Update transaction
	now := time.Now().Format(time.RFC3339)
	tx.State = StateReceived
	tx.ReceivedTimestamp = now
	
	err = c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Validate consensus (both parties confirmed)
	err = c.validateConsensus(ctx, tx)
	if err != nil {
		return err
	}
	
	// Update trust scores
	err = c.updateTrustScores(ctx, tx, true)
	if err != nil {
		return fmt.Errorf("failed to update trust scores: %v", err)
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: transactionID,
		EventType:     "CONFIRMATION_RECEIVED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"receiver": receiver,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// RaiseDispute creates a dispute for a transaction
func (c *ConsensusContract) RaiseDispute(ctx contractapi.TransactionContextInterface, 
	transactionID string, initiator string, reason string) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Validate initiator is party to transaction
	if tx.Sender != initiator && tx.Receiver != initiator {
		return fmt.Errorf("unauthorized: only transaction parties can raise disputes")
	}
	
	// Cannot dispute already validated transactions
	if tx.State == StateValidated {
		return fmt.Errorf("cannot dispute validated transaction")
	}
	
	// Update transaction
	tx.State = StateDisputed
	tx.DisputeReason = reason
	
	err = c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Update trust scores negatively
	err = c.updateTrustScores(ctx, tx, false)
	if err != nil {
		return fmt.Errorf("failed to update trust scores: %v", err)
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: transactionID,
		EventType:     "DISPUTE_RAISED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"initiator": initiator,
			"reason":    reason,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// SubmitEvidence adds evidence to a disputed transaction
func (c *ConsensusContract) SubmitEvidence(ctx contractapi.TransactionContextInterface,
	transactionID string, evidenceType string, submittedBy string, hash string) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Only allow evidence for disputed transactions
	if tx.State != StateDisputed {
		return fmt.Errorf("evidence can only be submitted for disputed transactions")
	}
	
	// Create evidence record
	evidence := Evidence{
		Type:        evidenceType,
		SubmittedBy: submittedBy,
		Timestamp:   time.Now().Format(time.RFC3339),
		Hash:        hash,
		Verified:    false, // Would be verified by off-chain process
	}
	
	tx.Evidence = append(tx.Evidence, evidence)
	
	err = c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: transactionID,
		EventType:     "EVIDENCE_SUBMITTED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"type":        evidenceType,
			"submittedBy": submittedBy,
			"hash":        hash,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// GetTransaction retrieves a transaction by ID
func (c *ConsensusContract) GetTransaction(ctx contractapi.TransactionContextInterface, 
	transactionID string) (*Transaction, error) {
	
	return c.getTransaction(ctx, transactionID)
}

// GetTransactionHistory retrieves the history of a transaction
func (c *ConsensusContract) GetTransactionHistory(ctx contractapi.TransactionContextInterface,
	transactionID string) ([]map[string]interface{}, error) {
	
	resultsIterator, err := ctx.GetStub().GetHistoryForKey(transactionID)
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
		
		var tx Transaction
		err = json.Unmarshal(response.Value, &tx)
		if err != nil {
			return nil, err
		}
		
		record := map[string]interface{}{
			"txId":      response.TxId,
			"timestamp": response.Timestamp,
			"isDelete":  response.IsDelete,
			"value":     tx,
		}
		
		history = append(history, record)
	}
	
	return history, nil
}

// GetTrustScore retrieves the trust score for a party
func (c *ConsensusContract) GetTrustScore(ctx contractapi.TransactionContextInterface,
	partyID string) (*TrustScore, error) {
	
	return c.getTrustScore(ctx, partyID)
}

// Helper functions

func (c *ConsensusContract) getTransaction(ctx contractapi.TransactionContextInterface,
	transactionID string) (*Transaction, error) {
	
	txJSON, err := ctx.GetStub().GetState(transactionID)
	if err != nil {
		return nil, fmt.Errorf("failed to read transaction: %v", err)
	}
	if txJSON == nil {
		return nil, fmt.Errorf("transaction %s does not exist", transactionID)
	}
	
	var tx Transaction
	err = json.Unmarshal(txJSON, &tx)
	if err != nil {
		return nil, err
	}
	
	return &tx, nil
}

func (c *ConsensusContract) putTransaction(ctx contractapi.TransactionContextInterface,
	tx *Transaction) error {
	
	txJSON, err := json.Marshal(tx)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState(tx.ID, txJSON)
}

func (c *ConsensusContract) validateConsensus(ctx contractapi.TransactionContextInterface,
	tx *Transaction) error {
	
	// Both parties have confirmed - validate transaction
	tx.State = StateValidated
	
	err := c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Emit consensus achieved event
	event := ConsensusEvent{
		TransactionID: tx.ID,
		EventType:     "CONSENSUS_ACHIEVED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"sender":   tx.Sender,
			"receiver": tx.Receiver,
		},
	}
	
	return c.emitEvent(ctx, event)
}

func (c *ConsensusContract) autoConfirmTransaction(ctx contractapi.TransactionContextInterface,
	tx *Transaction, reason string) error {
	
	// Auto-confirm based on high trust
	now := time.Now().Format(time.RFC3339)
	tx.State = StateValidated
	tx.SentTimestamp = now
	tx.ReceivedTimestamp = now
	
	err := c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Emit auto-confirmation event
	event := ConsensusEvent{
		TransactionID: tx.ID,
		EventType:     "AUTO_CONFIRMATION",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"reason": reason,
			"party":  tx.Sender,
		},
	}
	
	return c.emitEvent(ctx, event)
}

func (c *ConsensusContract) getTrustScore(ctx contractapi.TransactionContextInterface,
	partyID string) (*TrustScore, error) {
	
	scoreJSON, err := ctx.GetStub().GetState("TRUST_" + partyID)
	if err != nil {
		return nil, fmt.Errorf("failed to read trust score: %v", err)
	}
	
	if scoreJSON == nil {
		// Initialize new trust score
		score := &TrustScore{
			PartyID:          partyID,
			Score:            0.5,
			TotalTransactions: 0,
			SuccessfulTx:     0,
			DisputedTx:       0,
			LastUpdated:      time.Now().Format(time.RFC3339),
		}
		return score, nil
	}
	
	var score TrustScore
	err = json.Unmarshal(scoreJSON, &score)
	if err != nil {
		return nil, err
	}
	
	return &score, nil
}

func (c *ConsensusContract) updateTrustScores(ctx contractapi.TransactionContextInterface,
	tx *Transaction, success bool) error {
	
	// Update sender's trust score
	senderScore, err := c.getTrustScore(ctx, tx.Sender)
	if err != nil {
		return err
	}
	
	senderScore.TotalTransactions++
	if success {
		senderScore.SuccessfulTx++
		senderScore.Score = float64(senderScore.SuccessfulTx) / float64(senderScore.TotalTransactions)
	} else {
		senderScore.DisputedTx++
		senderScore.Score = float64(senderScore.SuccessfulTx) / float64(senderScore.TotalTransactions)
	}
	senderScore.LastUpdated = time.Now().Format(time.RFC3339)
	
	senderJSON, err := json.Marshal(senderScore)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState("TRUST_"+tx.Sender, senderJSON)
	if err != nil {
		return err
	}
	
	// Update receiver's trust score
	receiverScore, err := c.getTrustScore(ctx, tx.Receiver)
	if err != nil {
		return err
	}
	
	receiverScore.TotalTransactions++
	if success {
		receiverScore.SuccessfulTx++
		receiverScore.Score = float64(receiverScore.SuccessfulTx) / float64(receiverScore.TotalTransactions)
	} else {
		receiverScore.DisputedTx++
		receiverScore.Score = float64(receiverScore.SuccessfulTx) / float64(receiverScore.TotalTransactions)
	}
	receiverScore.LastUpdated = time.Now().Format(time.RFC3339)
	
	receiverJSON, err := json.Marshal(receiverScore)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState("TRUST_"+tx.Receiver, receiverJSON)
}

func (c *ConsensusContract) emitEvent(ctx contractapi.TransactionContextInterface,
	event ConsensusEvent) error {
	
	eventJSON, err := json.Marshal(event)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().SetEvent("ConsensusEvent", eventJSON)
}

