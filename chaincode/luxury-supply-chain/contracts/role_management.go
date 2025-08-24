package contracts

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// RoleManagementContract handles organization role management
type RoleManagementContract struct {
	contractapi.Contract
}

// InitializeRoles sets up initial organization roles
func (r *RoleManagementContract) InitializeRoles(ctx contractapi.TransactionContextInterface) error {
	// Initialize organization roles
	organizations := []OrganizationInfo{
		{
			MSPID:      "LuxeBagsMSP",
			Name:       "LuxeBags",
			Role:       RoleSuperAdmin,
			AssignedBy: "SYSTEM",
			AssignedAt: time.Now().Format(time.RFC3339),
			IsActive:   true,
		},
		{
			MSPID:      "ItalianLeatherMSP",
			Name:       "Italian Leather",
			Role:       RoleSupplier,
			AssignedBy: "SYSTEM",
			AssignedAt: time.Now().Format(time.RFC3339),
			IsActive:   true,
		},
		{
			MSPID:      "CraftWorkshopMSP",
			Name:       "Craft Workshop",
			Role:       RoleManufacturer,
			AssignedBy: "SYSTEM",
			AssignedAt: time.Now().Format(time.RFC3339),
			IsActive:   true,
		},
		{
			MSPID:      "LuxuryRetailMSP",
			Name:       "Luxury Retail",
			Role:       RoleRetailer,
			AssignedBy: "SYSTEM",
			AssignedAt: time.Now().Format(time.RFC3339),
			IsActive:   true,
		},
	}
	
	// Store organization roles
	for _, org := range organizations {
		orgKey := "org_role_" + org.MSPID
		orgJSON, err := json.Marshal(org)
		if err != nil {
			return fmt.Errorf("failed to marshal organization %s: %v", org.MSPID, err)
		}
		
		err = ctx.GetStub().PutState(orgKey, orgJSON)
		if err != nil {
			return fmt.Errorf("failed to store organization role for %s: %v", org.MSPID, err)
		}
	}
	
	// Also make LuxeBags the warehouse since it has dual role
	warehouseOrg := OrganizationInfo{
		MSPID:      "LuxeBagsMSP",
		Name:       "LuxeBags Warehouse",
		Role:       RoleWarehouse,
		AssignedBy: "SYSTEM",
		AssignedAt: time.Now().Format(time.RFC3339),
		IsActive:   true,
	}
	
	// Store secondary role (warehouse) for LuxeBags
	warehouseKey := "org_secondary_role_LuxeBagsMSP"
	warehouseJSON, err := json.Marshal(warehouseOrg)
	if err != nil {
		return fmt.Errorf("failed to marshal warehouse role: %v", err)
	}
	
	err = ctx.GetStub().PutState(warehouseKey, warehouseJSON)
	if err != nil {
		return fmt.Errorf("failed to store warehouse role: %v", err)
	}
	
	return nil
}

// AssignRole allows super admin to assign roles to organizations
func (r *RoleManagementContract) AssignRole(ctx contractapi.TransactionContextInterface,
	targetMSPID string, role string, organizationName string) error {
	
	// Get caller identity
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get caller identity: %v", err)
	}
	
	// Check if caller is super admin
	callerOrg, err := r.GetOrganizationInfo(ctx, callerMSP)
	if err != nil {
		return fmt.Errorf("failed to get caller organization info: %v", err)
	}
	
	if callerOrg.Role != RoleSuperAdmin {
		return fmt.Errorf("only super admin can assign organization roles")
	}
	
	// Parse the role
	var orgRole OrganizationRole
	switch role {
	case "SUPPLIER":
		orgRole = RoleSupplier
	case "MANUFACTURER":
		orgRole = RoleManufacturer
	case "WAREHOUSE":
		orgRole = RoleWarehouse
	case "RETAILER":
		orgRole = RoleRetailer
	case "SUPER_ADMIN":
		// Only allow super admin to assign super admin role with extra check
		if callerMSP != "LuxeBagsMSP" {
			return fmt.Errorf("cannot assign super admin role")
		}
		orgRole = RoleSuperAdmin
	default:
		return fmt.Errorf("invalid role: %s", role)
	}
	
	// Create or update organization info
	orgInfo := OrganizationInfo{
		MSPID:      targetMSPID,
		Name:       organizationName,
		Role:       orgRole,
		AssignedBy: callerMSP,
		AssignedAt: time.Now().Format(time.RFC3339),
		IsActive:   true,
	}
	
	// Store organization role
	orgKey := "org_role_" + targetMSPID
	orgJSON, err := json.Marshal(orgInfo)
	if err != nil {
		return err
	}
	
	err = ctx.GetStub().PutState(orgKey, orgJSON)
	if err != nil {
		return err
	}
	
	// Emit event
	ctx.GetStub().SetEvent("OrganizationRoleAssigned", orgJSON)
	
	return nil
}

