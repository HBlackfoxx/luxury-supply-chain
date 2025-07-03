#!/bin/bash

# Stop the luxury supply chain network
# This script stops and removes all Docker containers

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables
source .env

echo -e "${YELLOW}Stopping Luxury Supply Chain Network${NC}"
echo "===================================="

# Function to stop containers
stopContainers() {
    echo -e "${YELLOW}Stopping Docker containers...${NC}"
    
    export COMPOSE_PROJECT_NAME=${BRAND_ID}_${NETWORK_NAME}
    
    docker-compose -f docker/docker-compose.yaml down --volumes --remove-orphans
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Docker containers stopped successfully${NC}"
    else
        echo -e "${RED}Failed to stop some containers${NC}"
    fi
}

# Function to clean up volumes
cleanupVolumes() {
    echo -e "${YELLOW}Cleaning up Docker volumes...${NC}"
    
    # Remove any volumes related to this network
    docker volume ls | grep ${BRAND_ID}_${NETWORK_NAME} | awk '{print $2}' | xargs -r docker volume rm
    
    echo -e "${GREEN}Volumes cleaned up${NC}"
}

# Function to clean up networks
cleanupNetworks() {
    echo -e "${YELLOW}Cleaning up Docker networks...${NC}"
    
    # Remove network if it exists
    docker network rm ${NETWORK_NAME} 2>/dev/null || true
    
    echo -e "${GREEN}Networks cleaned up${NC}"
}

# Function to clean up generated files
cleanupFiles() {
    read -p "Do you want to remove generated crypto materials? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Removing crypto materials...${NC}"
        rm -rf network/organizations/peerOrganizations
        rm -rf network/organizations/ordererOrganizations
        rm -rf network/system-genesis-block
        rm -rf network/channel-artifacts
        echo -e "${GREEN}Crypto materials removed${NC}"
    fi
}

# Main execution
main() {
    echo "Stopping network..."
    echo ""
    
    # Stop containers
    stopContainers
    
    # Clean up volumes
    cleanupVolumes
    
    # Clean up networks
    cleanupNetworks
    
    # Ask about crypto cleanup
    cleanupFiles
    
    echo ""
    echo -e "${GREEN}Network stopped successfully!${NC}"
}

# Run main function
main