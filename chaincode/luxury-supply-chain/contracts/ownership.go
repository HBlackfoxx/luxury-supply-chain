package contracts

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
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
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}

	// Only manufacturer can create birth certificate
	creator, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if product.CurrentOwner != creator {
		return fmt.Errorf("only the manufacturer can create birth certificate")
	}
	
	// CHECK PERMISSION - Only manufacturers can create birth certificates
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, creator, "CREATE_BIRTH_CERTIFICATE")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to create birth certificates", creator)
	}

	// Parse authenticity details
	var authenticity AuthenticityDetails
	err = json.Unmarshal([]byte(authenticityJSON), &authenticity)
	if err != nil {
		return fmt.Errorf("invalid authenticity details: %v", err)
	}

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

// RecoverStolen allows the owner to mark a stolen product as recovered
// Called by backend after customer authentication and verification
func (o *OwnershipContract) RecoverStolen(ctx contractapi.TransactionContextInterface,
	productID string, ownerHash string, securityHash string, recoveryProof string) error {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return err
	}

	// Verify owner hash matches
	if ownership.OwnerHash != ownerHash {
		return fmt.Errorf("ownership verification failed")
	}

	// Verify security hash matches (password:PIN verification)
	if ownership.SecurityHash != securityHash {
		return fmt.Errorf("security verification failed - invalid password or PIN")
	}

	// Check if product is actually stolen
	if ownership.Status != OwnershipStatusReported {
		return fmt.Errorf("product is not reported as stolen")
	}

	// Update ownership status back to active
	ownership.Status = OwnershipStatusActive

	// Add recovery record to service history
	recoveryRecord := ServiceRecord{
		ID:            fmt.Sprintf("RECOVERY-%d", time.Now().Unix()),
		Date:          time.Now().Format(time.RFC3339),
		ServiceCenter: "Recovery Record",
		Type:          "recovered",
		Description:   fmt.Sprintf("Product recovered: %s", recoveryProof),
		Technician:    "Owner",
		Warranty:      false,
	}
	ownership.ServiceHistory = append(ownership.ServiceHistory, recoveryRecord)

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
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}
	product.Status = ProductStatusSold
	product.IsStolen = false
	product.RecoveredDate = time.Now().Format(time.RFC3339)
	productJSON, _ = json.Marshal(product)
	ctx.GetStub().PutState(productID, productJSON)

	// Emit event
	ctx.GetStub().SetEvent("ProductRecovered", ownershipJSON)

	return nil
}

// GenerateTransferCode generates a temporary code for ownership transfer
// Called by backend after authenticating the customer off-chain
// Now requires security hash (password+PIN) verification
func (o *OwnershipContract) GenerateTransferCode(ctx contractapi.TransactionContextInterface,
	productID string, currentOwnerHash string, securityHash string) (string, error) {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return "", err
	}

	// Verify owner hash matches
	if ownership.OwnerHash != currentOwnerHash {
		return "", fmt.Errorf("ownership verification failed")
	}

	// Verify security hash (password + PIN) matches
	if ownership.SecurityHash != securityHash {
		return "", fmt.Errorf("security verification failed - incorrect password or PIN")
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
// Called by backend after authenticating the new customer off-chain
// New owner provides their own security hash (password+PIN)
func (o *OwnershipContract) TransferOwnership(ctx contractapi.TransactionContextInterface,
	productID string, transferCode string, newOwnerHash string, newSecurityHash string) error {

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
	ownership.SecurityHash = newSecurityHash  // New owner's security hash
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
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}
	product.OwnershipHash = newOwnerHash
	productJSON, _ = json.Marshal(product)
	ctx.GetStub().PutState(productID, productJSON)

	// Emit event
	ctx.GetStub().SetEvent("OwnershipTransferred", ownershipJSON)

	return nil
}

