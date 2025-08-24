package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
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
	ItemType        string           `json:"itemType"` // MATERIAL or PRODUCT
	ItemID          string           `json:"itemId"`
	Quantity        int              `json:"quantity"` // Amount being transferred
	Timestamp       string           `json:"timestamp"`
	SentTimestamp   string           `json:"sentTimestamp"`
	ReceivedTimestamp string         `json:"receivedTimestamp"`
	Metadata        map[string]string `json:"metadata"`
	DisputeReason   string           `json:"disputeReason"`
	Evidence        []Evidence       `json:"evidence"`
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
	id string, sender string, receiver string, itemType string, itemID string, quantity int, metadata string) error {
	
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
	} else {
		metadataMap = make(map[string]string)
	}
	
	// Create transaction
	// Use "N/A" as placeholder for fields to satisfy schema validation
	// Create placeholder evidence to avoid empty array issues
	placeholderEvidence := []Evidence{
		{
			Type:        "N/A",
			SubmittedBy: "N/A",
			Timestamp:   "N/A",
			Hash:        "N/A",
			Verified:    false,
		},
	}
	tx := Transaction{
		ID:        id,
		Sender:    sender,
		Receiver:  receiver,
		State:     StateInitiated,
		ItemType:  itemType,
		ItemID:    itemID,
		Quantity:  quantity,
		Timestamp: time.Now().Format(time.RFC3339),
		SentTimestamp: "N/A",
		ReceivedTimestamp: "N/A",
		Metadata:  metadataMap,
		DisputeReason: "N/A",  // Use N/A as placeholder
		Evidence: placeholderEvidence,  // Placeholder evidence
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

// DisputeReason represents valid dispute reasons
type DisputeReason string

const (
	DisputeNotReceived      DisputeReason = "NOT_RECEIVED"
	DisputeWrongItem        DisputeReason = "WRONG_ITEM"  
	DisputeDefective        DisputeReason = "DEFECTIVE"
	DisputeQuantityMismatch DisputeReason = "QUANTITY_MISMATCH"
	DisputeNotSent          DisputeReason = "NOT_SENT"
	DisputeNotConfirming    DisputeReason = "NOT_CONFIRMING" // Receiver won't confirm receipt
)

// DisputeResolution represents the outcome of a dispute
type DisputeResolution struct {
	DisputeID        string `json:"disputeId"`
	TransactionID    string `json:"transactionId"`
	Decision         string `json:"decision"` // IN_FAVOR_SENDER, IN_FAVOR_RECEIVER
	Winner           string `json:"winner"`
	Loser            string `json:"loser"`
	RequiredAction   string `json:"requiredAction"` // RETURN, RESEND, REPLACE, NONE
	ActionQuantity   int    `json:"actionQuantity"`
	ActionDeadline   string `json:"actionDeadline"`
	Resolver         string `json:"resolver"`
	ResolvedAt       string `json:"resolvedAt"`
	Notes            string `json:"notes"`
	ActionCompleted  bool   `json:"actionCompleted"`
	FollowUpTxID     string `json:"followUpTxId"` // ID of return/resend transaction
}

// RaiseDispute creates a dispute for a transaction with requested return quantity
func (c *ConsensusContract) RaiseDispute(ctx contractapi.TransactionContextInterface, 
	transactionID string, initiator string, reason string, requestedReturnQuantity int) error {
	
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
	
	// Check if already disputed
	if tx.State == StateDisputed {
		return fmt.Errorf("transaction already disputed")
	}
	
	// Update transaction
	tx.State = StateDisputed
	tx.DisputeReason = reason
	
	// Generate dispute ID
	disputeID := fmt.Sprintf("DISPUTE-%s-%d", transactionID, time.Now().Unix())
	
	// Store dispute details in metadata
	if tx.Metadata == nil {
		tx.Metadata = make(map[string]string)
	}
	tx.Metadata["disputeID"] = disputeID
	tx.Metadata["requestedReturnQuantity"] = fmt.Sprintf("%d", requestedReturnQuantity)
	tx.Metadata["disputeInitiator"] = initiator
	tx.Metadata["disputeStatus"] = "PENDING_RESPONSE"
	tx.Metadata["disputeTimestamp"] = time.Now().Format(time.RFC3339)
	tx.Metadata["disputeType"] = reason // Store the dispute type (NOT_RECEIVED, DEFECTIVE, etc.)
	
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

// AcceptDispute allows the counter-party to accept the dispute
func (c *ConsensusContract) AcceptDispute(ctx contractapi.TransactionContextInterface,
	transactionID string, acceptor string, agreedActionQuantity int) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Check if transaction is disputed
	if tx.State != StateDisputed {
		return fmt.Errorf("transaction is not in disputed state")
	}
	
	// Verify acceptor is the counter-party (not the dispute initiator)
	disputeInitiator := tx.Metadata["disputeInitiator"]
	if disputeInitiator == "" {
		return fmt.Errorf("dispute initiator not found")
	}
	
	// Acceptor must be the other party
	if acceptor == disputeInitiator {
		return fmt.Errorf("dispute initiator cannot accept their own dispute")
	}
	if acceptor != tx.Sender && acceptor != tx.Receiver {
		return fmt.Errorf("only transaction parties can accept disputes")
	}
	
	// Determine resolution details
	var winner, loser, requiredAction string
	var decision string
	
	if disputeInitiator == tx.Sender {
		// Sender disputed, receiver accepts
		winner = tx.Sender
		loser = tx.Receiver
		decision = "IN_FAVOR_SENDER"
		
		// Determine action based on dispute reason
		if tx.DisputeReason == string(DisputeNotConfirming) {
			requiredAction = "NONE" // Receiver admits receipt, transaction validated
		} else {
			requiredAction = "RETURN" // Receiver returns items to sender
		}
	} else {
		// Receiver disputed, sender accepts
		winner = tx.Receiver
		loser = tx.Sender
		decision = "IN_FAVOR_RECEIVER"
		
		// Determine action based on dispute reason
		switch tx.DisputeReason {
		case string(DisputeNotReceived), string(DisputeNotSent):
			requiredAction = "RESEND" // Sender must resend items
		case string(DisputeWrongItem):
			requiredAction = "REPLACE" // Return wrong items, send correct ones
		case string(DisputeDefective):
			requiredAction = "RETURN" // First return defective items, then supplier can resend
		case string(DisputeQuantityMismatch):
			requiredAction = "RESEND_PARTIAL" // Send missing quantity
		default:
			requiredAction = "RESEND"
		}
	}
	
	// Create resolution record
	resolution := DisputeResolution{
		DisputeID:       tx.Metadata["disputeID"],
		TransactionID:   transactionID,
		Decision:        decision,
		Winner:          winner,
		Loser:           loser,
		RequiredAction:  requiredAction,
		ActionQuantity:  agreedActionQuantity,
		ActionDeadline:  time.Now().Add(72 * time.Hour).Format(time.RFC3339), // 72 hours to complete action
		Resolver:        acceptor,
		ResolvedAt:      time.Now().Format(time.RFC3339),
		Notes:           fmt.Sprintf("Dispute accepted by %s", acceptor),
		ActionCompleted: false,
		FollowUpTxID:    "",
	}
	
	// Store resolution
	resolutionJSON, err := json.Marshal(resolution)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState("resolution_"+tx.Metadata["disputeID"], resolutionJSON)
	if err != nil {
		return err
	}
	
	// Update transaction status
	tx.State = StateValidated // Mark as resolved
	tx.Metadata["disputeStatus"] = "RESOLVED_ACCEPTED"
	tx.Metadata["resolutionID"] = resolution.DisputeID
	tx.Metadata["requiredAction"] = requiredAction
	tx.Metadata["actionQuantity"] = fmt.Sprintf("%d", agreedActionQuantity)
	
	err = c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: transactionID,
		EventType:     "DISPUTE_ACCEPTED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"acceptedBy":     acceptor,
			"winner":         winner,
			"requiredAction": requiredAction,
			"actionQuantity": agreedActionQuantity,
			"deadline":       resolution.ActionDeadline,
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
	
	// Append evidence
	// Check if we only have placeholder evidence and replace it
	if len(tx.Evidence) == 1 && tx.Evidence[0].Type == "N/A" {
		tx.Evidence = []Evidence{evidence}
	} else {
		tx.Evidence = append(tx.Evidence, evidence)
	}
	
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

// ResolveDispute resolves a disputed transaction by an arbitrator
// Only called if dispute is not accepted by counter-party
func (c *ConsensusContract) ResolveDispute(ctx contractapi.TransactionContextInterface,
	transactionID string, resolver string, decision string, notes string, actionQuantity int) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Check if transaction is disputed
	if tx.State != StateDisputed {
		return fmt.Errorf("transaction is not in disputed state")
	}
	
	// Check if already resolved
	if tx.Metadata["disputeStatus"] == "RESOLVED_ACCEPTED" || tx.Metadata["disputeStatus"] == "RESOLVED_ARBITRATED" {
		return fmt.Errorf("dispute already resolved")
	}
	
	// Authorization: only neutral parties or brand owner can arbitrate
	isInvolvedParty := (resolver == tx.Sender || resolver == tx.Receiver)
	if isInvolvedParty && resolver != "luxebags" {
		return fmt.Errorf("involved parties cannot arbitrate unless they are the brand owner")
	}
	
	// Determine winner, loser, and required action
	var winner, loser, requiredAction string
	disputeInitiator := tx.Metadata["disputeInitiator"]
	
	if decision == "IN_FAVOR_SENDER" {
		winner = tx.Sender
		loser = tx.Receiver
		
		// Determine action based on dispute reason
		if disputeInitiator == tx.Sender {
			// Sender was complaining, they won
			if tx.DisputeReason == string(DisputeNotConfirming) {
				requiredAction = "NONE" // Transaction validated
			} else {
				requiredAction = "RETURN" // Receiver must return
			}
		} else {
			// Receiver was complaining but sender won
			requiredAction = "NONE" // Receiver's complaint rejected
		}
	} else if decision == "IN_FAVOR_RECEIVER" {
		winner = tx.Receiver
		loser = tx.Sender
		
		// Determine action based on dispute reason
		if disputeInitiator == tx.Receiver {
			// Receiver was complaining, they won
			switch tx.DisputeReason {
			case string(DisputeNotReceived), string(DisputeNotSent):
				requiredAction = "RESEND"
			case string(DisputeWrongItem), string(DisputeDefective):
				requiredAction = "REPLACE"
			case string(DisputeQuantityMismatch):
				requiredAction = "RESEND_PARTIAL"
			default:
				requiredAction = "RESEND"
			}
		} else {
			// Sender was complaining but receiver won
			requiredAction = "NONE" // Sender's complaint rejected
		}
	} else if decision == "PARTIAL" {
		// Split decision - both partially at fault
		if disputeInitiator == tx.Sender {
			winner = "PARTIAL"
			loser = "PARTIAL"
			requiredAction = "PARTIAL_RETURN"
		} else {
			winner = "PARTIAL"
			loser = "PARTIAL"
			requiredAction = "PARTIAL_RESEND"
		}
	}
	
	// Create resolution record
	resolution := DisputeResolution{
		DisputeID:       tx.Metadata["disputeID"],
		TransactionID:   transactionID,
		Decision:        decision,
		Winner:          winner,
		Loser:           loser,
		RequiredAction:  requiredAction,
		ActionQuantity:  actionQuantity,
		ActionDeadline:  time.Now().Add(72 * time.Hour).Format(time.RFC3339),
		Resolver:        resolver,
		ResolvedAt:      time.Now().Format(time.RFC3339),
		Notes:           notes,
		ActionCompleted: false,
		FollowUpTxID:    "",
	}
	
	// Store resolution
	resolutionJSON, err := json.Marshal(resolution)
	if err != nil {
		return err
	}
	err = ctx.GetStub().PutState("resolution_"+tx.Metadata["disputeID"], resolutionJSON)
	if err != nil {
		return err
	}
	
	// Update transaction
	tx.State = StateValidated
	tx.Metadata["disputeStatus"] = "RESOLVED_ARBITRATED"
	tx.Metadata["resolutionID"] = resolution.DisputeID
	tx.Metadata["requiredAction"] = requiredAction
	tx.Metadata["actionQuantity"] = fmt.Sprintf("%d", actionQuantity)
	tx.Metadata["winner"] = winner
	
	err = c.putTransaction(ctx, tx)
	if err != nil {
		return err
	}
	
	// Update trust scores
	if decision == "IN_FAVOR_SENDER" {
		err = c.updateTrustScores(ctx, tx, true)
	} else if decision == "IN_FAVOR_RECEIVER" {
		tx.Sender, tx.Receiver = tx.Receiver, tx.Sender
		err = c.updateTrustScores(ctx, tx, true)
	}
	
	if err != nil {
		return fmt.Errorf("failed to update trust scores: %v", err)
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: transactionID,
		EventType:     "DISPUTE_RESOLVED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"decision":       decision,
			"resolver":       resolver,
			"winner":         winner,
			"requiredAction": requiredAction,
			"actionQuantity": actionQuantity,
			"deadline":       resolution.ActionDeadline,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// GetDisputeResolution retrieves a dispute resolution by dispute ID
func (c *ConsensusContract) GetDisputeResolution(ctx contractapi.TransactionContextInterface,
	disputeID string) (*DisputeResolution, error) {
	
	resolutionJSON, err := ctx.GetStub().GetState("resolution_" + disputeID)
	if err != nil {
		return nil, fmt.Errorf("failed to read resolution: %v", err)
	}
	if resolutionJSON == nil {
		return nil, fmt.Errorf("resolution %s does not exist", disputeID)
	}
	
	var resolution DisputeResolution
	err = json.Unmarshal(resolutionJSON, &resolution)
	if err != nil {
		return nil, err
	}
	
	return &resolution, nil
}

// GetPendingActions returns all dispute resolutions with pending actions
func (c *ConsensusContract) GetPendingActions(ctx contractapi.TransactionContextInterface,
	partyID string) ([]*DisputeResolution, error) {
	
	// Query all resolutions
	resultsIterator, err := ctx.GetStub().GetStateByRange("resolution_", "resolution_~")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	var pendingActions []*DisputeResolution
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var resolution DisputeResolution
		err = json.Unmarshal(queryResponse.Value, &resolution)
		if err != nil {
			continue
		}
		
		// Check if action is pending and involves the party
		if !resolution.ActionCompleted && resolution.RequiredAction != "NONE" {
			// Check if party is the winner (who needs to create the follow-up transaction)
			if partyID == "" || resolution.Winner == partyID {
				pendingActions = append(pendingActions, &resolution)
			}
		}
	}
	
	return pendingActions, nil
}

// MarkActionCompleted marks a dispute resolution action as completed
func (c *ConsensusContract) MarkActionCompleted(ctx contractapi.TransactionContextInterface,
	disputeID string, followUpTxID string) error {
	
	resolution, err := c.GetDisputeResolution(ctx, disputeID)
	if err != nil {
		return err
	}
	
	if resolution.ActionCompleted {
		return fmt.Errorf("action already marked as completed")
	}
	
	// Update resolution
	resolution.ActionCompleted = true
	resolution.FollowUpTxID = followUpTxID
	
	resolutionJSON, err := json.Marshal(resolution)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState("resolution_"+disputeID, resolutionJSON)
	if err != nil {
		return err
	}
	
	// Emit event
	event := ConsensusEvent{
		TransactionID: resolution.TransactionID,
		EventType:     "ACTION_COMPLETED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"disputeID":    disputeID,
			"followUpTxID": followUpTxID,
		},
	}
	
	return c.emitEvent(ctx, event)
}

// GetDisputedTransactions returns all disputed transactions
func (c *ConsensusContract) GetDisputedTransactions(ctx contractapi.TransactionContextInterface) ([]*Transaction, error) {
	queryString := fmt.Sprintf(`{"selector":{"state":"%s"}}`, StateDisputed)
	
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	var transactions []*Transaction
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var tx Transaction
		err = json.Unmarshal(queryResponse.Value, &tx)
		if err != nil {
			return nil, err
		}
		
		// Initialize fields with N/A for backward compatibility
		if tx.DisputeReason == "" {
			tx.DisputeReason = "N/A"
		}
		if tx.Evidence == nil {
			tx.Evidence = []Evidence{}
		}
		if tx.Metadata == nil {
			tx.Metadata = make(map[string]string)
		}
		
		transactions = append(transactions, &tx)
	}
	
	return transactions, nil
}

