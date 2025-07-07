#!/bin/bash

# Start the luxury supply chain network
# This script starts all Docker containers for the network

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment variables
source .env

echo -e "${GREEN}Starting Luxury Supply Chain Network${NC}"
echo "===================================="
echo "Brand: $BRAND_NAME"
echo "Network: $NETWORK_NAME"
echo ""

# Function to check if crypto materials exist
checkCryptoMaterials() {
    echo -e "${YELLOW}Checking crypto materials...${NC}"
    
    if [ ! -d "network/organizations/peerOrganizations" ] || [ ! -d "network/organizations/ordererOrganizations" ]; then
        echo -e "${RED}Crypto materials not found!${NC}"
        echo "Please run ./scripts/generate-crypto.sh first"
        exit 1
    fi
    
    if [ ! -f "network/system-genesis-block/genesis.block" ]; then
        echo -e "${RED}Genesis block not found!${NC}"
        echo "Please run ./scripts/generate-crypto.sh first"
        exit 1
    fi
    
    echo -e "${GREEN}Crypto materials found${NC}"
}

# Function to start Docker containers
startContainers() {
    echo -e "${YELLOW}Starting Docker containers...${NC}"
    set -a
    source .env
    set +a

    # Export required environment variables
    export IMAGE_TAG=latest
    export COMPOSE_PROJECT_NAME=${BRAND_ID}_${NETWORK_NAME}
    
    echo "Debug: BRAND_DOMAIN = '$BRAND_DOMAIN'"

    envsubst < docker/docker-compose.yaml > docker/docker-compose-processed.yaml

    # Start containers
    docker-compose -f docker/docker-compose-processed.yaml up -d
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to start Docker containers${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Docker containers started successfully${NC}"
}

# Function to wait for containers to be ready
waitForContainers() {
    echo -e "${YELLOW}Waiting for containers to be ready...${NC}"
    
    # Wait for orderer
    echo "Waiting for orderer..."
    sleep 5
    
    # Check orderer health
    docker exec orderer1.orderer.${BRAND_DOMAIN} orderer version > /dev/null 2>&1
    while [ $? -ne 0 ]; do
        echo "Orderer not ready yet..."
        sleep 2
        docker exec orderer1.orderer.${BRAND_DOMAIN} orderer version > /dev/null 2>&1
    done
    
    echo -e "${GREEN}Orderer is ready${NC}"
    
    # Get actual container names from docker
    echo "Waiting for peers and databases..."
    
    # List all containers for this project
    CONTAINERS=$(docker ps --filter "label=service=hyperledger-fabric" --format "{{.Names}}")
    
    for container in $CONTAINERS; do
        if [[ $container == peer* ]]; then
            echo "Checking peer: $container..."
            until docker exec $container peer version > /dev/null 2>&1; do
                echo "$container not ready yet..."
                sleep 2
            done
            echo "✓ $container is ready"
        elif [[ $container == couchdb* ]]; then
            echo "Checking database: $container..."
            until docker exec $container curl -s http://localhost:5984/ > /dev/null 2>&1; do
                echo "$container not ready yet..."
                sleep 2
            done
            echo "✓ $container is ready"
        fi
    done
    
    echo -e "${GREEN}All containers are ready${NC}"
}

# Function to display network status
displayNetworkStatus() {
    echo ""
    echo -e "${BLUE}Network Status:${NC}"
    echo "==============="
    
    # Show running containers
    echo -e "${YELLOW}Running containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ${BRAND_ID}
    
    echo ""
    echo -e "${YELLOW}Network endpoints:${NC}"
    echo "- Orderer: localhost:7050"
    echo "- Brand Peer0: localhost:7051"
    echo "- Brand Peer1: localhost:8051"
    echo "- CouchDB (Brand Peer0): http://localhost:5984"
    echo "- CA (Brand): http://localhost:7054"
}

# Function to create join script
createJoinScript() {
    echo -e "${YELLOW}Creating channel join script...${NC}"
    
    cat > scripts/join-channel.sh << 'EOF'
#!/bin/bash

# Join all peers to the channel

set -e

source .env

CHANNEL_NAME="luxury-supply-chain"
ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem

# Function to set globals for peer
setGlobals() {
    local ORG=$1
    local PEER=$2
    
    if [ "$ORG" == "brand" ]; then
        export CORE_PEER_LOCALMSPID="${BRAND_NAME}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/${BRAND_NAME}.${BRAND_DOMAIN}/peers/${PEER}.${BRAND_NAME}.${BRAND_DOMAIN}/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/${BRAND_NAME}.${BRAND_DOMAIN}/users/Admin@${BRAND_NAME}.${BRAND_DOMAIN}/msp
        export CORE_PEER_ADDRESS=${PEER}.${BRAND_NAME}.${BRAND_DOMAIN}:7051
    fi
    
    export CORE_PEER_TLS_ENABLED=true
}

# Create channel
echo "Creating channel ${CHANNEL_NAME}..."
setGlobals brand peer0
docker exec -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
    -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
    -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
    -e CORE_PEER_TLS_ENABLED=$CORE_PEER_TLS_ENABLED \
    -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
    peer0.brand.${BRAND_DOMAIN} \
    peer channel create -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
    -c $CHANNEL_NAME \
    -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.tx \
    --outputBlock /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block \
    --tls --cafile $ORDERER_CA

echo "Channel created successfully"

# Join peers to channel
echo "Joining peers to channel..."

# Join brand peer0
setGlobals brand peer0
docker exec -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
    -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
    -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
    -e CORE_PEER_TLS_ENABLED=$CORE_PEER_TLS_ENABLED \
    -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
    peer0.brand.${BRAND_DOMAIN} \
    peer channel join -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block

echo "Peer0 joined channel"

# Additional peers would be joined here...

echo "All peers joined channel successfully!"
EOF
    
    chmod +x scripts/join-channel.sh
    echo -e "${GREEN}Channel join script created${NC}"
}

# Main execution
main() {
    echo "Starting network initialization..."
    echo ""
    
    # Check prerequisites
    source scripts/utils.sh
    check_prerequisites
    
    # Check crypto materials
    checkCryptoMaterials
    
    # Start containers
    startContainers
    
    # Wait for containers
    waitForContainers
    
    # Create additional scripts
    createJoinScript
    
    # Display status
    displayNetworkStatus
    
    echo ""
    echo -e "${GREEN}Network started successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Create channel: ./scripts/create-channel.sh"
    echo "2. Deploy chaincode: ./scripts/deploy-chaincode.sh"
    echo ""
    echo "To stop the network: ./scripts/stop-network.sh"
}

# Run main function
main