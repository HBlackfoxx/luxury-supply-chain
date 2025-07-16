#!/bin/bash

# Deploy script for Luxury Supply Chain chaincode
# Compatible with Hyperledger Fabric 2.5.5

set -e

# Configuration
CHAINCODE_NAME="luxury-supply-chain"
CHAINCODE_VERSION="1.0"
CHAINCODE_SEQUENCE="1"
CHANNEL_NAME="luxurychannel"
CHAINCODE_PATH="."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if we're in the right directory
if [ ! -f "go.mod" ]; then
    print_error "Please run this script from the chaincode directory"
    exit 1
fi

# Function to set environment for each org
setGlobals() {
    local ORG=$1
    export CORE_PEER_TLS_ENABLED=true
    export ORDERER_CA=${PWD}/../../generated-test/network/organizations/ordererOrganizations/orderer.com/tlsca/tlsca.orderer.com-cert.pem
    export PEER_ORG_CA=${PWD}/../../generated-test/network/organizations/peerOrganizations/${ORG}.com/tlsca/tlsca.${ORG}.com-cert.pem
    
    if [ "$ORG" == "luxebags" ]; then
        export CORE_PEER_LOCALMSPID="LuxebagsMSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=$PEER_ORG_CA
        export CORE_PEER_MSPCONFIGPATH=${PWD}/../../generated-test/network/organizations/peerOrganizations/luxebags.com/users/Admin@luxebags.com/msp
        export CORE_PEER_ADDRESS=localhost:7051
    elif [ "$ORG" == "italianleather" ]; then
        export CORE_PEER_LOCALMSPID="ItalianleatherMSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=$PEER_ORG_CA
        export CORE_PEER_MSPCONFIGPATH=${PWD}/../../generated-test/network/organizations/peerOrganizations/italianleather.com/users/Admin@italianleather.com/msp
        export CORE_PEER_ADDRESS=localhost:8051
    elif [ "$ORG" == "craftworkshop" ]; then
        export CORE_PEER_LOCALMSPID="CraftworkshopMSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=$PEER_ORG_CA
        export CORE_PEER_MSPCONFIGPATH=${PWD}/../../generated-test/network/organizations/peerOrganizations/craftworkshop.com/users/Admin@craftworkshop.com/msp
        export CORE_PEER_ADDRESS=localhost:9051
    elif [ "$ORG" == "luxuryretail" ]; then
        export CORE_PEER_LOCALMSPID="LuxuryretailMSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=$PEER_ORG_CA
        export CORE_PEER_MSPCONFIGPATH=${PWD}/../../generated-test/network/organizations/peerOrganizations/luxuryretail.com/users/Admin@luxuryretail.com/msp
        export CORE_PEER_ADDRESS=localhost:10051
    fi
}

# Step 1: Build the chaincode
print_info "Building chaincode..."
GO111MODULE=on go mod vendor
print_success "Chaincode built successfully"

# Step 2: Package the chaincode
print_info "Packaging chaincode..."
peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
    --path ${CHAINCODE_PATH} \
    --lang golang \
    --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}
print_success "Chaincode packaged successfully"

# Step 3: Install chaincode on each peer
for org in luxebags italianleather craftworkshop luxuryretail; do
    print_info "Installing chaincode on ${org}..."
    setGlobals $org
    peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz
    print_success "Chaincode installed on ${org}"
done

# Step 4: Query installed chaincode to get package ID
print_info "Querying installed chaincode..."
setGlobals luxebags
peer lifecycle chaincode queryinstalled >&log.txt
PACKAGE_ID=$(sed -n "/${CHAINCODE_NAME}_${CHAINCODE_VERSION}/{s/^Package ID: //; s/, Label:.*$//; p;}" log.txt)
rm log.txt

if [ -z "$PACKAGE_ID" ]; then
    print_error "Failed to get package ID"
    exit 1
fi

print_info "Package ID: ${PACKAGE_ID}"

