package contracts

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// OwnershipContract handles B2C ownership and privacy operations
type OwnershipContract struct {
	contractapi.Contract
}

// CreateDigitalBirthCertificate creates an immutable birth certificate when product is manufactured
func (o *OwnershipContract) CreateDigitalBirthCertificate(ctx contractapi.TransactionContextInterface,
	productID string, manufacturingPlace string, craftsman string, authenticityJSON string) error {

	// Check if certificate already exists
	certKey := "cert_" + productID
	existingCert, _ := ctx.GetStub().GetState(certKey)
	if existingCert != nil {
		return fmt.Errorf("digital birth certificate already exists for product %s", productID)
	}

	// Get product to verify it exists
	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return err
	}
	if productJSON == nil {
		return fmt.Errorf("product %s does not exist", productID)
	}

	var product Product
	err = json.Unmarshal(productJSON, &product)
	if err != nil {
		return err
	}

	// Only manufacturer can create birth certificate
	creator, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if product.CurrentOwner != creator {
		return fmt.Errorf("only the manufacturer can create birth certificate")
	}

	// Parse authenticity details
	var authenticity AuthenticityDetails
	err = json.Unmarshal([]byte(authenticityJSON), &authenticity)
	if err != nil {
		return fmt.Errorf("invalid authenticity details: %v", err)
	}

	// Create material records from product materials
	var materialRecords []MaterialRecord
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
		ManufacturingDate:  time.Now().Format(time.RFC3339),
		ManufacturingPlace: manufacturingPlace,
		Craftsman:          craftsman,
		Materials:          materialRecords,
		Authenticity:       authenticity,
		InitialPhotos:      []string{}, // Will be added via separate function
	}

	// Calculate certificate hash
	certData, _ := json.Marshal(certificate)
	hash := sha256.Sum256(certData)
	certificate.CertificateHash = hex.EncodeToString(hash[:])

	// Store certificate
	certJSON, err := json.Marshal(certificate)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(certKey, certJSON)
	if err != nil {
		return err
	}

	// Update product status
	product.Status = ProductStatusInProduction
	productJSON, _ = json.Marshal(product)
	ctx.GetStub().PutState(productID, productJSON)

	// Emit event
	ctx.GetStub().SetEvent("BirthCertificateCreated", certJSON)

	return nil
}

// ClaimOwnership allows a customer to claim ownership (no wallet needed)
func (o *OwnershipContract) ClaimOwnership(ctx contractapi.TransactionContextInterface,
	productID string, ownerEmail string, ownerPhone string, purchaseLocation string) error {

	// Get product
	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return err
	}
	if productJSON == nil {
		return fmt.Errorf("product %s does not exist", productID)
	}

	var product Product
	err = json.Unmarshal(productJSON, &product)
	if err != nil {
		return err
	}

	// Verify product is sold status
	if product.Status != ProductStatusSold {
		return fmt.Errorf("product is not available for ownership claim")
	}

	// Check if already owned by a customer
	ownershipKey := "ownership_" + productID
	existingOwnership, _ := ctx.GetStub().GetState(ownershipKey)
	if existingOwnership != nil {
		return fmt.Errorf("product already has an owner")
	}

	// Create privacy-preserving owner hash
	ownerHash := o.createOwnerHash(ownerEmail, ownerPhone)

	// Create ownership record
	ownership := Ownership{
		ProductID:        productID,
		OwnerHash:        ownerHash,
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

	// Update product with ownership hash
	product.OwnershipHash = ownerHash
	productJSON, _ = json.Marshal(product)
	ctx.GetStub().PutState(productID, productJSON)

	// Emit event
	ctx.GetStub().SetEvent("OwnershipClaimed", ownershipJSON)

	return nil
}

// GenerateTransferCode generates a temporary code for ownership transfer
func (o *OwnershipContract) GenerateTransferCode(ctx contractapi.TransactionContextInterface,
	productID string, ownerEmail string, ownerPhone string) (string, error) {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return "", err
	}

	// Verify owner
	ownerHash := o.createOwnerHash(ownerEmail, ownerPhone)
	if ownership.OwnerHash != ownerHash {
		return "", fmt.Errorf("ownership verification failed")
	}

	// Generate random transfer code
	code := o.generateRandomCode(8)
	
	// Set expiry (24 hours)
	expiry := time.Now().Add(24 * time.Hour).Format(time.RFC3339)

	// Update ownership with transfer code
	ownership.TransferCode = code
	ownership.TransferExpiry = expiry
	ownership.Status = OwnershipStatusTransferring

	ownershipJSON, err := json.Marshal(ownership)
	if err != nil {
		return "", err
	}

	ownershipKey := "ownership_" + productID
	err = ctx.GetStub().PutState(ownershipKey, ownershipJSON)
	if err != nil {
		return "", err
	}

	return code, nil
}

