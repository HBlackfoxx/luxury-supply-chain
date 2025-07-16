package contracts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// PrivacyUtilities provides privacy-preserving functions
type PrivacyUtilities struct{}

// GetPublicProductInfo returns only public information about a product
func GetPublicProductInfo(ctx contractapi.TransactionContextInterface, productID string) (map[string]interface{}, error) {
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

	// Return only public fields
	publicInfo := map[string]interface{}{
		"id":           product.ID,
		"brand":        product.Brand,
		"type":         product.Type,
		"status":       product.Status,
		"hasOwner":     product.OwnershipHash != "",
		"isStolen":     product.Status == ProductStatusStolen,
		"createdAt":    product.CreatedAt,
	}

	return publicInfo, nil
}

// GetOwnerSpecificInfo returns detailed info only if the requester is the owner
func GetOwnerSpecificInfo(ctx contractapi.TransactionContextInterface, 
	productID string, ownerEmail string, ownerPhone string) (map[string]interface{}, error) {

	// Get ownership record
	ownershipKey := "ownership_" + productID
	ownershipJSON, err := ctx.GetStub().GetState(ownershipKey)
	if err != nil {
		return nil, err
	}
	if ownershipJSON == nil {
		return nil, fmt.Errorf("no ownership record found")
	}

	var ownership Ownership
	err = json.Unmarshal(ownershipJSON, &ownership)
	if err != nil {
		return nil, err
	}

	// Verify ownership
	requestorHash := createOwnerHashInternal(ownerEmail, ownerPhone)
	if ownership.OwnerHash != requestorHash {
		return nil, fmt.Errorf("ownership verification failed")
	}

	// Get full product details
	productJSON, err := ctx.GetStub().GetState(productID)
	if err != nil {
		return nil, err
	}

	var product Product
	json.Unmarshal(productJSON, &product)

	// Get birth certificate
	certKey := "cert_" + productID
	certJSON, _ := ctx.GetStub().GetState(certKey)
	var certificate DigitalBirthCertificate
	if certJSON != nil {
		json.Unmarshal(certJSON, &certificate)
	}

	// Return comprehensive owner-specific information
	ownerInfo := map[string]interface{}{
		"product": map[string]interface{}{
			"id":              product.ID,
			"brand":           product.Brand,
			"name":            product.Name,
			"type":            product.Type,
			"serialNumber":    product.SerialNumber,
			"status":          product.Status,
			"materials":       product.Materials,
			"qualityChecks":   product.QualityCheckpoints,
		},
		"ownership": map[string]interface{}{
			"ownershipDate":    ownership.OwnershipDate,
			"purchaseLocation": ownership.PurchaseLocation,
			"serviceHistory":   ownership.ServiceHistory,
			"transferCode":     ownership.TransferCode,
			"transferExpiry":   ownership.TransferExpiry,
		},
		"certificate": map[string]interface{}{
			"manufacturingDate":  certificate.ManufacturingDate,
			"manufacturingPlace": certificate.ManufacturingPlace,
			"craftsman":          certificate.Craftsman,
			"authenticity":       certificate.Authenticity,
		},
	}

	return ownerInfo, nil
}

// GetBrandAnalytics returns aggregated analytics for brand (privacy-preserved)
func GetBrandAnalytics(ctx contractapi.TransactionContextInterface, brand string) (map[string]interface{}, error) {
	// Query all products for the brand
	queryString := fmt.Sprintf(`{"selector":{"brand":"%s"}}`, brand)
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	// Aggregate statistics
	var totalProducts int
	statusCount := make(map[string]int)
	var ownedProducts int
	var stolenProducts int

	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var product Product
		json.Unmarshal(queryResponse.Value, &product)

		totalProducts++
		statusCount[string(product.Status)]++

		if product.OwnershipHash != "" {
			ownedProducts++
		}
		if product.Status == ProductStatusStolen {
			stolenProducts++
		}
	}

	// Return aggregated analytics without exposing individual data
	analytics := map[string]interface{}{
		"brand":               brand,
		"totalProducts":       totalProducts,
		"statusDistribution":  statusCount,
		"ownedProducts":       ownedProducts,
		"stolenProducts":      stolenProducts,
		"ownershipRate":       float64(ownedProducts) / float64(totalProducts) * 100,
	}

	return analytics, nil
}

// VerifyOwnershipWithoutReveal allows verification without revealing owner identity
func VerifyOwnershipWithoutReveal(ctx contractapi.TransactionContextInterface,
	productID string, verificationHash string) (bool, error) {

	// Get ownership record
	ownershipKey := "ownership_" + productID
	ownershipJSON, err := ctx.GetStub().GetState(ownershipKey)
	if err != nil {
		return false, err
	}
	if ownershipJSON == nil {
		return false, nil
	}

	var ownership Ownership
	err = json.Unmarshal(ownershipJSON, &ownership)
	if err != nil {
		return false, err
	}

	// Compare hashes
	return ownership.OwnerHash == verificationHash, nil
}

// GetTransferHistory returns anonymized transfer history
func GetTransferHistory(ctx contractapi.TransactionContextInterface, productID string) ([]map[string]interface{}, error) {
	// Get product history
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

		var product Product
		if !response.IsDelete {
			err = json.Unmarshal(response.Value, &product)
			if err != nil {
				continue
			}

			// Create anonymized history entry
			entry := map[string]interface{}{
				"timestamp": response.Timestamp,
				"txId":      response.TxId[:8] + "...", // Partial txId for privacy
				"status":    product.Status,
				"hasOwner":  product.OwnershipHash != "",
			}
			history = append(history, entry)
		}
	}

	return history, nil
}

// Helper function for consistent hashing
func createOwnerHashInternal(email string, phone string) string {
	salt := "luxury-supply-chain-salt"
	data := email + phone + salt
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}