// ReportStolen marks a product as stolen
// Called by backend after customer authentication and verification
func (o *OwnershipContract) ReportStolen(ctx contractapi.TransactionContextInterface,
	productID string, ownerHash string, securityHash string, policeReportID string) error {

	// Get ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return err
	}

	// Verify owner hash matches
	if ownership.OwnerHash != ownerHash {
		return fmt.Errorf("ownership verification failed")
	}

	// Verify security hash matches (password:PIN verification)
	if ownership.SecurityHash != securityHash {
		return fmt.Errorf("security verification failed - invalid password or PIN")
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
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}
	product.Status = ProductStatusStolen
	product.IsStolen = true
	product.StolenDate = time.Now().Format(time.RFC3339)
	product.RecoveredDate = "N/A" // Clear any previous recovery date
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
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}

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
	
	// CHECK PERMISSION - Only retailers and warehouses can add service records
	roleContract := &RoleManagementContract{}
	hasPermission, err := roleContract.CheckPermission(ctx, caller, "ADD_SERVICE_RECORD")
	if err != nil || !hasPermission {
		return fmt.Errorf("caller %s does not have permission to add service records", caller)
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

	// Ensure Materials is never nil (empty array instead)
	if certificate.Materials == nil {
		certificate.Materials = []MaterialRecord{}
	}

	return &certificate, nil
}

// GetOwnerSpecificInfo returns detailed info only for the authenticated owner
// Called by backend after verifying customer identity off-chain
func (o *OwnershipContract) GetOwnerSpecificInfo(ctx contractapi.TransactionContextInterface,
	productID string, ownerHash string) (map[string]interface{}, error) {
	
	// Get ownership record
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return nil, err
	}
	
	// Verify ownership hash matches
	if ownership.OwnerHash != ownerHash {
		return nil, fmt.Errorf("ownership verification failed")
	}
	
	// Get full product details
	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return nil, err
	}
	
	var product Product
	json.Unmarshal(productJSON, &product)
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}
	
	// Get birth certificate if exists
	certificate, _ := o.GetBirthCertificate(ctx, productID)
	
	// Return comprehensive owner-specific information
	ownerInfo := map[string]interface{}{
		"product": map[string]interface{}{
			"id":               product.ID,
			"batchId":          product.BatchID,
			"brand":            product.Brand,
			"name":             product.Name,
			"type":             product.Type,
			"serialNumber":     product.SerialNumber,
			"uniqueIdentifier": product.UniqueIdentifier,
			"status":           product.Status,
			"isStolen":         product.IsStolen,
			"stolenDate":       product.StolenDate,
			"recoveredDate":    product.RecoveredDate,
			"materials":        product.Materials,
		},
		"ownership": map[string]interface{}{
			"ownershipDate":    ownership.OwnershipDate,
			"purchaseLocation": ownership.PurchaseLocation,
			"serviceHistory":   ownership.ServiceHistory,
			"transferCode":     ownership.TransferCode,
			"transferExpiry":   ownership.TransferExpiry,
			"previousOwners":   ownership.PreviousOwners,
			"status":           ownership.Status,
		},
	}
	
	if certificate != nil {
		ownerInfo["certificate"] = map[string]interface{}{
			"manufacturingDate":  certificate.ManufacturingDate,
			"manufacturingPlace": certificate.ManufacturingPlace,
			"craftsman":          certificate.Craftsman,
			"authenticity":       certificate.Authenticity,
			"certificateHash":    certificate.CertificateHash,
		}
	}
	
	return ownerInfo, nil
}

// Note: createOwnerHash removed - backend generates hashes for privacy
// Backend manages customer authentication and hash generation

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

// ============= MISSING OWNERSHIP FUNCTIONS =============