// RevokeRole deactivates an organization's role
func (r *RoleManagementContract) RevokeRole(ctx contractapi.TransactionContextInterface,
	targetMSPID string) error {
	
	// Get caller identity
	callerMSP, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get caller identity: %v", err)
	}
	
	// Check if caller is super admin
	callerOrg, err := r.GetOrganizationInfo(ctx, callerMSP)
	if err != nil {
		return fmt.Errorf("failed to get caller organization info: %v", err)
	}
	
	if callerOrg.Role != RoleSuperAdmin {
		return fmt.Errorf("only super admin can revoke organization roles")
	}
	
	// Cannot revoke super admin's own role
	if targetMSPID == "LuxeBagsMSP" {
		return fmt.Errorf("cannot revoke super admin role")
	}
	
	// Get target organization
	targetOrg, err := r.GetOrganizationInfo(ctx, targetMSPID)
	if err != nil {
		return err
	}
	
	// Deactivate the organization
	targetOrg.IsActive = false
	
	// Store updated organization info
	orgKey := "org_role_" + targetMSPID
	orgJSON, err := json.Marshal(targetOrg)
	if err != nil {
		return err
	}
	
	return ctx.GetStub().PutState(orgKey, orgJSON)
}

// GetOrganizationInfo retrieves organization info including role
func (r *RoleManagementContract) GetOrganizationInfo(ctx contractapi.TransactionContextInterface,
	mspID string) (*OrganizationInfo, error) {
	
	orgKey := "org_role_" + mspID
	orgJSON, err := ctx.GetStub().GetState(orgKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read organization info: %v", err)
	}
	
	if orgJSON == nil {
		return nil, fmt.Errorf("organization %s not found", mspID)
	}
	
	var orgInfo OrganizationInfo
	err = json.Unmarshal(orgJSON, &orgInfo)
	if err != nil {
		return nil, err
	}
	
	return &orgInfo, nil
}

// GetOrganizationRole retrieves just the role of an organization
func (r *RoleManagementContract) GetOrganizationRole(ctx contractapi.TransactionContextInterface,
	mspID string) (OrganizationRole, error) {
	
	orgInfo, err := r.GetOrganizationInfo(ctx, mspID)
	if err != nil {
		// Check secondary role for LuxeBags (warehouse)
		if mspID == "LuxeBagsMSP" {
			secondaryKey := "org_secondary_role_LuxeBagsMSP"
			secondaryJSON, _ := ctx.GetStub().GetState(secondaryKey)
			if secondaryJSON != nil {
				var secondaryOrg OrganizationInfo
				json.Unmarshal(secondaryJSON, &secondaryOrg)
				return secondaryOrg.Role, nil
			}
		}
		return "", fmt.Errorf("organization role not found for %s", mspID)
	}
	
	return orgInfo.Role, nil
}

// GetAllOrganizations retrieves all registered organizations and their roles
func (r *RoleManagementContract) GetAllOrganizations(ctx contractapi.TransactionContextInterface) ([]*OrganizationInfo, error) {
	// Query all organization roles
	resultsIterator, err := ctx.GetStub().GetStateByRange("org_role_", "org_role_~")
	if err != nil {
		return nil, fmt.Errorf("failed to query organizations: %v", err)
	}
	defer resultsIterator.Close()
	
	var organizations []*OrganizationInfo
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		
		var orgInfo OrganizationInfo
		err = json.Unmarshal(queryResponse.Value, &orgInfo)
		if err != nil {
			continue
		}
		
		if orgInfo.IsActive {
			organizations = append(organizations, &orgInfo)
		}
	}
	
	return organizations, nil
}

