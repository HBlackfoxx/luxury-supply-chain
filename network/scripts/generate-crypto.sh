#!/bin/bash

# Generate crypto materials for the luxury supply chain network
# This script creates all certificates and keys needed for the network

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables
source .env

echo -e "${GREEN}Generating Crypto Materials for $BRAND_NAME${NC}"
echo "============================================"

# Function to generate crypto materials
generateCryptoMaterials() {
    echo -e "${YELLOW}Generating certificates using cryptogen tool...${NC}"
    
    # Remove previous crypto material
    rm -rf network/organizations/peerOrganizations
    rm -rf network/organizations/ordererOrganizations
    
    # Generate crypto material using Docker
    docker run --rm \
        -v "$(pwd)/config":/config \
        -v "$(pwd)/network/organizations":/organizations \
        hyperledger/fabric-tools:2.5.5 \
        cryptogen generate --config=/config/crypto-config.yaml --output=/organizations
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to generate crypto material${NC}"
        exit 1
    fi
    
    # Fix permissions if needed
    if [ "$EUID" -ne 0 ]; then
        chmod -R 755 network/organizations 2>/dev/null || true
    fi
    
    echo -e "${GREEN}Crypto materials generated successfully${NC}"
}

# Function to prepare for channel creation
prepareChannelArtifacts() {
    echo -e "${YELLOW}Preparing channel artifacts directory...${NC}"
    
    # Ensure channel-artifacts directory exists
    mkdir -p network/channel-artifacts
    
    echo "Note: Channel genesis block will be created during channel creation with osnadmin"
    echo "Note: Anchor peers are defined in configtx.yaml and will be set automatically"
    
    echo -e "${GREEN}Channel preparation complete${NC}"
}

# Function to initialize Fabric CA
initializeFabricCA() {
    echo -e "${YELLOW}Initializing Fabric CA servers...${NC}"
    
    # Function to init individual CA
    init_ca() {
        local org=$1
        local ca_path="network/organizations/fabric-ca/$org"
        
        echo "Initializing CA for $org..."
        
        # Create directory
        mkdir -p $ca_path
        
        # Skip if already initialized
        if [ -f "$ca_path/ca-cert.pem" ] && [ -f "$ca_path/ca-key.pem" ]; then
            echo "CA already initialized for $org, skipping..."
            return
        fi
        
        # Remove any existing files
        rm -rf $ca_path/*
        
        # Initialize CA using docker
        docker run --rm \
            -v "$(pwd)/$ca_path":/etc/hyperledger/fabric-ca-server \
            -e FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server \
            -e FABRIC_CA_SERVER_CA_NAME=ca-$org \
            hyperledger/fabric-ca:1.5.7 \
            fabric-ca-server init -b admin:adminpw
        
        # Fix permissions if needed
        if [ "$EUID" -ne 0 ]; then
            chmod -R 755 $ca_path 2>/dev/null || true
        fi
    }
    
    # Initialize CAs for all organizations
    init_ca "luxebags"
    init_ca "italianleather"
    init_ca "craftworkshop"
    init_ca "luxuryretail"
    
    echo -e "${GREEN}All CA servers initialized${NC}"
}

# Function to verify crypto materials
verifyCryptoMaterials() {
    echo -e "${YELLOW}Verifying crypto materials...${NC}"
    
    local all_good=true
    
    # Check orderer certs
    if [ ! -f "network/organizations/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/tls/server.crt" ]; then
        echo -e "${RED}✗ Orderer TLS certificates not found${NC}"
        all_good=false
    else
        echo -e "${GREEN}✓ Orderer certificates found${NC}"
    fi
    
    # Check peer organizations
    if [ ! -d "network/organizations/peerOrganizations" ]; then
        echo -e "${RED}✗ Peer organizations not found${NC}"
        all_good=false
    else
        echo -e "${GREEN}✓ Peer organizations found${NC}"
    fi
    
    # Check CA certificates
    for org in luxebags italianleather craftworkshop luxuryretail; do
        if [ -f "network/organizations/fabric-ca/$org/ca-cert.pem" ]; then
            echo -e "${GREEN}✓ CA certificate found for $org${NC}"
        else
            echo -e "${RED}✗ CA certificate missing for $org${NC}"
            all_good=false
        fi
    done
    
    if [ "$all_good" = true ]; then
        echo -e "${GREEN}All crypto materials verified successfully${NC}"
        return 0
    else
        echo -e "${RED}Some crypto materials are missing${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo "Starting crypto material generation process..."
    echo ""
    
    # Check prerequisites
    if [ -f "scripts/utils.sh" ]; then
        source scripts/utils.sh
        check_prerequisites
    fi
    
    # Create necessary directories
    mkdir -p network/organizations
    mkdir -p network/channel-artifacts
    
    # Step 1: Initialize Fabric CA servers FIRST
    initializeFabricCA
    
    # Step 2: Generate crypto materials
    generateCryptoMaterials
    
    # Step 3: Prepare for channel creation
    prepareChannelArtifacts
    
    # Step 4: Verify everything was created
    verifyCryptoMaterials
    
    echo ""
    echo -e "${GREEN}All crypto materials generated successfully!${NC}"
    echo "Next step: Run ./scripts/start-network.sh to start the network"
}

# Run main function
main