// GetProductsByOwner retrieves all products owned by a specific owner hash
func (o *OwnershipContract) GetProductsByOwner(ctx contractapi.TransactionContextInterface,
	ownerHash string) ([]*Product, error) {
	
	// Query all ownership records
	resultsIterator, err := ctx.GetStub().GetStateByRange("ownership_", "ownership_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query ownership records: %v", err)
	}
	defer resultsIterator.Close()
	
	var ownedProducts []*Product
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var ownership Ownership
		err = json.Unmarshal(queryResponse.Value, &ownership)
		if err != nil {
			continue
		}
		
		// Check if this ownership matches the owner hash
		if ownership.OwnerHash == ownerHash && ownership.Status == OwnershipStatusActive {
			// Get the product
			productJSON, err := ctx.GetStub().GetState(ownership.ProductID)
			if err != nil || productJSON == nil {
				continue
			}
			
			var product Product
			err = json.Unmarshal(productJSON, &product)
			if err != nil {
				continue
			}
			
			// Ensure Materials is never nil
			if product.Materials == nil {
				product.Materials = []Material{}
			}
			
			ownedProducts = append(ownedProducts, &product)
		}
	}
	
	return ownedProducts, nil
}

// GetStolenProducts retrieves all products marked as stolen
func (o *OwnershipContract) GetStolenProducts(ctx contractapi.TransactionContextInterface) ([]*Product, error) {
	// Query all products
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("failed to query products: %v", err)
	}
	defer resultsIterator.Close()
	
	var stolenProducts []*Product
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		// Skip non-product entries
		key := queryResponse.Key
		if strings.HasPrefix(key, "transfer_") || strings.HasPrefix(key, "batch_") || 
		   strings.HasPrefix(key, "ownership_") || strings.HasPrefix(key, "cert_") ||
		   strings.HasPrefix(key, "material_") || strings.HasPrefix(key, "org_") {
			continue
		}
		
		var product Product
		err = json.Unmarshal(queryResponse.Value, &product)
		if err != nil {
			continue
		}
		// Ensure Materials is never nil
		if product.Materials == nil {
			product.Materials = []Material{}
		}
		
		// Check if product is stolen
		if product.IsStolen || product.Status == ProductStatusStolen {
			stolenProducts = append(stolenProducts, &product)
		}
	}
	
	return stolenProducts, nil
}

// OwnershipHistoryRecord represents ownership history for a product
type OwnershipHistoryRecord struct {
	ProductID      string          `json:"productID"`
	CurrentOwner   CurrentOwnerInfo `json:"currentOwner"`
	PreviousOwners []PreviousOwner `json:"previousOwners"`
	TotalOwners    int             `json:"totalOwners"`
	ProductStatus  string          `json:"productStatus"`
	IsStolen       bool            `json:"isStolen"`
	StolenDate     string          `json:"stolenDate,omitempty"`
	RecoveredDate  string          `json:"recoveredDate,omitempty"`
	ServiceHistory []ServiceRecord `json:"serviceHistory"`
	TotalServices  int             `json:"totalServices"`
}

// CurrentOwnerInfo represents current owner information
type CurrentOwnerInfo struct {
	OwnerHash     string `json:"ownerHash"`
	OwnershipDate string `json:"ownershipDate"`
	Status        string `json:"status"`
	Location      string `json:"location"`
}

// GetOwnershipHistory retrieves the complete ownership history for a product
func (o *OwnershipContract) GetOwnershipHistory(ctx contractapi.TransactionContextInterface,
	productID string) (*OwnershipHistoryRecord, error) {
	
	// Get current ownership
	ownership, err := o.GetOwnership(ctx, productID)
	if err != nil {
		return nil, err
	}
	
	// Get product details
	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return nil, err
	}
	if productJSON == nil {
		return nil, fmt.Errorf("product %s not found", productID)
	}
	
	var product Product
	err = json.Unmarshal(productJSON, &product)
	if err != nil {
		return nil, err
	}
	// Ensure Materials is never nil
	if product.Materials == nil {
		product.Materials = []Material{}
	}
	
	// Build ownership history
	history := &OwnershipHistoryRecord{
		ProductID: productID,
		CurrentOwner: CurrentOwnerInfo{
			OwnerHash:     ownership.OwnerHash,
			OwnershipDate: ownership.OwnershipDate,
			Status:        string(ownership.Status),
			Location:      ownership.PurchaseLocation,
		},
		PreviousOwners: ownership.PreviousOwners,
		TotalOwners:    len(ownership.PreviousOwners) + 1,
		ProductStatus:  string(product.Status),
		IsStolen:       product.IsStolen,
		ServiceHistory: ownership.ServiceHistory,
		TotalServices:  len(ownership.ServiceHistory),
	}
	
	// Add stolen/recovery dates if applicable
	if product.IsStolen {
		history.StolenDate = product.StolenDate
	}
	if product.RecoveredDate != "" {
		history.RecoveredDate = product.RecoveredDate
	}
	
	return history, nil
}