// TransferOwnership transfers ownership using the transfer code
func (o *OwnershipContract) TransferOwnership(ctx contractapi.TransactionContextInterface,
	productID string, transferCode string, newOwnerEmail string, newOwnerPhone string) error {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return err
	}

	// Verify transfer code
	if ownership.TransferCode != transferCode {
		return fmt.Errorf("invalid transfer code")
	}

	// Check expiry
	if ownership.TransferExpiry == "" || time.Now().Format(time.RFC3339) > ownership.TransferExpiry {
		return fmt.Errorf("transfer code has expired")
	}

	// Create new owner hash
	newOwnerHash := o.createOwnerHash(newOwnerEmail, newOwnerPhone)

	// Record previous owner
	prevOwner := PreviousOwner{
		OwnerHash:     ownership.OwnerHash,
		OwnershipDate: ownership.OwnershipDate,
		TransferDate:  time.Now().Format(time.RFC3339),
		TransferType:  "sale",
	}
	ownership.PreviousOwners = append(ownership.PreviousOwners, prevOwner)

	// Update ownership
	ownership.OwnerHash = newOwnerHash
	ownership.OwnershipDate = time.Now().Format(time.RFC3339)
	ownership.TransferCode = ""
	ownership.TransferExpiry = ""
	ownership.Status = OwnershipStatusActive

	// Store updated ownership
	ownershipJSON, err := json.Marshal(ownership)
	if err != nil {
		return err
	}

	ownershipKey := "ownership_" + productID
	err = ctx.GetStub().PutState(ownershipKey, ownershipJSON)
	if err != nil {
		return err
	}

	// Update product
	productJSON, _ := ctx.GetStub().GetState(productID)
	var product Product
	json.Unmarshal(productJSON, &product)
	product.OwnershipHash = newOwnerHash
	productJSON, _ = json.Marshal(product)
	ctx.GetStub().PutState(productID, productJSON)

	// Emit event
	ctx.GetStub().SetEvent("OwnershipTransferred", ownershipJSON)

	return nil
}

// ReportStolen marks a product as stolen
func (o *OwnershipContract) ReportStolen(ctx contractapi.TransactionContextInterface,
	productID string, ownerEmail string, ownerPhone string, policeReportID string) error {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return err
	}

	// Verify owner
	ownerHash := o.createOwnerHash(ownerEmail, ownerPhone)
	if ownership.OwnerHash != ownerHash {
		return fmt.Errorf("ownership verification failed")
	}

	// Update ownership status
	ownership.Status = OwnershipStatusReported

	// Store police report reference in metadata
	if ownership.ServiceHistory == nil {
		ownership.ServiceHistory = []ServiceRecord{}
	}

	stolenRecord := ServiceRecord{
		ID:            policeReportID,
		Date:          time.Now().Format(time.RFC3339),
		ServiceCenter: "Police Report",
		Type:          "stolen_report",
		Description:   "Product reported stolen",
		Technician:    "N/A",
		Warranty:      false,
	}
	ownership.ServiceHistory = append(ownership.ServiceHistory, stolenRecord)

	// Update ownership
	ownershipJSON, err := json.Marshal(ownership)
	if err != nil {
		return err
	}

	ownershipKey := "ownership_" + productID
	err = ctx.GetStub().PutState(ownershipKey, ownershipJSON)
	if err != nil {
		return err
	}

	// Update product status
	productJSON, _ := ctx.GetStub().GetState(productID)
	var product Product
	json.Unmarshal(productJSON, &product)
	product.Status = ProductStatusStolen
	productJSON, _ = json.Marshal(product)
	ctx.GetStub().PutState(productID, productJSON)

	// Emit high priority event
	ctx.GetStub().SetEvent("ProductReportedStolen", ownershipJSON)

	return nil
}

