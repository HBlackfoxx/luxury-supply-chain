package contracts

import (
	"time"
)

// Product represents a luxury item in the supply chain
type Product struct {
	ID                 string                 `json:"id"`
	Brand              string                 `json:"brand"`
	Name               string                 `json:"name"`
	Type               string                 `json:"type"` // handbag, watch, jewelry, etc.
	SerialNumber       string                 `json:"serialNumber"`
	CreatedAt          time.Time              `json:"createdAt"`
	CurrentOwner       string                 `json:"currentOwner"`
	CurrentLocation    string                 `json:"currentLocation"`
	Status             ProductStatus          `json:"status"`
	Materials          []Material             `json:"materials"`
	QualityCheckpoints []QualityCheckpoint    `json:"qualityCheckpoints"`
	Metadata           map[string]interface{} `json:"metadata"`
	// Privacy fields
	OwnershipHash string `json:"ownershipHash"` // SHA256 of owner details
}

// DigitalBirthCertificate represents the immutable creation record
type DigitalBirthCertificate struct {
	ProductID          string              `json:"productId"`
	Brand              string              `json:"brand"`
	ManufacturingDate  time.Time           `json:"manufacturingDate"`
	ManufacturingPlace string              `json:"manufacturingPlace"`
	Craftsman          string              `json:"craftsman"`
	Materials          []MaterialRecord    `json:"materials"`
	Authenticity       AuthenticityDetails `json:"authenticity"`
	InitialPhotos      []string            `json:"initialPhotos"` // IPFS hashes
	CertificateHash    string              `json:"certificateHash"`
}

// Material represents raw materials used in the product
type Material struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"` // leather, metal, fabric, etc.
	Source       string    `json:"source"`
	Supplier     string    `json:"supplier"`
	Batch        string    `json:"batch"`
	Verification string    `json:"verification"`
	ReceivedDate time.Time `json:"receivedDate"`
}

// MaterialRecord is a simplified version for the birth certificate
type MaterialRecord struct {
	Type     string `json:"type"`
	Source   string `json:"source"`
	Supplier string `json:"supplier"`
	Batch    string `json:"batch"`
}

// QualityCheckpoint represents quality verification at various stages
type QualityCheckpoint struct {
	ID          string    `json:"id"`
	Stage       string    `json:"stage"`
	Inspector   string    `json:"inspector"`
	Date        time.Time `json:"date"`
	Passed      bool      `json:"passed"`
	Details     string    `json:"details"`
	PhotoProofs []string  `json:"photoProofs"` // IPFS hashes
}

// AuthenticityDetails contains anti-counterfeit information
type AuthenticityDetails struct {
	NFCChipID        string   `json:"nfcChipId"`
	QRCodeData       string   `json:"qrCodeData"`
	HologramID       string   `json:"hologramId"`
	SecurityFeatures []string `json:"securityFeatures"`
}

// Ownership represents customer ownership record
type Ownership struct {
	ProductID        string            `json:"productId"`
	OwnerHash        string            `json:"ownerHash"` // SHA256(email + phone + salt)
	OwnershipDate    time.Time         `json:"ownershipDate"`
	PurchaseLocation string            `json:"purchaseLocation"`
	PurchasePrice    float64           `json:"-"` // Private, not stored on chain
	TransferCode     string            `json:"transferCode,omitempty"`
	TransferExpiry   *time.Time        `json:"transferExpiry,omitempty"`
	Status           OwnershipStatus   `json:"status"`
	ServiceHistory   []ServiceRecord   `json:"serviceHistory"`
	PreviousOwners   []PreviousOwner   `json:"previousOwners"`
}

// PreviousOwner represents historical ownership (privacy preserved)
type PreviousOwner struct {
	OwnerHash     string    `json:"ownerHash"`
	OwnershipDate time.Time `json:"ownershipDate"`
	TransferDate  time.Time `json:"transferDate"`
	TransferType  string    `json:"transferType"` // sale, gift, inheritance
}

// ServiceRecord represents maintenance/service history
type ServiceRecord struct {
	ID            string    `json:"id"`
	Date          time.Time `json:"date"`
	ServiceCenter string    `json:"serviceCenter"`
	Type          string    `json:"type"` // repair, maintenance, authentication
	Description   string    `json:"description"`
	Technician    string    `json:"technician"`
	Warranty      bool      `json:"warranty"`
}

// Transfer represents a B2B transfer in the supply chain
type Transfer struct {
	ID               string         `json:"id"`
	ProductID        string         `json:"productId"`
	From             string         `json:"from"`
	To               string         `json:"to"`
	TransferType     TransferType   `json:"transferType"`
	InitiatedAt      time.Time      `json:"initiatedAt"`
	CompletedAt      *time.Time     `json:"completedAt,omitempty"`
	Status           TransferStatus `json:"status"`
	ConsensusDetails ConsensusInfo  `json:"consensusDetails"`
}

// ConsensusInfo contains 2-Check consensus information
type ConsensusInfo struct {
	SenderConfirmed   bool       `json:"senderConfirmed"`
	ReceiverConfirmed bool       `json:"receiverConfirmed"`
	SenderTimestamp   *time.Time `json:"senderTimestamp,omitempty"`
	ReceiverTimestamp *time.Time `json:"receiverTimestamp,omitempty"`
	TimeoutAt         time.Time  `json:"timeoutAt"`
}

// Enums
type ProductStatus string

const (
	ProductStatusCreated      ProductStatus = "CREATED"
	ProductStatusInProduction ProductStatus = "IN_PRODUCTION"
	ProductStatusInTransit    ProductStatus = "IN_TRANSIT"
	ProductStatusInStore      ProductStatus = "IN_STORE"
	ProductStatusSold         ProductStatus = "SOLD"
	ProductStatusStolen       ProductStatus = "STOLEN"
	ProductStatusDestroyed    ProductStatus = "DESTROYED"
)

type OwnershipStatus string

const (
	OwnershipStatusActive       OwnershipStatus = "ACTIVE"
	OwnershipStatusTransferring OwnershipStatus = "TRANSFERRING"
	OwnershipStatusTransferred  OwnershipStatus = "TRANSFERRED"
	OwnershipStatusReported     OwnershipStatus = "REPORTED_STOLEN"
	OwnershipStatusLost         OwnershipStatus = "LOST"
)

type TransferType string

const (
	TransferTypeSupplyChain TransferType = "SUPPLY_CHAIN"
	TransferTypeOwnership   TransferType = "OWNERSHIP"
	TransferTypeReturn      TransferType = "RETURN"
)

type TransferStatus string

const (
	TransferStatusInitiated TransferStatus = "INITIATED"
	TransferStatusPending   TransferStatus = "PENDING"
	TransferStatusCompleted TransferStatus = "COMPLETED"
	TransferStatusCancelled TransferStatus = "CANCELLED"
	TransferStatusDisputed  TransferStatus = "DISPUTED"
)