package contracts

import ()

// Product represents a luxury item in the supply chain
type Product struct {
	ID                 string                 `json:"id"`
	BatchID            string                 `json:"batchId"` // Batch this product belongs to
	Brand              string                 `json:"brand"`
	Name               string                 `json:"name"`
	Type               string                 `json:"type"` // handbag, watch, jewelry, etc.
	SerialNumber       string                 `json:"serialNumber"`
	UniqueIdentifier   string                 `json:"uniqueIdentifier"` // Unique ID within batch
	CreatedAt          string                 `json:"createdAt"`
	CurrentOwner       string                 `json:"currentOwner"`
	CurrentLocation    string                 `json:"currentLocation"`
	Status             ProductStatus          `json:"status"`
	IsStolen           bool                   `json:"isStolen"`        // Quick check flag
	StolenDate         string                 `json:"stolenDate"`
	RecoveredDate      string                 `json:"recoveredDate"`
	Materials          []Material             `json:"materials"`
	// QualityCheckpoints removed - quality verified through 2-check consensus
	Metadata           map[string]interface{} `json:"metadata"`
	// Privacy fields
	OwnershipHash string `json:"ownershipHash"` // SHA256 of owner details
}

// DigitalBirthCertificate represents the immutable creation record
type DigitalBirthCertificate struct {
	ProductID          string              `json:"productId"`
	Brand              string              `json:"brand"`
	ManufacturingDate  string           `json:"manufacturingDate"`
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
	QuantityUsed float64   `json:"quantityUsed"` // Amount used in this product/batch
	Verification string    `json:"verification"`
	ReceivedDate string `json:"receivedDate"`
}

// MaterialInventory tracks material ownership and usage per organization
type MaterialInventory struct {
	ID           string  `json:"id"`           // Unique ID: materialID_owner
	MaterialID   string  `json:"materialId"`
	Batch        string  `json:"batch"`        // Batch identifier
	Owner        string  `json:"owner"`        // Current owner (organization)
	Supplier     string  `json:"supplier"`     // Original supplier
	Type         string  `json:"type"`         // Material type
	TotalReceived float64 `json:"totalReceived"` // Total quantity received
	Available    float64 `json:"available"`    // Currently available quantity
	Used         float64 `json:"used"`         // Amount used in products
	Transfers    []MaterialTransferRecord `json:"transfers"` // All transfers of this material
}

// MaterialTransferRecord tracks each transfer of a material
type MaterialTransferRecord struct {
	TransferID   string  `json:"transferId"`
	From         string  `json:"from"`
	To           string  `json:"to"`
	Quantity     float64 `json:"quantity"`
	TransferDate string  `json:"transferDate"`
	Verified     bool    `json:"verified"` // 2-check consensus completed
	Status       string  `json:"status,omitempty"` // DISPUTED, RESOLVED - only set when dispute happens
}

// MaterialRecord is a simplified version for the birth certificate
type MaterialRecord struct {
	Type     string `json:"type"`
	Source   string `json:"source"`
	Supplier string `json:"supplier"`
	Batch    string `json:"batch"`
}

// QualityCheckpoint removed - quality is verified through the 2-check consensus
// When parties confirm sending/receiving, they implicitly verify quality

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
	SecurityHash     string            `json:"securityHash"` // SHA256(password + PIN) for transfer verification
	OwnershipDate    string         `json:"ownershipDate"`
	PurchaseLocation string            `json:"purchaseLocation"`
	PurchasePrice    float64           `json:"-"` // Private, not stored on chain
	TransferCode     string            `json:"transferCode,omitempty"`
	TransferExpiry   string         `json:"transferExpiry,omitempty"`
	Status           OwnershipStatus   `json:"status"`
	ServiceHistory   []ServiceRecord   `json:"serviceHistory"`
	PreviousOwners   []PreviousOwner   `json:"previousOwners"`
}

// PreviousOwner represents historical ownership (privacy preserved)
type PreviousOwner struct {
	OwnerHash     string    `json:"ownerHash"`
	OwnershipDate string `json:"ownershipDate"`
	TransferDate  string `json:"transferDate"`
	TransferType  string    `json:"transferType"` // sale, gift, inheritance
}