// GetOrganizationsByRole retrieves all organizations with a specific role
func (r *RoleManagementContract) GetOrganizationsByRole(ctx contractapi.TransactionContextInterface,
	role string) ([]*OrganizationInfo, error) {
	
	// Parse the role
	var targetRole OrganizationRole
	switch role {
	case "SUPPLIER":
		targetRole = RoleSupplier
	case "MANUFACTURER":
		targetRole = RoleManufacturer
	case "WAREHOUSE":
		targetRole = RoleWarehouse
	case "RETAILER":
		targetRole = RoleRetailer
	case "SUPER_ADMIN":
		targetRole = RoleSuperAdmin
	default:
		return nil, fmt.Errorf("invalid role: %s", role)
	}
	
	// Get all organizations
	allOrgs, err := r.GetAllOrganizations(ctx)
	if err != nil {
		return nil, err
	}
	
	// Filter by role
	var filteredOrgs []*OrganizationInfo
	for _, org := range allOrgs {
		if org.Role == targetRole && org.IsActive {
			filteredOrgs = append(filteredOrgs, org)
		}
	}
	
	// Also check secondary roles (for LuxeBags warehouse)
	if targetRole == RoleWarehouse {
		secondaryKey := "org_secondary_role_LuxeBagsMSP"
		secondaryJSON, _ := ctx.GetStub().GetState(secondaryKey)
		if secondaryJSON != nil {
			var secondaryOrg OrganizationInfo
			json.Unmarshal(secondaryJSON, &secondaryOrg)
			if secondaryOrg.IsActive {
				filteredOrgs = append(filteredOrgs, &secondaryOrg)
			}
		}
	}
	
	return filteredOrgs, nil
}

// CheckPermission checks if an organization has permission for a specific action based on role
func (r *RoleManagementContract) CheckPermission(ctx contractapi.TransactionContextInterface,
	mspID string, action string) (bool, error) {
	
	orgInfo, err := r.GetOrganizationInfo(ctx, mspID)
	if err != nil {
		return false, err
	}
	
	if !orgInfo.IsActive {
		return false, fmt.Errorf("organization %s is not active", mspID)
	}
	
	// Define permissions based on roles
	permissions := map[OrganizationRole][]string{
		RoleSuperAdmin: {
			"ALL", // Super admin can do everything
		},
		RoleSupplier: {
			"CREATE_MATERIAL",
			"TRANSFER_MATERIAL",
			"CONFIRM_SENT",
			"CONFIRM_RECEIVED",
			"VIEW_INVENTORY",
		},
		RoleManufacturer: {
			"CREATE_BATCH",
			"CREATE_PRODUCT",
			"TRANSFER_BATCH",
			"TRANSFER_PRODUCT",
			"CONFIRM_SENT",
			"CONFIRM_RECEIVED",
			"CREATE_BIRTH_CERTIFICATE",
		},
		RoleWarehouse: {
			"TRANSFER_BATCH",
			"TRANSFER_PRODUCT",
			"CONFIRM_SENT",
			"CONFIRM_RECEIVED",
			"VIEW_INVENTORY",
			"UPDATE_LOCATION",
			"ADD_SERVICE_RECORD",
		},
		RoleRetailer: {
			"TRANSFER_PRODUCT",
			"CONFIRM_SENT",
			"CONFIRM_RECEIVED",
			"TAKE_OWNERSHIP",
			"VIEW_PRODUCT",
			"VERIFY_PRODUCT",
			"ADD_SERVICE_RECORD",
		},
	}
	
	// Check if role has permission
	rolePermissions, exists := permissions[orgInfo.Role]
	if !exists {
		return false, fmt.Errorf("unknown role: %s", orgInfo.Role)
	}
	
	// Super admin can do everything
	if orgInfo.Role == RoleSuperAdmin {
		return true, nil
	}
	
	// Check specific permission
	for _, perm := range rolePermissions {
		if perm == action {
			return true, nil
		}
	}
	
	return false, nil
}