// ProductWithOwnership represents a product with its ownership details
type ProductWithOwnership struct {
	Product   Product         `json:"product"`
	Ownership OwnershipInfo   `json:"ownership"`
}

// OwnershipInfo contains ownership details for display
type OwnershipInfo struct {
	OwnerHash       string `json:"ownerHash"`
	OwnershipDate   string `json:"ownershipDate"`
	Status          string `json:"status"`
	PurchaseLocation string `json:"purchaseLocation"`
	HasTransferCode bool   `json:"hasTransferCode"`
}

// GetProductsWithOwnership retrieves all products that have ownership records
func (o *OwnershipContract) GetProductsWithOwnership(ctx contractapi.TransactionContextInterface) ([]ProductWithOwnership, error) {
	// Query all ownership records
	resultsIterator, err := ctx.GetStub().GetStateByRange("ownership_", "ownership_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query ownership records: %v", err)
	}
	defer resultsIterator.Close()
	
	var productsWithOwnership []ProductWithOwnership
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var ownership Ownership
		err = json.Unmarshal(queryResponse.Value, &ownership)
		if err != nil {
			continue
		}
		
		// Get product details
		productJSON, err := ctx.GetStub().GetState(ownership.ProductID)
		if err != nil || productJSON == nil {
			continue
		}
		
		var product Product
		err = json.Unmarshal(productJSON, &product)
		if err != nil {
			continue
		}
		// Ensure Materials is never nil
		if product.Materials == nil {
			product.Materials = []Material{}
		}
		
		// Combine product and ownership info
		combined := ProductWithOwnership{
			Product: product,
			Ownership: OwnershipInfo{
				OwnerHash:       ownership.OwnerHash,
				OwnershipDate:   ownership.OwnershipDate,
				Status:          string(ownership.Status),
				PurchaseLocation: ownership.PurchaseLocation,
				HasTransferCode:  ownership.TransferCode != "",
			},
		}
		
		productsWithOwnership = append(productsWithOwnership, combined)
	}
	
	return productsWithOwnership, nil
}

// OwnershipStatistics represents ownership statistics
type OwnershipStatistics struct {
	TotalOwned       int    `json:"totalOwned"`
	ActiveOwnership  int    `json:"activeOwnership"`
	Transferring     int    `json:"transferring"`
	ReportedStolen   int    `json:"reportedStolen"`
	TotalCertificates int   `json:"totalCertificates"`
	Timestamp        string `json:"timestamp"`
}

// GetOwnershipStatistics retrieves ownership statistics
func (o *OwnershipContract) GetOwnershipStatistics(ctx contractapi.TransactionContextInterface) (*OwnershipStatistics, error) {
	stats := &OwnershipStatistics{}
	
	// Count total ownership records
	resultsIterator, err := ctx.GetStub().GetStateByRange("ownership_", "ownership_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query ownership records: %v", err)
	}
	defer resultsIterator.Close()
	
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var ownership Ownership
		err = json.Unmarshal(queryResponse.Value, &ownership)
		if err != nil {
			continue
		}
		
		stats.TotalOwned++
		
		switch ownership.Status {
		case OwnershipStatusActive:
			stats.ActiveOwnership++
		case OwnershipStatusTransferring:
			stats.Transferring++
		case OwnershipStatusReported:
			stats.ReportedStolen++
		}
	}
	
	// Count birth certificates
	certIterator, err := ctx.GetStub().GetStateByRange("cert_", "cert_~")
	if err == nil {
		defer certIterator.Close()
		for certIterator.HasNext() {
			certIterator.Next()
			stats.TotalCertificates++
		}
	}
	
	stats.Timestamp = time.Now().Format(time.RFC3339)
	
	return stats, nil
}