// ServiceRecord represents maintenance/service history
type ServiceRecord struct {
	ID            string    `json:"id"`
	Date          string `json:"date"`
	ServiceCenter string    `json:"serviceCenter"`
	Type          string    `json:"type"` // repair, maintenance, authentication
	Description   string    `json:"description"`
	Technician    string    `json:"technician"`
	Warranty      bool      `json:"warranty"`
}

// Transfer represents a B2B transfer in the supply chain
type Transfer struct {
	ID               string                 `json:"id"`
	ProductID        string                 `json:"productId"`  // Can be product ID or batch ID
	From             string                 `json:"from"`
	To               string                 `json:"to"`
	TransferType     TransferType           `json:"transferType"`
	InitiatedAt      string                 `json:"initiatedAt"`
	CompletedAt      string                 `json:"completedAt,omitempty"`
	Status           TransferStatus         `json:"status"`
	ConsensusDetails ConsensusInfo          `json:"consensusDetails"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`  // Additional transfer info
}

// ConsensusInfo contains 2-Check consensus information
type ConsensusInfo struct {
	SenderConfirmed   bool    `json:"senderConfirmed"`
	ReceiverConfirmed bool    `json:"receiverConfirmed"`
	SenderTimestamp   string  `json:"senderTimestamp,omitempty"`
	ReceiverTimestamp string  `json:"receiverTimestamp,omitempty"`
	TimeoutAt         string  `json:"timeoutAt"`
}

// OrganizationRole represents the role of an organization in the supply chain
type OrganizationRole string

const (
	RoleSuperAdmin   OrganizationRole = "SUPER_ADMIN"
	RoleSupplier     OrganizationRole = "SUPPLIER"
	RoleManufacturer OrganizationRole = "MANUFACTURER"
	RoleWarehouse    OrganizationRole = "WAREHOUSE"
	RoleRetailer     OrganizationRole = "RETAILER"
)

// OrganizationInfo stores organization details and role
type OrganizationInfo struct {
	MSPID       string           `json:"mspId"`
	Name        string           `json:"name"`
	Role        OrganizationRole `json:"role"`
	AssignedBy  string           `json:"assignedBy"`
	AssignedAt  string           `json:"assignedAt"`
	IsActive    bool             `json:"isActive"`
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

// ProductBatch represents a batch of products manufactured together
type ProductBatch struct {
	ID               string            `json:"id"`
	Manufacturer     string            `json:"manufacturer"`
	Brand            string            `json:"brand"`
	ProductType      string            `json:"productType"`
	Quantity         int               `json:"quantity"` // Number of products in batch
	ProductIDs       []string          `json:"productIds"` // IDs of individual products
	MaterialsUsed    []MaterialUsage   `json:"materialsUsed"`
	ManufactureDate  string            `json:"manufactureDate"`
	QRCode           string            `json:"qrCode"` // QR code for batch tracking
	CurrentOwner     string            `json:"currentOwner"`
	CurrentLocation  string            `json:"currentLocation"`
	Status           BatchStatus       `json:"status"`
	Metadata         map[string]string `json:"metadata"`
}

// MaterialUsage tracks how much material was used in a batch
type MaterialUsage struct {
	MaterialID   string  `json:"materialId"`
	MaterialType string  `json:"materialType"`
	Supplier     string  `json:"supplier"`
	QuantityUsed float64 `json:"quantityUsed"`
	Batch        string  `json:"batch"` // Material batch number
}

// BatchStatus represents the status of a product batch
type BatchStatus string

const (
	BatchStatusCreated     BatchStatus = "CREATED"
	BatchStatusInTransit   BatchStatus = "IN_TRANSIT"
	BatchStatusAtWarehouse BatchStatus = "AT_WAREHOUSE"
	BatchStatusAtRetailer  BatchStatus = "AT_RETAILER"
	BatchStatusPartial     BatchStatus = "PARTIAL" // Some products sold
	BatchStatusSold        BatchStatus = "SOLD_OUT"
)

type TransferStatus string

const (
	TransferStatusInitiated TransferStatus = "INITIATED"
	TransferStatusPending   TransferStatus = "PENDING"
	TransferStatusCompleted TransferStatus = "COMPLETED"
	TransferStatusCancelled TransferStatus = "CANCELLED"
	TransferStatusDisputed  TransferStatus = "DISPUTED"
)