// QueryTransactions allows querying transactions with selectors
func (c *ConsensusContract) QueryTransactions(ctx contractapi.TransactionContextInterface,
	queryString string) ([]*Transaction, error) {
	
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	var transactions []*Transaction
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var tx Transaction
		err = json.Unmarshal(queryResponse.Value, &tx)
		if err != nil {
			return nil, err
		}
		
		// Initialize fields with N/A for backward compatibility
		if tx.DisputeReason == "" {
			tx.DisputeReason = "N/A"
		}
		if tx.Evidence == nil {
			tx.Evidence = []Evidence{}
		}
		if tx.Metadata == nil {
			tx.Metadata = make(map[string]string)
		}
		
		transactions = append(transactions, &tx)
	}
	
	return transactions, nil
}

// GetTransactionsByParty returns all transactions involving a specific party
func (c *ConsensusContract) GetTransactionsByParty(ctx contractapi.TransactionContextInterface,
	partyID string) ([]*Transaction, error) {
	
	queryString := fmt.Sprintf(`{"selector":{"$or":[{"sender":"%s"},{"receiver":"%s"}]}}`, partyID, partyID)
	
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	var transactions []*Transaction
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var tx Transaction
		err = json.Unmarshal(queryResponse.Value, &tx)
		if err != nil {
			return nil, err
		}
		
		// Initialize fields if needed
		if tx.DisputeReason == "" {
			tx.DisputeReason = "N/A"
		}
		if tx.Evidence == nil || len(tx.Evidence) == 0 {
			tx.Evidence = []Evidence{
				{Type: "N/A", SubmittedBy: "N/A", Timestamp: "N/A", Hash: "N/A", Verified: false},
			}
		}
		if tx.Metadata == nil {
			tx.Metadata = make(map[string]string)
		}
		
		transactions = append(transactions, &tx)
	}
	
	return transactions, nil
}

