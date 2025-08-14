#!/bin/bash

# Deploy chaincodes as a service (ccaas) for Luxury Supply Chain
# This avoids timeout issues by running chaincode in separate containers
# Uses Fabric 2.5's Chaincode-as-a-Service (ccaas) feature

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
source "$SCRIPT_DIR/utils.sh"

# Configuration
CHANNEL_NAME="luxury-supply-chain"
BRAND_DOMAIN=${BRAND_DOMAIN:-"luxe-bags.luxury"}
FABRIC_VERSION="2.5.5"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/tlsca/tlsca.orderer.${BRAND_DOMAIN}-cert.pem"

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

# Function to start chaincode containers
start_chaincode_containers() {
    print_info "Starting chaincode containers..."
    
    cd "${SCRIPT_DIR}/.."
    docker-compose -f docker-compose-chaincode.yml up -d --build
    
    if [ $? -eq 0 ]; then
        print_success "Chaincode containers started successfully"
        
        # Wait for containers to be ready
        print_info "Waiting for chaincode services to be ready..."
        sleep 10
        
        # Check if containers are running
        docker ps | grep -E "(consensus-chaincode|luxury-chaincode)"
    else
        print_error "Failed to start chaincode containers"
        return 1
    fi
}

# Function to package external chaincode
package_external_chaincode() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_PORT=$3
    local PEER_CONTAINER=$4
    
    print_info "Packaging ${CC_NAME} as external service..."
    
    # Create the connection.json for this chaincode
    # Use the actual container name which is consensus-chaincode or luxury-chaincode
    local CONTAINER_NAME=""
    if [ "$CC_NAME" = "2check-consensus" ]; then
        CONTAINER_NAME="consensus-chaincode"
    elif [ "$CC_NAME" = "luxury-supply-chain" ]; then
        CONTAINER_NAME="luxury-chaincode"
    fi
    
    local CONNECTION_JSON="{
  \"address\": \"${CONTAINER_NAME}:${CC_PORT}\",
  \"dial_timeout\": \"10s\",
  \"tls_required\": false
}"
    
    # Package as external service
    docker exec ${PEER_CONTAINER} bash -c "
        # Clean up any previous attempts
        rm -rf /tmp/${CC_NAME}_pkg /tmp/${CC_NAME}.tar.gz
        mkdir -p /tmp/${CC_NAME}_pkg
        
        # Create metadata.json for Chaincode as a Service (ccaas in Fabric 2.5)
        echo '{\"type\":\"ccaas\",\"label\":\"${CC_NAME}_${CC_VERSION}\"}' > /tmp/${CC_NAME}_pkg/metadata.json
        
        # Create connection.json
        echo '${CONNECTION_JSON}' > /tmp/${CC_NAME}_pkg/connection.json
        
        # For ccaas (Chaincode as a Service), code.tar.gz contains just connection.json
        cd /tmp/${CC_NAME}_pkg && tar -czf code.tar.gz connection.json
        
        # Create the final package with metadata.json and code.tar.gz
        cd /tmp/${CC_NAME}_pkg && tar -czf /tmp/${CC_NAME}.tar.gz metadata.json code.tar.gz
        
        # Debug output
        echo 'External package created. Contents:'
        tar -tzf /tmp/${CC_NAME}.tar.gz
        echo 'Contents of code.tar.gz:'
        tar -tzf code.tar.gz
    "
    
    if [ $? -eq 0 ]; then
        print_success "${CC_NAME} packaged as external service"
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
    
    # Install chaincode package
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
deploy_external_chaincode() {
    local CC_NAME=$1
    local CC_VERSION=$2
    local CC_SEQUENCE=$3
    local CC_PORT=$4
    
    print_info "========================================="
    print_info "Deploying ${CC_NAME} v${CC_VERSION} as external service"
    print_info "========================================="
    
    # Define peer containers
    PEER_LUXEBAGS="peer0.luxebags.${BRAND_DOMAIN}"
    PEER_ITALIANLEATHER="peer0.italianleather.${BRAND_DOMAIN}"
    PEER_CRAFTWORKSHOP="peer0.craftworkshop.${BRAND_DOMAIN}"
    PEER_LUXURYRETAIL="peer0.luxuryretail.${BRAND_DOMAIN}"
    
    # Package chaincode as external service ONCE on the first peer
    print_info "Packaging ${CC_NAME} as external service..."
    package_external_chaincode ${CC_NAME} ${CC_VERSION} ${CC_PORT} ${PEER_LUXEBAGS}
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    # Copy the package from luxebags to other peers
    print_info "Copying chaincode package to other peers..."
    for peer in ${PEER_ITALIANLEATHER} ${PEER_CRAFTWORKSHOP} ${PEER_LUXURYRETAIL}; do
        print_info "Copying package to ${peer}..."
        docker exec ${PEER_LUXEBAGS} cat /tmp/${CC_NAME}.tar.gz | docker exec -i ${peer} bash -c "cat > /tmp/${CC_NAME}.tar.gz"
    done
    
    # Install on all peers
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
    
    # Now start the chaincode container with the correct package ID
    print_info "Starting chaincode container with package ID..."
    local CONTAINER_NAME=""
    if [ "$CC_NAME" = "2check-consensus" ]; then
        CONTAINER_NAME="consensus-chaincode"
    elif [ "$CC_NAME" = "luxury-supply-chain" ]; then
        CONTAINER_NAME="luxury-chaincode"
    fi
    
    # Stop and remove if already running
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    
    # Start with the correct CHAINCODE_ID
    docker run -d \
        --name ${CONTAINER_NAME} \
        --network luxury-supply-chain \
        -e CHAINCODE_SERVER_ADDRESS=0.0.0.0:${CC_PORT} \
        -e CHAINCODE_ID=${PACKAGE_ID} \
        -e CORE_CHAINCODE_LOGGING_LEVEL=info \
        -p ${CC_PORT}:${CC_PORT} \
        ${CONTAINER_NAME}:latest
    
    if [ $? -eq 0 ]; then
        print_success "${CONTAINER_NAME} started with package ID: ${PACKAGE_ID}"
        print_info "Waiting for chaincode to be ready..."
        sleep 5
    else
        print_error "Failed to start ${CONTAINER_NAME}"
        return 1
    fi
    
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
    
    print_success "${CC_NAME} deployed as external service successfully!"
    return 0
}

