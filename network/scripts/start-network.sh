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
    
    echo -e "${GREEN}Crypto materials found${NC}"
}

# Function to start Docker containers
startContainers() {
    echo -e "${YELLOW}Starting Docker containers...${NC}"
    
    # Export required environment variables
    export IMAGE_TAG=${IMAGE_TAG:-2.5.5}
    export CA_IMAGE_TAG=${CA_IMAGE_TAG:-1.5.7}
    export COMPOSE_PROJECT_NAME=${BRAND_ID}_${NETWORK_NAME}
    export BRAND_DOMAIN=${BRAND_DOMAIN}
    export BRAND_NAME=${BRAND_NAME}
    export BRAND_ID=${BRAND_ID}
    export NETWORK_NAME=${NETWORK_NAME}
    
    echo "Debug: BRAND_DOMAIN = '$BRAND_DOMAIN'"
    echo "Debug: IMAGE_TAG = '$IMAGE_TAG'"
    echo "Debug: CA_IMAGE_TAG = '$CA_IMAGE_TAG'"

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
    local orderer_ready=false
    echo "Checking orderer status..."
    
    # Since osnadmin might not be in PATH, let's check if orderer is healthy by checking logs
    for i in {1..30}; do
        # First check if container is running
        if ! docker ps | grep -q "orderer1.orderer.${BRAND_DOMAIN}"; then
            echo "Orderer container not running, waiting..."
            sleep 2
            continue
        fi
        
        # Check if orderer has started successfully
        if docker logs orderer1.orderer.${BRAND_DOMAIN} 2>&1 | grep -q "Beginning to serve requests"; then
            orderer_ready=true
            echo -e "${GREEN}Orderer is running and serving requests${NC}"
            
            # Try to find osnadmin binary
            echo "Checking for osnadmin binary..."
            if docker exec orderer1.orderer.${BRAND_DOMAIN} which osnadmin 2>/dev/null; then
                echo "osnadmin found, checking admin API..."
                # Try with full path
                docker exec orderer1.orderer.${BRAND_DOMAIN} /usr/local/bin/osnadmin channel list \
                    -o localhost:7053 \
                    --ca-file /var/hyperledger/orderer/tls/ca.crt \
                    --client-cert /var/hyperledger/orderer/tls/server.crt \
                    --client-key /var/hyperledger/orderer/tls/server.key 2>&1 || echo "Note: Admin API requires client auth, this is normal"
            else
                echo "osnadmin not found in container, skipping admin API check"
            fi
            break
        fi
        echo "Waiting for orderer to start... (attempt $i/30)"
        sleep 2
    done
    
    if [ "$orderer_ready" = false ]; then
        echo -e "${RED}Orderer failed to start${NC}"
        echo "Orderer logs:"
        docker logs orderer1.orderer.${BRAND_DOMAIN} 2>&1 | tail -50
        exit 1
    fi
    
    # Get actual container names from docker
    echo "Waiting for peers and databases..."
    
    # List all containers for this project
    CONTAINERS=$(docker ps --filter "label=service=hyperledger-fabric" --format "{{.Names}}")
    
    for container in $CONTAINERS; do
        if [[ $container == peer* ]]; then
            echo "Checking peer: $container..."
            for i in {1..30}; do
                if docker exec $container peer version > /dev/null 2>&1; then
                    echo "✓ $container is ready"
                    break
                fi
                if [ $i -eq 30 ]; then
                    echo "✗ $container failed to start"
                    docker logs $container 2>&1 | tail -20
                    exit 1
                fi
                sleep 2
            done
        elif [[ $container == couchdb* ]]; then
            echo "Checking database: $container..."
            for i in {1..30}; do
                if docker exec $container curl -s http://localhost:5984/ > /dev/null 2>&1; then
                    echo "✓ $container is ready"
                    break
                fi
                if [ $i -eq 30 ]; then
                    echo "✗ $container failed to start"
                    exit 1
                fi
                sleep 2
            done
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
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(${BRAND_ID}|orderer|peer|couchdb|ca_)" || true
    
    echo ""
    echo -e "${YELLOW}Network endpoints:${NC}"
    echo "- Orderer1: localhost:7050 (Admin: 7053)"
    echo "- Orderer2: localhost:8050 (Admin: 8053)"
    echo "- Orderer3: localhost:9050 (Admin: 9053)"
    echo "- Brand Peer0: localhost:7051"
    echo "- Brand Peer1: localhost:8051"
    echo "- CouchDB (Brand Peer0): http://localhost:5984"
    echo "- CA (Brand): http://localhost:7054"
}

# Main execution
main() {
    echo "Starting network initialization..."
    echo ""
    
    # Check prerequisites
    if [ -f "scripts/utils.sh" ]; then
        source scripts/utils.sh
        check_prerequisites
    fi
    
    # Check crypto materials
    checkCryptoMaterials
    
    # Start containers
    startContainers
    
    # Wait for containers
    waitForContainers
    
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