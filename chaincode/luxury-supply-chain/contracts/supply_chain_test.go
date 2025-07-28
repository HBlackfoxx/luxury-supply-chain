package contracts

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProductCreation(t *testing.T) {
	// Test product struct creation and validation
	product := Product{
		ID:              "PROD001",
		Brand:           "LuxeBags",
		Name:            "Elite Handbag",
		Type:            "handbag",
		SerialNumber:    "SN123456",
		CreatedAt:       time.Now().Format(time.RFC3339),
		CurrentOwner:    "LuxeBagsMSP",
		CurrentLocation: "LuxeBagsMSP",
		Status:          ProductStatusCreated,
		Materials:       []Material{},
		QualityCheckpoints: []QualityCheckpoint{},
		Metadata:        make(map[string]interface{}),
		OwnershipHash:   "",
	}

	assert.Equal(t, "PROD001", product.ID)
	assert.Equal(t, "LuxeBags", product.Brand)
	assert.Equal(t, ProductStatusCreated, product.Status)
	assert.Empty(t, product.Materials)
}

func TestMaterialAddition(t *testing.T) {
	// Test adding materials to a product
	product := Product{
		ID:        "PROD001",
		Materials: []Material{},
	}

	material := Material{
		ID:           "MAT001",
		Type:         "leather",
		Source:       "Italy",
		Supplier:     "italianleather",
		Batch:        "BATCH123",
		Verification: "CERT456",
		ReceivedDate: time.Now().Format(time.RFC3339),
	}

	product.Materials = append(product.Materials, material)

	require.Len(t, product.Materials, 1)
	assert.Equal(t, "leather", product.Materials[0].Type)
	assert.Equal(t, "Italy", product.Materials[0].Source)
}

func TestTransferCreation(t *testing.T) {
	// Test transfer struct creation
	transfer := Transfer{
		ID:           "TRANS001",
		ProductID:    "PROD001",
		From:         "luxebags",
		To:           "craftworkshop",
		TransferType: TransferTypeSupplyChain,
		InitiatedAt:  time.Now().Format(time.RFC3339),
		CompletedAt:  "",
		Status:       TransferStatusInitiated,
		ConsensusDetails: ConsensusInfo{
			SenderConfirmed:   false,
			ReceiverConfirmed: false,
			SenderTimestamp:   "",
			ReceiverTimestamp: "",
			TimeoutAt:         time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		},
	}

	assert.Equal(t, "TRANS001", transfer.ID)
	assert.Equal(t, TransferStatusInitiated, transfer.Status)
	assert.False(t, transfer.ConsensusDetails.SenderConfirmed)
	assert.NotEmpty(t, transfer.ConsensusDetails.TimeoutAt)
}

func TestOwnershipStructure(t *testing.T) {
	// Test ownership struct
	ownership := Ownership{
		ProductID:        "PROD001",
		OwnerHash:        "hash123",
		OwnershipDate:    time.Now().Format(time.RFC3339),
		PurchaseLocation: "Milan Store",
		TransferCode:     "",
		TransferExpiry:   "",
		Status:           OwnershipStatusActive,
		ServiceHistory:   []ServiceRecord{},
		PreviousOwners:   []PreviousOwner{},
	}

	assert.Equal(t, "PROD001", ownership.ProductID)
	assert.Equal(t, OwnershipStatusActive, ownership.Status)
	assert.Empty(t, ownership.TransferCode)
}

func TestDigitalBirthCertificate(t *testing.T) {
	// Test digital birth certificate creation
	cert := DigitalBirthCertificate{
		ProductID:          "PROD001",
		Brand:              "LuxeBags",
		ManufacturingDate:  time.Now().Format(time.RFC3339),
		ManufacturingPlace: "Milan, Italy",
		Craftsman:          "Master Craftsman John",
		Materials: []MaterialRecord{
			{
				Type:     "leather",
				Source:   "Italy",
				Supplier: "italianleather",
				Batch:    "BATCH123",
			},
		},
		Authenticity: AuthenticityDetails{
			NFCChipID:        "NFC123",
			QRCodeData:       "QR456",
			HologramID:       "HOLO789",
			SecurityFeatures: []string{"watermark", "microprint"},
		},
		InitialPhotos:   []string{"ipfs://photo1", "ipfs://photo2"},
		CertificateHash: "cert_hash_123",
	}

	assert.Equal(t, "PROD001", cert.ProductID)
	assert.Equal(t, "Milan, Italy", cert.ManufacturingPlace)
	assert.Len(t, cert.Materials, 1)
	assert.Equal(t, "NFC123", cert.Authenticity.NFCChipID)
}

func TestServiceRecord(t *testing.T) {
	// Test service record creation
	record := ServiceRecord{
		ID:            "SERVICE001",
		Date:          time.Now().Format(time.RFC3339),
		ServiceCenter: "Milan Service Center",
		Type:          "maintenance",
		Description:   "Annual maintenance check",
		Technician:    "Tech001",
		Warranty:      true,
	}

	assert.Equal(t, "SERVICE001", record.ID)
	assert.Equal(t, "maintenance", record.Type)
	assert.True(t, record.Warranty)
}

func TestProductStatusValues(t *testing.T) {
	// Test all product status values
	statuses := []ProductStatus{
		ProductStatusCreated,
		ProductStatusInProduction,
		ProductStatusInTransit,
		ProductStatusInStore,
		ProductStatusSold,
		ProductStatusStolen,
		ProductStatusDestroyed,
	}

	for _, status := range statuses {
		assert.NotEmpty(t, string(status))
	}
}

func TestOwnershipStatusValues(t *testing.T) {
	// Test all ownership status values
	statuses := []OwnershipStatus{
		OwnershipStatusActive,
		OwnershipStatusTransferring,
		OwnershipStatusTransferred,
		OwnershipStatusReported,
		OwnershipStatusLost,
	}

	for _, status := range statuses {
		assert.NotEmpty(t, string(status))
	}
}

func TestTransferStatusValues(t *testing.T) {
	// Test all transfer status values
	statuses := []TransferStatus{
		TransferStatusInitiated,
		TransferStatusPending,
		TransferStatusCompleted,
		TransferStatusCancelled,
		TransferStatusDisputed,
	}

	for _, status := range statuses {
		assert.NotEmpty(t, string(status))
	}
}