# Main deployment process
main() {
    print_info "Starting external chaincode deployment process..."
    
    # Check if network is running
    if ! docker ps | grep -q "peer0.luxebags"; then
        print_error "Fabric network is not running. Please start the network first."
        exit 1
    fi
    
    # Build chaincode Docker images first (but don't start them yet)
    print_info "Building chaincode Docker images..."
    cd "${SCRIPT_DIR}/.."
    docker-compose -f docker-compose-chaincode.yml build
    if [ $? -ne 0 ]; then
        print_error "Failed to build chaincode Docker images"
        exit 1
    fi
    print_success "Chaincode Docker images built successfully"
    
    # Deploy 2check-consensus as external service
    # Use sequence 2 since it was already deployed before
    deploy_external_chaincode "2check-consensus" "1.0" "2" "9999"
    if [ $? -ne 0 ]; then
        print_error "Failed to deploy 2check-consensus"
        exit 1
    fi
    
    # Wait a bit for the first chaincode to stabilize
    print_info "Waiting for first chaincode to stabilize..."
    sleep 5
    
    # Deploy luxury-supply-chain as external service
    # Use sequence 2 since it was already deployed before
    deploy_external_chaincode "luxury-supply-chain" "1.0" "2" "9998"
    if [ $? -ne 0 ]; then
        print_error "Failed to deploy luxury-supply-chain"
        exit 1
    fi
    
    # Initialize chaincodes
    print_info "Waiting for chaincodes to be ready..."
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
        print_warn "InitLedger failed for 2check-consensus, it may not require initialization"
    fi
    
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
    
    print_success "All chaincodes deployed as external services successfully!"
    
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
    echo "     External Chaincode Deployment Complete! 🎉"
    echo "================================================================"
    echo ""
    echo "Deployed Chaincodes (as external services):"
    echo "  ✓ 2check-consensus v1.0 (port 9999)"
    echo "  ✓ luxury-supply-chain v1.0 (port 9998)"
    echo ""
    echo "Running Services:"
    docker ps | grep -E "(consensus-chaincode|luxury-chaincode)" | awk '{print "  - "$NF" (container: "$1")"}'
    echo ""
    echo "Channel: ${CHANNEL_NAME}"
    echo ""
    echo "Benefits of External Service Mode:"
    echo "  ✓ No timeout issues during installation"
    echo "  ✓ Easy debugging with container logs"
    echo "  ✓ Independent scaling and updates"
    echo "  ✓ Better resource management"
    echo ""
    echo "Monitor chaincode logs:"
    echo "  docker logs -f consensus-chaincode"
    echo "  docker logs -f luxury-chaincode"
    echo ""
    echo "================================================================"
}

# Run main function
main "$@"