#!/bin/bash

# Deploy chaincodes for Luxury Supply Chain
# This script deploys both 2check-consensus and luxury-supply-chain chaincodes

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/utils.sh"

# Configuration
CHANNEL_NAME="luxury-supply-chain"
BRAND_DOMAIN=${BRAND_DOMAIN:-"luxe-bags.luxury"}
FABRIC_VERSION="2.5.5"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/tlsca/tlsca.orderer.${BRAND_DOMAIN}-cert.pem"

# Chaincode paths (relative to the container's mapped volume)
CONSENSUS_CC_PATH="/opt/gopath/src/github.com/hyperledger/fabric/chaincode/2check-consensus"
LUXURY_CC_PATH="/opt/gopath/src/github.com/hyperledger/fabric/chaincode/luxury-supply-chain"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Print functions
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

# Function to package chaincode
package_chaincode() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_PATH=$3
    local PEER_CONTAINER=$4
    
    print_info "Packaging ${CC_NAME} chaincode..."
    
    # Create chaincode package manually
    # The key is that when path is empty in metadata.json,
    # the chaincode files must be at the root of code.tar.gz
    docker exec ${PEER_CONTAINER} bash -c "
        # Clean up any previous attempts
        rm -rf /tmp/${CC_NAME}_pkg /tmp/${CC_NAME}.tar.gz
        mkdir -p /tmp/${CC_NAME}_pkg
        
        # Create metadata.json 
        echo '{\"type\":\"golang\",\"label\":\"${CC_NAME}_${CC_VERSION}\"}' > /tmp/${CC_NAME}_pkg/metadata.json
        
        # Create src directory and copy chaincode there
        mkdir -p /tmp/${CC_NAME}_pkg/src
        cp -r ${CC_PATH}/* /tmp/${CC_NAME}_pkg/src/
        
        # Create code.tar.gz with src directory
        cd /tmp/${CC_NAME}_pkg && tar -czf code.tar.gz src
        
        # Create the final package
        cd /tmp/${CC_NAME}_pkg && tar -czf /tmp/${CC_NAME}.tar.gz metadata.json code.tar.gz
        
        # Debug output
        echo 'Package created. Checking structure:'
        tar -tzf /tmp/${CC_NAME}.tar.gz
        echo 'Contents of code.tar.gz:'
        tar -tzf code.tar.gz | head -10
    "
    
    if [ $? -eq 0 ]; then
        print_success "${CC_NAME} packaged successfully"
    else
        print_error "Failed to package ${CC_NAME}"
        return 1
    fi
}

# Function to install chaincode on a peer
install_chaincode() {
    local CC_NAME=$1
    local PEER_CONTAINER=$2
    local ORG_NAME=$3
    
    print_info "Installing ${CC_NAME} on ${ORG_NAME}..."
    
    # Set admin credentials for the install
    print_info "Creating Docker socket link..."
    docker exec ${PEER_CONTAINER} bash -c "
        if [ ! -e /var/run/docker.sock ]; then
            echo 'Creating symlink for Docker socket...'
            ln -s /host/var/run/docker.sock /var/run/docker.sock
        else
            echo 'Docker socket already exists'
        fi
        ls -la /var/run/docker.sock
    "
    
    print_info "Starting chaincode installation (this may take a few minutes)..."
    # Install chaincode
    docker exec \
        -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        ${PEER_CONTAINER} peer lifecycle chaincode install /tmp/${CC_NAME}.tar.gz
    
    if [ $? -eq 0 ]; then
        print_success "${CC_NAME} installed on ${ORG_NAME}"
    else
        print_error "Failed to install ${CC_NAME} on ${ORG_NAME}"
        return 1
    fi
}

# Function to get package ID
get_package_id() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local PEER_CONTAINER=$3
    local ORG_NAME=$4
    
    local PACKAGE_ID=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        ${PEER_CONTAINER} peer lifecycle chaincode queryinstalled 2>&1 | grep "${CC_NAME}_${CC_VERSION}" | tail -1 | awk -F'[, ]+' '{print $3}')
    
    if [ -z "$PACKAGE_ID" ]; then
        print_error "Failed to get package ID for ${CC_NAME}"
        return 1
    fi
    
    echo "$PACKAGE_ID"
}

# Function to approve chaincode for org
approve_chaincode() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_SEQUENCE=$3
    local PACKAGE_ID=$4
    local PEER_CONTAINER=$5
    local ORG_NAME=$6
    
    print_info "Approving ${CC_NAME} for ${ORG_NAME}..."
    
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        ${PEER_CONTAINER} peer lifecycle chaincode approveformyorg \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
        --tls \
        --cafile ${ORDERER_CA} \
        --channelID ${CHANNEL_NAME} \
        --name ${CC_NAME} \
        --version ${CC_VERSION} \
        --package-id ${PACKAGE_ID} \
        --sequence ${CC_SEQUENCE}
    
    if [ $? -eq 0 ]; then
        print_success "${CC_NAME} approved for ${ORG_NAME}"
    else
        print_error "Failed to approve ${CC_NAME} for ${ORG_NAME}"
        return 1
    fi
}

# Function to check commit readiness
check_commit_readiness() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_SEQUENCE=$3
    local PEER_CONTAINER=$4
    local ORG_NAME=$5
    
    print_info "Checking commit readiness for ${CC_NAME}..."
    
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        ${PEER_CONTAINER} peer lifecycle chaincode checkcommitreadiness \
        --channelID ${CHANNEL_NAME} \
        --name ${CC_NAME} \
        --version ${CC_VERSION} \
        --sequence ${CC_SEQUENCE} \
        --output json
}

# Function to commit chaincode
commit_chaincode() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_SEQUENCE=$3
    local PEER_CONTAINER=$4
    local ORG_NAME=$5
    
    print_info "Committing ${CC_NAME} to channel..."
    
    # Get the project root
    local PROJECT_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
    
    # Copy all TLS certificates to the committing peer container temporarily
    print_info "Preparing TLS certificates for commit..."
    docker exec ${PEER_CONTAINER} mkdir -p /tmp/tls-certs
    
    # Copy each org's TLS certificate to the container
    docker cp "${PROJECT_ROOT}/generated-test/network/organizations/peerOrganizations/luxebags.${BRAND_DOMAIN}/tlsca/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem" \
        ${PEER_CONTAINER}:/tmp/tls-certs/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem
    docker cp "${PROJECT_ROOT}/generated-test/network/organizations/peerOrganizations/italianleather.${BRAND_DOMAIN}/tlsca/tlsca.italianleather.${BRAND_DOMAIN}-cert.pem" \
        ${PEER_CONTAINER}:/tmp/tls-certs/tlsca.italianleather.${BRAND_DOMAIN}-cert.pem
    docker cp "${PROJECT_ROOT}/generated-test/network/organizations/peerOrganizations/craftworkshop.${BRAND_DOMAIN}/tlsca/tlsca.craftworkshop.${BRAND_DOMAIN}-cert.pem" \
        ${PEER_CONTAINER}:/tmp/tls-certs/tlsca.craftworkshop.${BRAND_DOMAIN}-cert.pem
    docker cp "${PROJECT_ROOT}/generated-test/network/organizations/peerOrganizations/luxuryretail.${BRAND_DOMAIN}/tlsca/tlsca.luxuryretail.${BRAND_DOMAIN}-cert.pem" \
        ${PEER_CONTAINER}:/tmp/tls-certs/tlsca.luxuryretail.${BRAND_DOMAIN}-cert.pem
    
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_NAME}.${BRAND_DOMAIN}/users/Admin@${ORG_NAME}.${BRAND_DOMAIN}/msp \
        ${PEER_CONTAINER} peer lifecycle chaincode commit \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
        --tls \
        --cafile ${ORDERER_CA} \
        --channelID ${CHANNEL_NAME} \
        --name ${CC_NAME} \
        --version ${CC_VERSION} \
        --sequence ${CC_SEQUENCE} \
        --peerAddresses peer0.luxebags.${BRAND_DOMAIN}:7051 \
        --tlsRootCertFiles /tmp/tls-certs/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem \
        --peerAddresses peer0.italianleather.${BRAND_DOMAIN}:9051 \
        --tlsRootCertFiles /tmp/tls-certs/tlsca.italianleather.${BRAND_DOMAIN}-cert.pem \
        --peerAddresses peer0.craftworkshop.${BRAND_DOMAIN}:10051 \
        --tlsRootCertFiles /tmp/tls-certs/tlsca.craftworkshop.${BRAND_DOMAIN}-cert.pem \
        --peerAddresses peer0.luxuryretail.${BRAND_DOMAIN}:11051 \
        --tlsRootCertFiles /tmp/tls-certs/tlsca.luxuryretail.${BRAND_DOMAIN}-cert.pem
    
    local COMMIT_RESULT=$?
    
    # Clean up temporary TLS certificates
    docker exec ${PEER_CONTAINER} rm -rf /tmp/tls-certs
    
    if [ $COMMIT_RESULT -eq 0 ]; then
        print_success "${CC_NAME} committed successfully"
    else
        print_error "Failed to commit ${CC_NAME}"
        return 1
    fi
}

# Function to deploy a chaincode across all organizations
deploy_chaincode() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_SEQUENCE=$3
    local CC_PATH=$4
    
    print_info "========================================="
    print_info "Deploying ${CC_NAME} v${CC_VERSION}"
    print_info "========================================="
    
    # Define peer containers (using simple variables instead of associative array)
    PEER_LUXEBAGS="peer0.luxebags.${BRAND_DOMAIN}"
    PEER_ITALIANLEATHER="peer0.italianleather.${BRAND_DOMAIN}"
    PEER_CRAFTWORKSHOP="peer0.craftworkshop.${BRAND_DOMAIN}"
    PEER_LUXURYRETAIL="peer0.luxuryretail.${BRAND_DOMAIN}"
    
    # Package chaincode ONCE on the first peer
    print_info "Packaging ${CC_NAME} chaincode once..."
    package_chaincode ${CC_NAME} ${CC_VERSION} ${CC_PATH} ${PEER_LUXEBAGS}
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Copy the package from luxebags to other peers
    print_info "Copying chaincode package to other peers..."
    for peer in ${PEER_ITALIANLEATHER} ${PEER_CRAFTWORKSHOP} ${PEER_LUXURYRETAIL}; do
        print_info "Copying package to ${peer}..."
        docker exec ${PEER_LUXEBAGS} cat /tmp/${CC_NAME}.tar.gz | docker exec -i ${peer} bash -c "cat > /tmp/${CC_NAME}.tar.gz"
    done
    
    # Install the same package on all peers
    install_chaincode ${CC_NAME} ${PEER_LUXEBAGS} "luxebags"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    install_chaincode ${CC_NAME} ${PEER_ITALIANLEATHER} "italianleather"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    install_chaincode ${CC_NAME} ${PEER_CRAFTWORKSHOP} "craftworkshop"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    install_chaincode ${CC_NAME} ${PEER_LUXURYRETAIL} "luxuryretail"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Get package ID from first peer
    PACKAGE_ID=$(get_package_id ${CC_NAME} ${CC_VERSION} ${PEER_LUXEBAGS} "luxebags")
    if [ -z "$PACKAGE_ID" ]; then
        return 1
    fi
    
    print_info "Package ID: ${PACKAGE_ID}"
    
    # Approve for all organizations
    approve_chaincode ${CC_NAME} ${CC_VERSION} ${CC_SEQUENCE} ${PACKAGE_ID} ${PEER_LUXEBAGS} "luxebags"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    approve_chaincode ${CC_NAME} ${CC_VERSION} ${CC_SEQUENCE} ${PACKAGE_ID} ${PEER_ITALIANLEATHER} "italianleather"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    approve_chaincode ${CC_NAME} ${CC_VERSION} ${CC_SEQUENCE} ${PACKAGE_ID} ${PEER_CRAFTWORKSHOP} "craftworkshop"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    approve_chaincode ${CC_NAME} ${CC_VERSION} ${CC_SEQUENCE} ${PACKAGE_ID} ${PEER_LUXURYRETAIL} "luxuryretail"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Check commit readiness
    check_commit_readiness ${CC_NAME} ${CC_VERSION} ${CC_SEQUENCE} ${PEER_LUXEBAGS} "luxebags"
    
    # Commit chaincode
    commit_chaincode ${CC_NAME} ${CC_VERSION} ${CC_SEQUENCE} ${PEER_LUXEBAGS} "luxebags"
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    print_success "${CC_NAME} deployed successfully!"
    return 0
}

# Main deployment process
main() {
    print_info "Starting chaincode deployment process..."
    
    # Check if network is running
    if ! docker ps | grep -q "peer0.luxebags"; then
        print_error "Fabric network is not running. Please start the network first."
        exit 1
    fi
    
    # Get the project root
    PROJECT_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
    
    # First, we need to prepare the chaincode
    print_info "Preparing chaincode..."
    
    # Build dependencies using a temporary Go container
    print_info "Building chaincode dependencies..."
    
    # Create temporary directory for building
    TEMP_BUILD_DIR="/tmp/chaincode-build-$$"
    mkdir -p "${TEMP_BUILD_DIR}"
    
    # Copy chaincode to temp directory
    cp -r "${PROJECT_ROOT}/chaincode" "${TEMP_BUILD_DIR}/"
    
    # Build dependencies in a Go container
    docker run --rm \
        -v "${TEMP_BUILD_DIR}/chaincode":/chaincode \
        -w /chaincode \
        golang:1.20 \
        bash -c "
            echo 'Building 2check-consensus dependencies...' && \
            cd 2check-consensus && go mod vendor && \
            echo 'Building luxury-supply-chain dependencies...' && \
            cd ../luxury-supply-chain && go mod vendor
        "
    
    if [ $? -ne 0 ]; then
        print_error "Failed to build chaincode dependencies"
        rm -rf "${TEMP_BUILD_DIR}"
        exit 1
    fi
    
    # Copy the prepared chaincode to peer containers
    for peer in peer0.luxebags.${BRAND_DOMAIN} peer0.italianleather.${BRAND_DOMAIN} peer0.craftworkshop.${BRAND_DOMAIN} peer0.luxuryretail.${BRAND_DOMAIN}; do
        print_info "Copying prepared chaincode to ${peer}..."
        docker cp "${TEMP_BUILD_DIR}/chaincode" ${peer}:/opt/gopath/src/github.com/hyperledger/fabric/
    done
    
    # Clean up temp directory
    rm -rf "${TEMP_BUILD_DIR}"
    
    print_success "Chaincode dependencies built successfully"
    
    # Deploy 2check-consensus first
    deploy_chaincode "2check-consensus" "1.0" "1" ${CONSENSUS_CC_PATH}
    if [ $? -ne 0 ]; then
        print_error "Failed to deploy 2check-consensus"
        exit 1
    fi
    
    # Initialize 2check-consensus
    print_info "Waiting for chaincode to be ready..."
    sleep 10
    
    print_info "Initializing 2check-consensus..."
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
        peer0.luxebags.${BRAND_DOMAIN} peer chaincode invoke \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
        --tls \
        --cafile ${ORDERER_CA} \
        -C ${CHANNEL_NAME} \
        -n 2check-consensus \
        --peerAddresses peer0.luxebags.${BRAND_DOMAIN}:7051 \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/tlsca/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem \
        -c '{"function":"InitLedger","Args":[]}'
    
    if [ $? -ne 0 ]; then
        print_warn "InitLedger failed, trying without initialization..."
        print_info "Chaincode may not require initialization, continuing..."
    fi
    
    # Deploy luxury-supply-chain
    deploy_chaincode "luxury-supply-chain" "1.0" "1" ${LUXURY_CC_PATH}
    if [ $? -ne 0 ]; then
        print_error "Failed to deploy luxury-supply-chain"
        exit 1
    fi
    
    # Initialize luxury-supply-chain
    print_info "Initializing luxury-supply-chain..."
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
        peer0.luxebags.${BRAND_DOMAIN} peer chaincode invoke \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
        --tls \
        --cafile ${ORDERER_CA} \
        -C ${CHANNEL_NAME} \
        -n luxury-supply-chain \
        --peerAddresses peer0.luxebags.${BRAND_DOMAIN}:7051 \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/tlsca/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem \
        -c '{"function":"SupplyChainContract:InitLedger","Args":[]}'
    
    print_success "All chaincodes deployed successfully!"
    
    # Test the deployment
    print_info "Testing deployment with sample product creation..."
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
        peer0.luxebags.${BRAND_DOMAIN} peer chaincode invoke \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
        --tls \
        --cafile ${ORDERER_CA} \
        -C ${CHANNEL_NAME} \
        -n luxury-supply-chain \
        --peerAddresses peer0.luxebags.${BRAND_DOMAIN}:7051 \
        --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/tlsca/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem \
        -c '{"function":"SupplyChainContract:CreateProduct","Args":["TEST001","LuxeBags","Test Product","handbag","SN-TEST-001"]}'
    
    if [ $? -eq 0 ]; then
        print_success "Test product created successfully!"
    fi
    
    echo ""
    echo "================================================================"
    echo "          Chaincode Deployment Complete! 🎉"
    echo "================================================================"
    echo ""
    echo "Deployed Chaincodes:"
    echo "  ✓ 2check-consensus v1.0"
    echo "  ✓ luxury-supply-chain v1.0"
    echo ""
    echo "Channel: ${CHANNEL_NAME}"
    echo ""
    echo "Next Steps:"
    echo "1. Test B2B transfers with consensus"
    echo "2. Configure backend gateway services"
    echo "3. Implement customer ownership flows"
    echo ""
    echo "Example Commands:"
    echo ""
    echo "Create a product:"
    echo "docker exec peer0.luxebags.${BRAND_DOMAIN} peer chaincode invoke -C ${CHANNEL_NAME} -n luxury-supply-chain \\"
    echo "  -c '{\"function\":\"SupplyChainContract:CreateProduct\",\"Args\":[\"PROD001\",\"LuxeBags\",\"Elite Handbag\",\"handbag\",\"SN123456\"]}'"
    echo ""
    echo "Initiate transfer with consensus:"
    echo "docker exec peer0.luxebags.${BRAND_DOMAIN} peer chaincode invoke -C ${CHANNEL_NAME} -n luxury-supply-chain \\"
    echo "  -c '{\"function\":\"SupplyChainContract:InitiateTransferWithConsensus\",\"Args\":[\"TRANSFER001\",\"PROD001\",\"italianleather\",\"BRAND_TO_SUPPLIER\"]}'"
    echo ""
    echo "================================================================"
}

# Run main function
main "$@"