#!/bin/bash

# CLI container script for invoking chaincode with multiple endorsements
# Uses all organization certificates to satisfy endorsement policy

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
CRYPTO_PATH="/home/hblackfox/luxury-supply-chain/generated-test/network/organizations"
ORDERER_NAME="orderer1.orderer.${BRAND_DOMAIN}"
ORDERER_PORT="7050"

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to invoke chaincode with multi-org endorsements
invoke_with_endorsements() {
    local FUNCTION=$1
    local ARGS=$2
    
    print_info "Invoking $FUNCTION with multi-org endorsements..."
    
    docker run --rm \
        --network luxury-supply-chain \
        -v ${CRYPTO_PATH}:/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_LOCALMSPID=LuxeBagsMSP \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
        -e CORE_PEER_ADDRESS=peer0.luxebags.${BRAND_DOMAIN}:7051 \
        hyperledger/fabric-tools:2.5 \
        peer chaincode invoke \
        -o ${ORDERER_NAME}:${ORDERER_PORT} \
        --tls \
        --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/tls/ca.crt \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"${FUNCTION}\",\"Args\":[${ARGS}]}" \
        --peerAddresses peer0.luxebags.${BRAND_DOMAIN}:7051 \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/peers/peer0.luxebags.${BRAND_DOMAIN}/tls/ca.crt \
        --peerAddresses peer0.italianleather.${BRAND_DOMAIN}:9051 \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/italianleather.${BRAND_DOMAIN}/peers/peer0.italianleather.${BRAND_DOMAIN}/tls/ca.crt \
        --peerAddresses peer0.craftworkshop.${BRAND_DOMAIN}:10051 \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/craftworkshop.${BRAND_DOMAIN}/peers/peer0.craftworkshop.${BRAND_DOMAIN}/tls/ca.crt \
        --waitForEvent
}

# Function to query chaincode
query_chaincode() {
    local FUNCTION=$1
    local ARGS=$2
    local ORG=${3:-luxebags}
    
    # Determine correct MSP ID based on organization
    case $ORG in
        luxebags)
            MSP_ID="LuxeBagsMSP"
            PEER_PORT=7051
            ;;
        italianleather)
            MSP_ID="ItalianLeatherMSP"
            PEER_PORT=9051
            ;;
        craftworkshop)
            MSP_ID="CraftWorkshopMSP"
            PEER_PORT=10051
            ;;
        luxuryretail)
            MSP_ID="LuxuryRetailMSP"
            PEER_PORT=11051
            ;;
        *)
            MSP_ID="LuxeBagsMSP"
            PEER_PORT=7051
            ;;
    esac
    
    docker run --rm \
        --network luxury-supply-chain \
        -v ${CRYPTO_PATH}:/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_LOCALMSPID=${MSP_ID} \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/users/Admin@${ORG}.${BRAND_DOMAIN}/msp \
        -e CORE_PEER_ADDRESS=peer0.${ORG}.${BRAND_DOMAIN}:${PEER_PORT} \
        -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/peers/peer0.${ORG}.${BRAND_DOMAIN}/tls/ca.crt \
        hyperledger/fabric-tools:2.5 \
        peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"${FUNCTION}\",\"Args\":[${ARGS}]}"
}

# Main execution
case "$1" in
    init-roles)
        print_info "Initializing organization roles..."
        invoke_with_endorsements "RoleManagementContract:InitializeRoles" ""
        print_success "Roles initialized!"
        
        # Verify roles
        print_info "Verifying roles..."
        for MSP in LuxeBagsMSP ItalianLeatherMSP CraftWorkshopMSP LuxuryRetailMSP; do
            print_info "Checking $MSP..."
            query_chaincode "RoleManagementContract:GetOrganizationInfo" "\"$MSP\"" || print_error "Failed to get info for $MSP"
        done
        ;;
        
    create-material)
        # Example: ./cli-invoke.sh create-material MAT001 leather Italy BATCH001 premium 100
        shift
        MATERIAL_ID=$1
        TYPE=$2
        SOURCE=$3
        BATCH=$4
        QUALITY=$5
        QUANTITY=$6
        
        print_info "Creating material $MATERIAL_ID..."
        invoke_with_endorsements "SupplyChainContract:CreateMaterialInventory" "\"$MATERIAL_ID\",\"$TYPE\",\"$BATCH\",\"$QUANTITY\""
        print_success "Material created!"
        ;;
        
    query)
        # Example: ./cli-invoke.sh query RoleManagementContract:GetOrganizationInfo '"LuxeBagsMSP"'
        shift
        FUNCTION=$1
        shift
        ARGS=$@
        
        print_info "Querying $FUNCTION..."
        query_chaincode "$FUNCTION" "$ARGS"
        ;;
        
    invoke)
        # Example: ./cli-invoke.sh invoke RoleManagementContract:InitializeRoles ''
        shift
        FUNCTION=$1
        shift
        ARGS=$@
        
        print_info "Invoking $FUNCTION..."
        invoke_with_endorsements "$FUNCTION" "$ARGS"
        ;;
        
    *)
        echo "Usage: $0 {init-roles|create-material|query|invoke}"
        echo ""
        echo "Examples:"
        echo "  $0 init-roles                    - Initialize all organization roles"
        echo "  $0 create-material MAT001 leather Italy BATCH001 premium 100"
        echo "  $0 query RoleManagementContract:GetOrganizationInfo '\"LuxeBagsMSP\"'"
        echo "  $0 invoke RoleManagementContract:InitializeRoles ''"
        exit 1
        ;;
esac