# Step 5: Approve chaincode for each org
for org in luxebags italianleather craftworkshop luxuryretail; do
    print_info "Approving chaincode for ${org}..."
    setGlobals $org
    
    peer lifecycle chaincode approveformyorg \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.orderer.com \
        --tls \
        --cafile "$ORDERER_CA" \
        --channelID ${CHANNEL_NAME} \
        --name ${CHAINCODE_NAME} \
        --version ${CHAINCODE_VERSION} \
        --package-id ${PACKAGE_ID} \
        --sequence ${CHAINCODE_SEQUENCE}
    
    print_success "Chaincode approved for ${org}"
done

# Step 6: Check commit readiness
print_info "Checking commit readiness..."
peer lifecycle chaincode checkcommitreadiness \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence ${CHAINCODE_SEQUENCE} \
    --output json

# Step 7: Commit the chaincode
print_info "Committing chaincode to channel..."
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.orderer.com \
    --tls \
    --cafile "$ORDERER_CA" \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version ${CHAINCODE_VERSION} \
    --sequence ${CHAINCODE_SEQUENCE} \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles ${PWD}/../../generated-test/network/organizations/peerOrganizations/luxebags.com/tlsca/tlsca.luxebags.com-cert.pem \
    --peerAddresses localhost:8051 \
    --tlsRootCertFiles ${PWD}/../../generated-test/network/organizations/peerOrganizations/italianleather.com/tlsca/tlsca.italianleather.com-cert.pem \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles ${PWD}/../../generated-test/network/organizations/peerOrganizations/craftworkshop.com/tlsca/tlsca.craftworkshop.com-cert.pem \
    --peerAddresses localhost:10051 \
    --tlsRootCertFiles ${PWD}/../../generated-test/network/organizations/peerOrganizations/luxuryretail.com/tlsca/tlsca.luxuryretail.com-cert.pem

print_success "Chaincode committed successfully"

# Step 8: Query committed chaincode
print_info "Querying committed chaincode..."
peer lifecycle chaincode querycommitted \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME}

# Step 9: Test chaincode invocation
print_info "Testing chaincode with InitLedger..."
peer chaincode invoke \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.orderer.com \
    --tls \
    --cafile "$ORDERER_CA" \
    -C ${CHANNEL_NAME} \
    -n ${CHAINCODE_NAME} \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles ${PWD}/../../generated-test/network/organizations/peerOrganizations/luxebags.com/tlsca/tlsca.luxebags.com-cert.pem \
    --peerAddresses localhost:8051 \
    --tlsRootCertFiles ${PWD}/../../generated-test/network/organizations/peerOrganizations/italianleather.com/tlsca/tlsca.italianleather.com-cert.pem \
    -c '{"function":"InitLedger","Args":[]}'

print_success "Chaincode deployed and tested successfully!"

echo ""
echo "================================================================"
echo "Luxury Supply Chain Smart Contract Deployed!"
echo "================================================================"
echo ""
echo "Chaincode Name: ${CHAINCODE_NAME}"
echo "Version: ${CHAINCODE_VERSION}"
echo "Channel: ${CHANNEL_NAME}"
echo ""
echo "Available Contracts:"
echo "  - SupplyChainContract: B2B supply chain operations"
echo "  - OwnershipContract: B2C ownership and privacy features"
echo ""
echo "Example Commands:"
echo ""
echo "Create a product:"
echo "peer chaincode invoke -C ${CHANNEL_NAME} -n ${CHAINCODE_NAME} \\"
echo "  -c '{\"function\":\"CreateProduct\",\"Args\":[\"PROD001\",\"LuxeBags\",\"Elite Handbag\",\"handbag\",\"SN123456\"]}'"
echo ""
echo "Query a product:"
echo "peer chaincode query -C ${CHANNEL_NAME} -n ${CHAINCODE_NAME} \\"
echo "  -c '{\"function\":\"GetProduct\",\"Args\":[\"PROD001\"]}'"
echo ""
echo "================================================================"