// VerifyAuthenticity allows anyone to verify if a product is authentic
func (o *OwnershipContract) VerifyAuthenticity(ctx contractapi.TransactionContextInterface,
	productID string) (map[string]interface{}, error) {

	// Get product
	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return nil, err
	}
	if productJSON == nil {
		return map[string]interface{}{
			"authentic": false,
			"reason":    "Product not found in blockchain",
		}, nil
	}

	var product Product
	json.Unmarshal(productJSON, &product)

	// Get birth certificate
	certKey := "cert_" + productID
	certJSON, err := ctx.GetStub().GetState(certKey)
	if err != nil {
		return nil, err
	}
	if certJSON == nil {
		return map[string]interface{}{
			"authentic": false,
			"reason":    "No birth certificate found",
		}, nil
	}

	var certificate DigitalBirthCertificate
	json.Unmarshal(certJSON, &certificate)

	// Check if stolen
	if product.Status == ProductStatusStolen {
		return map[string]interface{}{
			"authentic": true,
			"warning":   "Product is reported stolen",
			"status":    product.Status,
		}, nil
	}

	// Return verification result
	result := map[string]interface{}{
		"authentic":         true,
		"productId":         productID,
		"brand":             product.Brand,
		"status":           product.Status,
		"hasOwner":         product.OwnershipHash != "",
		"manufacturingDate": certificate.ManufacturingDate,
		"certificateHash":  certificate.CertificateHash,
	}

	return result, nil
}

// AddServiceRecord adds a service/repair record
func (o *OwnershipContract) AddServiceRecord(ctx contractapi.TransactionContextInterface,
	productID string, serviceID string, serviceCenter string, serviceType string,
	description string, technician string, warranty bool) error {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return err
	}

	// Only authorized service centers can add records
	caller, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get caller identity: %v", err)
	}
	
	// Check if caller is authorized (must be from a known organization)
	authorizedOrgs := map[string]bool{
		"LuxeBagsMSP":       true,
		"CraftWorkshopMSP":  true,
		"LuxuryRetailMSP":   true,
	}
	
	if !authorizedOrgs[caller] {
		return fmt.Errorf("caller %s is not authorized to add service records", caller)
	}
	
	record := ServiceRecord{
		ID:            serviceID,
		Date:          time.Now().Format(time.RFC3339),
		ServiceCenter: serviceCenter,
		Type:          serviceType,
		Description:   description,
		Technician:    technician,
		Warranty:      warranty,
	}

	ownership.ServiceHistory = append(ownership.ServiceHistory, record)

	// Update ownership
	ownershipJSON, err := json.Marshal(ownership)
	if err != nil {
		return err
	}

	ownershipKey := "ownership_" + productID
	return ctx.GetStub().PutState(ownershipKey, ownershipJSON)
}

// GetOwnership retrieves ownership information
func (o *OwnershipContract) GetOwnership(ctx contractapi.TransactionContextInterface,
	productID string) (*Ownership, error) {

	ownershipKey := "ownership_" + productID
	ownershipJSON, err := ctx.GetStub().GetState(ownershipKey)
	if err != nil {
		return nil, err
	}
	if ownershipJSON == nil {
		return nil, fmt.Errorf("ownership record not found for product %s", productID)
	}

	var ownership Ownership
	err = json.Unmarshal(ownershipJSON, &ownership)
	if err != nil {
		return nil, err
	}

	return &ownership, nil
}

// GetBirthCertificate retrieves the digital birth certificate
func (o *OwnershipContract) GetBirthCertificate(ctx contractapi.TransactionContextInterface,
	productID string) (*DigitalBirthCertificate, error) {

	certKey := "cert_" + productID
	certJSON, err := ctx.GetStub().GetState(certKey)
	if err != nil {
		return nil, err
	}
	if certJSON == nil {
		return nil, fmt.Errorf("birth certificate not found for product %s", productID)
	}

	var certificate DigitalBirthCertificate
	err = json.Unmarshal(certJSON, &certificate)
	if err != nil {
		return nil, err
	}

	return &certificate, nil
}

// Helper function to create owner hash
func (o *OwnershipContract) createOwnerHash(email string, phone string) string {
	// In production, add a salt from configuration
	salt := "luxury-supply-chain-salt"
	data := email + phone + salt
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

// Helper function to generate random code
func (o *OwnershipContract) generateRandomCode(length int) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	rand.Read(b)
	for i := range b {
		b[i] = charset[b[i]%byte(len(charset))]
	}
	return string(b)
}