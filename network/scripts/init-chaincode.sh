#!/bin/bash

# Initialize chaincode roles and ledger
# This script runs from within the Docker network to properly initialize the chaincode

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CHANNEL_NAME="luxury-supply-chain"
CHAINCODE_NAME="luxury-supply-chain"
BRAND_DOMAIN="luxe-bags.luxury"
ORDERER_ADDRESS="orderer1.orderer.${BRAND_DOMAIN}:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/tlsca/tlsca.orderer.${BRAND_DOMAIN}-cert.pem"

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Function to invoke chaincode from within a peer container
invoke_chaincode() {
    local PEER_NAME=$1
    local ORG_NAME=$2
    local FUNCTION=$3
    local ARGS=$4
    
    print_info "Invoking $FUNCTION on $PEER_NAME..."
    
    # Determine the correct port based on organization
    case $ORG_NAME in
        "luxebags")
            PEER_PORT=7051
            ;;
        "italianleather")
            PEER_PORT=9051
            ;;
        "craftworkshop")
            PEER_PORT=10051
            ;;
        "luxuryretail")
            PEER_PORT=11051
            ;;
        *)
            PEER_PORT=7051
            ;;
    esac
    
    docker exec \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        peer0.${ORG_NAME}.${BRAND_DOMAIN} \
        peer chaincode invoke \
        -o ${ORDERER_ADDRESS} \
        --tls \
        --cafile ${ORDERER_CA} \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"${FUNCTION}\",\"Args\":[${ARGS}]}" \
        --peerAddresses peer0.${ORG_NAME}.${BRAND_DOMAIN}:${PEER_PORT} \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/peers/peer0.${ORG_NAME}.${BRAND_DOMAIN}/tls/ca.crt \
        --waitForEvent 2>&1
}

# Function to query chaincode
query_chaincode() {
    local PEER_NAME=$1
    local ORG_NAME=$2
    local FUNCTION=$3
    local ARGS=$4
    
    docker exec \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        peer0.${ORG_NAME}.${BRAND_DOMAIN} \
        peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"${FUNCTION}\",\"Args\":[${ARGS}]}" 2>&1
}

# Main initialization
main() {
    print_info "Starting chaincode initialization..."
    echo "=================================================="
    
    # Step 1: Initialize the ledger (which includes role initialization)
    print_info "Step 1: Initializing ledger and roles..."
    
    # Simple invoke - the endorsement policy will be satisfied automatically
    result=$(docker exec \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
        peer0.luxebags.${BRAND_DOMAIN} \
        peer chaincode invoke \
        -o ${ORDERER_ADDRESS} \
        --tls \
        --cafile ${ORDERER_CA} \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c '{"function":"InitLedger","Args":[]}' 2>&1)
    
    if echo "$result" | grep -q "Error"; then
        # Check if it's already initialized
        if echo "$result" | grep -q "already exists"; then
            print_warn "Ledger already initialized, skipping..."
        else
            print_error "Failed to initialize ledger: $result"
            # Don't exit, continue to verify
        fi
    else
        print_success "Ledger initialized successfully!"
    fi
    
    # Step 2: Verify role initialization
    print_info "Step 2: Verifying role initialization..."
    
    # Check each organization's role
    ORGS=("LuxeBagsMSP" "ItalianLeatherMSP" "CraftWorkshopMSP" "LuxuryRetailMSP")
    ORG_NAMES=("luxebags" "italianleather" "craftworkshop" "luxuryretail")
    
    for i in "${!ORGS[@]}"; do
        MSP_ID="${ORGS[$i]}"
        ORG_NAME="${ORG_NAMES[$i]}"
        
        print_info "Checking role for $MSP_ID..."
        result=$(query_chaincode "peer0.${ORG_NAME}" "${ORG_NAME}" "RoleManagementContract:GetOrganizationInfo" "\"${MSP_ID}\"")
        
        if echo "$result" | grep -q "not found"; then
            print_error "Role not found for $MSP_ID - initialization may have failed"
        else
            # Parse the JSON to show the role
            if echo "$result" | grep -q "SUPPLIER"; then
                print_success "$MSP_ID is configured as SUPPLIER"
            elif echo "$result" | grep -q "MANUFACTURER"; then
                print_success "$MSP_ID is configured as MANUFACTURER"
            elif echo "$result" | grep -q "RETAILER"; then
                print_success "$MSP_ID is configured as RETAILER"
            elif echo "$result" | grep -q "SUPER_ADMIN"; then
                print_success "$MSP_ID is configured as SUPER_ADMIN"
            else
                print_info "Role info for $MSP_ID: $result"
            fi
        fi
    done
    
    echo "=================================================="
    print_success "Chaincode verification complete!"
    echo ""
    print_info "Current status:"
    echo "  - Roles should be initialized for all organizations"
    echo "  - If roles are missing, run InitLedger with proper endorsements"
    echo "  - Check docker logs for detailed error messages"
}

# Check if running as root or with sudo
if [[ $EUID -eq 0 ]]; then
   print_warn "This script is running as root/sudo"
fi

# Run main function
main "$@"