// GetAllTransactions retrieves all transactions (for debugging/admin)
func (c *ConsensusContract) GetAllTransactions(ctx contractapi.TransactionContextInterface) ([]*Transaction, error) {
	
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()
	
	var transactions []*Transaction
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		// Skip non-transaction keys (like trust scores)
		if !strings.HasPrefix(string(queryResponse.Key), "TRUST_") {
			var tx Transaction
			err = json.Unmarshal(queryResponse.Value, &tx)
			if err != nil {
				// Skip if not a valid transaction
				continue
			}
			
			// Initialize fields with N/A for backward compatibility
			if tx.DisputeReason == "" {
				tx.DisputeReason = "N/A"
			}
			if tx.Evidence == nil || len(tx.Evidence) == 0 {
				// Create placeholder evidence to avoid empty array issues
				tx.Evidence = []Evidence{
					{
						Type:        "N/A",
						SubmittedBy: "N/A",
						Timestamp:   "N/A",
						Hash:        "N/A",
						Verified:    false,
					},
				}
			}
			if tx.Metadata == nil {
				tx.Metadata = make(map[string]string)
			}
			
			transactions = append(transactions, &tx)
		}
	}
	
	return transactions, nil
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
	
	// Initialize fields with N/A for backward compatibility
	if tx.SentTimestamp == "" {
		tx.SentTimestamp = "N/A"
	}
	if tx.ReceivedTimestamp == "" {
		tx.ReceivedTimestamp = "N/A"
	}
	if tx.DisputeReason == "" {
		tx.DisputeReason = "N/A"
	}
	if tx.Evidence == nil || len(tx.Evidence) == 0 {
		// Create placeholder evidence to avoid empty array issues
		tx.Evidence = []Evidence{
			{
				Type:        "N/A",
				SubmittedBy: "N/A",
				Timestamp:   "N/A",
				Hash:        "N/A",
				Verified:    false,
			},
		}
	}
	if tx.Metadata == nil {
		tx.Metadata = make(map[string]string)
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

// ValidateTransaction checks if a transaction has timed out and applies penalties
func (c *ConsensusContract) ValidateTransaction(ctx contractapi.TransactionContextInterface,
	transactionID string) error {
	
	tx, err := c.getTransaction(ctx, transactionID)
	if err != nil {
		return err
	}
	
	// Check if already validated or disputed
	if tx.State == StateValidated || tx.State == StateDisputed {
		return nil // Already processed
	}
	
	// Check if timeout has passed
	currentTime := time.Now().Unix()
	
	// Parse timeout from transaction timestamp
	// Add default timeout of 48 hours if not specified
	createdTime, err := time.Parse(time.RFC3339, tx.Timestamp)
	if err != nil {
		return fmt.Errorf("invalid transaction timestamp: %v", err)
	}
	timeoutTime := createdTime.Add(48 * time.Hour).Format(time.RFC3339)
	
	timeout, err := time.Parse(time.RFC3339, timeoutTime)
	if err != nil {
		return fmt.Errorf("invalid timeout format: %v", err)
	}
	
	if currentTime > timeout.Unix() {
		// Transaction has timed out
		originalState := tx.State
		tx.State = StateTimeout
		
		// Apply penalties to parties who didn't confirm
		if originalState == StateInitiated {
			// Neither party confirmed - penalize both
			senderScore, _ := c.getTrustScore(ctx, tx.Sender)
			senderScore.Score = math.Max(senderScore.Score - 0.01, 0.0)
			senderScore.LastUpdated = time.Now().Format(time.RFC3339)
			c.saveTrustScore(ctx, senderScore)
			
			receiverScore, _ := c.getTrustScore(ctx, tx.Receiver)
			receiverScore.Score = math.Max(receiverScore.Score - 0.01, 0.0)
			receiverScore.LastUpdated = time.Now().Format(time.RFC3339)
			c.saveTrustScore(ctx, receiverScore)
			
		} else if originalState == StateSent {
			// Only receiver didn't confirm - penalize receiver
			receiverScore, _ := c.getTrustScore(ctx, tx.Receiver)
			receiverScore.Score = math.Max(receiverScore.Score - 0.01, 0.0)
			receiverScore.LastUpdated = time.Now().Format(time.RFC3339)
			c.saveTrustScore(ctx, receiverScore)
		}
		
		// Update transaction
		err = c.putTransaction(ctx, tx)
		if err != nil {
			return err
		}
		
		// Emit timeout event
		event := ConsensusEvent{
			TransactionID: transactionID,
			EventType:     "TRANSACTION_TIMEOUT",
			Timestamp:     time.Now().Format(time.RFC3339),
			Payload: map[string]interface{}{
				"state": string(tx.State),
			},
		}
		
		return c.emitEvent(ctx, event)
	}
	
	return nil
}

// saveTrustScore helper function to save trust scores
func (c *ConsensusContract) saveTrustScore(ctx contractapi.TransactionContextInterface,
	score *TrustScore) error {
	
	scoreKey := fmt.Sprintf("TRUST_%s", score.PartyID)
	scoreJSON, err := json.Marshal(score)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState(scoreKey, scoreJSON)
}

func (c *ConsensusContract) autoConfirmTransaction(ctx contractapi.TransactionContextInterface,
	tx *Transaction, reason string) error {
	
	// Auto-confirm based on high trust
	now := time.Now().Format(time.RFC3339)
	tx.State = StateValidated
	// Only update if not already set
	if tx.SentTimestamp == "N/A" || tx.SentTimestamp == "" {
		tx.SentTimestamp = now
	}
	if tx.ReceivedTimestamp == "N/A" || tx.ReceivedTimestamp == "" {
		tx.ReceivedTimestamp = now
	}
	
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
	
	// Store previous score for weighted calculation
	previousSenderScore := senderScore.Score
	
	senderScore.TotalTransactions++
	if success {
		senderScore.SuccessfulTx++
		
		// Bonus for milestone achievements
		if senderScore.SuccessfulTx > 10 && (senderScore.SuccessfulTx % 10 == 0) {
			// Every 10 successful transactions, small boost
			senderScore.Score = math.Min(senderScore.Score + 0.01, 1.0)
		}
	} else {
		senderScore.DisputedTx++
	}
	
	// Calculate base score
	senderBaseScore := float64(senderScore.SuccessfulTx) / float64(senderScore.TotalTransactions)
	
	// Apply weighted average for established parties
	if senderScore.TotalTransactions > 5 {
		// 70% current performance, 30% historical
		senderScore.Score = (senderBaseScore * 0.7) + (previousSenderScore * 0.3)
	} else {
		// For new parties, use simple calculation
		senderScore.Score = senderBaseScore
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
	
	// Store previous score for weighted calculation
	previousReceiverScore := receiverScore.Score
	
	receiverScore.TotalTransactions++
	if success {
		receiverScore.SuccessfulTx++
		
		// Bonus for milestone achievements
		if receiverScore.SuccessfulTx > 10 && (receiverScore.SuccessfulTx % 10 == 0) {
			// Every 10 successful transactions, small boost
			receiverScore.Score = math.Min(receiverScore.Score + 0.01, 1.0)
		}
	} else {
		receiverScore.DisputedTx++
	}
	
	// Calculate base score
	receiverBaseScore := float64(receiverScore.SuccessfulTx) / float64(receiverScore.TotalTransactions)
	
	// Apply weighted average for established parties
	if receiverScore.TotalTransactions > 5 {
		// 70% current performance, 30% historical
		receiverScore.Score = (receiverBaseScore * 0.7) + (previousReceiverScore * 0.3)
	} else {
		// For new parties, use simple calculation
		receiverScore.Score = receiverBaseScore
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

// UpdateTrustFromEvent handles trust score updates from supply chain events
func (c *ConsensusContract) UpdateTrustFromEvent(ctx contractapi.TransactionContextInterface,
	eventDataJSON string) error {
	
	var eventData map[string]interface{}
	err := json.Unmarshal([]byte(eventDataJSON), &eventData)
	if err != nil {
		return fmt.Errorf("failed to unmarshal event data: %v", err)
	}
	
	partyID, ok := eventData["partyID"].(string)
	if !ok {
		return fmt.Errorf("partyID not found in event data")
	}
	
	event, ok := eventData["event"].(string)
	if !ok {
		return fmt.Errorf("event type not found in event data")
	}
	
	// Get current trust score
	score, err := c.getTrustScore(ctx, partyID)
	if err != nil {
		return fmt.Errorf("failed to get trust score for %s: %v", partyID, err)
	}
	
	// Apply penalties based on event type
	switch event {
	case "LATE_DELIVERY":
		// Small penalty for late delivery
		score.Score = math.Max(score.Score - 0.01, 0.0)
		
	case "RETURN":
		// Medium penalty for product returns (defects)
		score.Score = math.Max(score.Score - 0.015, 0.0)
		
	case "DISPUTE_FAULT":
		// Larger penalty when found at fault in dispute
		score.Score = math.Max(score.Score - 0.05, 0.0)
		
	default:
		return fmt.Errorf("unknown event type: %s", event)
	}
	
	score.LastUpdated = time.Now().Format(time.RFC3339)
	
	// Save updated score
	scoreKey := fmt.Sprintf("trust_%s", partyID)
	scoreJSON, err := json.Marshal(score)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState(scoreKey, scoreJSON)
	if err != nil {
		return err
	}
	
	// Emit event
	eventPayload := ConsensusEvent{
		TransactionID: partyID,
		EventType:     "TRUST_SCORE_UPDATED",
		Timestamp:     time.Now().Format(time.RFC3339),
		Payload: map[string]interface{}{
			"partyID":  partyID,
			"event":    event,
			"newScore": score.Score,
		},
	}
	
	return c.emitEvent(ctx, eventPayload)
}

