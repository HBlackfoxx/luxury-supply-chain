package contracts

import (
	"encoding/json"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/stretchr/testify/require"
)

func TestSupplyChainContract(t *testing.T) {
	// Create a new mock stub
	chaincode, err := contractapi.NewChaincode(&SupplyChainContract{})
	require.NoError(t, err)

	stub := shim.NewMockStub("supply_chain_test", chaincode)
	require.NotNil(t, stub)

	t.Run("CreateProduct", func(t *testing.T) {
		// Test creating a product
		res := stub.MockInvoke("1", [][]byte{
			[]byte("CreateProduct"),
			[]byte("PROD001"),
			[]byte("LuxeBags"),
			[]byte("Elite Handbag"),
			[]byte("handbag"),
			[]byte("SN123456"),
		})
		require.Equal(t, int32(shim.OK), res.Status)

		// Verify product was created
		productBytes := stub.State["PROD001"]
		require.NotNil(t, productBytes)

		var product Product
		err := json.Unmarshal(productBytes, &product)
		require.NoError(t, err)
		require.Equal(t, "PROD001", product.ID)
		require.Equal(t, "LuxeBags", product.Brand)
		require.Equal(t, ProductStatusCreated, product.Status)
	})

	t.Run("AddMaterial", func(t *testing.T) {
		// Add material to the product
		res := stub.MockInvoke("2", [][]byte{
			[]byte("AddMaterial"),
			[]byte("PROD001"),
			[]byte("MAT001"),
			[]byte("leather"),
			[]byte("Italy"),
			[]byte("italianleather"),
			[]byte("BATCH123"),
			[]byte("CERT456"),
		})
		require.Equal(t, int32(shim.OK), res.Status)

		// Verify material was added
		productBytes := stub.State["PROD001"]
		var product Product
		json.Unmarshal(productBytes, &product)
		require.Len(t, product.Materials, 1)
		require.Equal(t, "leather", product.Materials[0].Type)
	})

	t.Run("InitiateTransfer", func(t *testing.T) {
		// Initiate a transfer
		res := stub.MockInvoke("3", [][]byte{
			[]byte("InitiateTransfer"),
			[]byte("TRANS001"),
			[]byte("PROD001"),
			[]byte("craftworkshop"),
			[]byte("SUPPLY_CHAIN"),
		})
		require.Equal(t, int32(shim.OK), res.Status)

		// Verify transfer was created
		transferBytes := stub.State["transfer_TRANS001"]
		require.NotNil(t, transferBytes)

		var transfer Transfer
		json.Unmarshal(transferBytes, &transfer)
		require.Equal(t, "TRANS001", transfer.ID)
		require.Equal(t, TransferStatusInitiated, transfer.Status)
	})
}

func TestOwnershipContract(t *testing.T) {
	// Create a new mock stub
	chaincode, err := contractapi.NewChaincode(&SupplyChainContract{}, &OwnershipContract{})
	require.NoError(t, err)

	stub := shim.NewMockStub("ownership_test", chaincode)
	require.NotNil(t, stub)

	// First create a product
	stub.MockInvoke("1", [][]byte{
		[]byte("CreateProduct"),
		[]byte("PROD002"),
		[]byte("LuxeBags"),
		[]byte("Premium Wallet"),
		[]byte("wallet"),
		[]byte("SN789012"),
	})

	t.Run("CreateDigitalBirthCertificate", func(t *testing.T) {
		// Create authenticity details
		authenticity := AuthenticityDetails{
			NFCChipID:        "NFC123",
			QRCodeData:       "QR456",
			HologramID:       "HOLO789",
			SecurityFeatures: []string{"watermark", "microprint"},
		}
		authJSON, _ := json.Marshal(authenticity)

		res := stub.MockInvoke("2", [][]byte{
			[]byte("CreateDigitalBirthCertificate"),
			[]byte("PROD002"),
			[]byte("Milan, Italy"),
			[]byte("Master Craftsman John"),
			authJSON,
		})
		require.Equal(t, int32(shim.OK), res.Status)

		// Verify certificate was created
		certBytes := stub.State["cert_PROD002"]
		require.NotNil(t, certBytes)

		var cert DigitalBirthCertificate
		json.Unmarshal(certBytes, &cert)
		require.Equal(t, "PROD002", cert.ProductID)
		require.NotEmpty(t, cert.CertificateHash)
	})

	t.Run("ClaimOwnership", func(t *testing.T) {
		// First update product status to sold
		productBytes := stub.State["PROD002"]
		var product Product
		json.Unmarshal(productBytes, &product)
		product.Status = ProductStatusSold
		productJSON, _ := json.Marshal(product)
		stub.State["PROD002"] = productJSON

		// Claim ownership
		res := stub.MockInvoke("3", [][]byte{
			[]byte("ClaimOwnership"),
			[]byte("PROD002"),
			[]byte("customer@example.com"),
			[]byte("+1234567890"),
			[]byte("Luxury Retail Store Milan"),
		})
		require.Equal(t, int32(shim.OK), res.Status)

		// Verify ownership was created
		ownershipBytes := stub.State["ownership_PROD002"]
		require.NotNil(t, ownershipBytes)

		var ownership Ownership
		json.Unmarshal(ownershipBytes, &ownership)
		require.Equal(t, "PROD002", ownership.ProductID)
		require.NotEmpty(t, ownership.OwnerHash)
		require.Equal(t, OwnershipStatusActive, ownership.Status)
	})
}