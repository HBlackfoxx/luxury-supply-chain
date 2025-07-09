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

# Function to generate channel transaction
generateChannelTx() {
    echo -e "${YELLOW}Generating channel configuration transaction...${NC}"
    
    # Get channel name from environment or use default
    CHANNEL_NAME=${CHANNEL_NAME:-"luxury-supply-chain"}
    
    # Ensure channel-artifacts directory exists
    mkdir -p network/channel-artifacts
    
    # Create a temporary configtx.yaml with correct paths for Docker
    cp config/configtx.yaml config/configtx-docker.yaml
    
    # Replace the paths in the temporary file to work with Docker mounts
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' 's|../network/organizations|/organizations|g' config/configtx-docker.yaml
    else
        # Linux
        sed -i 's|../network/organizations|/organizations|g' config/configtx-docker.yaml
    fi
    
    # Generate channel configuration transaction using Docker
    docker run --rm \
      -v "$(pwd)/config":/config \
      -v "$(pwd)/network/organizations":/organizations \
      -v "$(pwd)/network/channel-artifacts":/channel-artifacts \
      -e FABRIC_CFG_PATH=/config \
      hyperledger/fabric-tools:2.5.5 \
      configtxgen -configPath /config \
                  -profile LuxurySupplyChain \
                  -outputCreateChannelTx /channel-artifacts/${CHANNEL_NAME}.tx \
                  -channelID ${CHANNEL_NAME}

    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to generate channel transaction${NC}"
        # Clean up temporary file
        rm -f config/configtx-docker.yaml
        exit 1
    fi
    
    # Clean up temporary file
    rm -f config/configtx-docker.yaml
    
    # Fix permissions if needed
    if [ "$EUID" -ne 0 ]; then
        chmod -R 755 network/channel-artifacts 2>/dev/null || true
    fi
    
    echo -e "${GREEN}Channel transaction generated successfully${NC}"
}

# Function to generate anchor peer transactions
generateAnchorPeerTx() {
    echo -e "${YELLOW}Generating anchor peer transactions...${NC}"
    
    # Get channel name
    CHANNEL_NAME=${CHANNEL_NAME:-"luxury-supply-chain"}
    
    # Extract organization MSP IDs from the config
    ORGS=()
    while IFS= read -r line; do
        if [[ $line =~ ^[[:space:]]*Name:[[:space:]]*(.+MSP)$ ]]; then
            msp="${BASH_REMATCH[1]}"
            # Skip OrdererMSP
            if [[ "$msp" != *"OrdererMSP"* ]]; then
                ORGS+=("$msp")
            fi
        fi
    done < config/configtx.yaml
    
    # Remove duplicates
    ORGS=($(echo "${ORGS[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))
    
    echo "Found organizations: ${ORGS[@]}"
    
    # Use the same temporary configtx file approach
    cp config/configtx.yaml config/configtx-docker.yaml
    
    # Replace the paths in the temporary file to work with Docker mounts
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' 's|../network/organizations|/organizations|g' config/configtx-docker.yaml
    else
        # Linux
        sed -i 's|../network/organizations|/organizations|g' config/configtx-docker.yaml
    fi
    
    for org in "${ORGS[@]}"; do
        echo "Generating anchor peer transaction for $org"
        
        # Generate anchor peer update using Docker
        docker run --rm \
            -v "$(pwd)/config":/config \
            -v "$(pwd)/network/organizations":/organizations \
            -v "$(pwd)/network/channel-artifacts":/channel-artifacts \
            -e FABRIC_CFG_PATH=/config \
            hyperledger/fabric-tools:2.5.5 \
            configtxgen -configPath /config -profile LuxurySupplyChain -outputAnchorPeersUpdate /channel-artifacts/${org}anchors.tx -channelID ${CHANNEL_NAME} -asOrg $org -config /config/configtx-docker.yaml
        
        if [ $? -ne 0 ]; then
            echo -e "${YELLOW}Warning: Could not generate anchor peer transaction for $org${NC}"
        fi
    done
    
    # Clean up temporary file
    rm -f config/configtx-docker.yaml
    
    # Fix permissions if needed
    if [ "$EUID" -ne 0 ]; then
        chmod -R 755 network/channel-artifacts 2>/dev/null || true
    fi
    
    echo -e "${GREEN}Anchor peer transactions generated${NC}"
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
        
        # Create fabric-ca-server-config.yaml if it doesn't exist
        if [ ! -f "$ca_path/fabric-ca-server-config.yaml" ]; then
            createCAConfig $org
        fi
    }
    
    # Initialize CAs for all organizations
    init_ca "luxebags"
    init_ca "italianleather"
    init_ca "craftworkshop"
    init_ca "luxuryretail"
    
    echo -e "${GREEN}All CA servers initialized${NC}"
}

# Function to create CA config
createCAConfig() {
    local org=$1
    local ca_path="network/organizations/fabric-ca/$org"
    
    cat > $ca_path/fabric-ca-server-config.yaml << EOF
port: 7054
debug: false
crlsizelimit: 512000
tls:
  enabled: true
  certfile: tls-cert.pem
  keyfile: tls-key.pem
  clientauth:
    type: noclientcert
    certfiles:
ca:
  name: ca-$org
  keyfile: ca-key.pem
  certfile: ca-cert.pem
  chainfile:
crl:
  expiry: 24h
registry:
  maxenrollments: -1
  identities:
    - name: admin
      pass: adminpw
      type: client
      affiliation: ""
      attrs:
        hf.Registrar.Roles: "*"
        hf.Registrar.DelegateRoles: "*"
        hf.Revoker: true
        hf.IntermediateCA: true
        hf.GenCRL: true
        hf.Registrar.Attributes: "*"
        hf.AffiliationMgr: true
db:
  type: sqlite3
  datasource: fabric-ca-server.db
  tls:
    enabled: false
ldap:
  enabled: false
affiliations:
  $org:
    - department1
    - department2
signing:
  default:
    usage:
      - digital signature
    expiry: 8760h
  profiles:
    ca:
      usage:
        - cert sign
        - crl sign
      expiry: 43800h
      caconstraint:
        isca: true
        maxpathlen: 0
    tls:
      usage:
        - signing
        - key encipherment
        - server auth
        - client auth
        - key agreement
      expiry: 8760h
csr:
  cn: ca.$org.${BRAND_DOMAIN}
  keyrequest:
    algo: ecdsa
    size: 256
  names:
    - C: US
    - ST: "California"
    - L: "San Francisco"
    - O: $org
    - OU:
  hosts:
    - localhost
    - ca.$org.${BRAND_DOMAIN}
  ca:
    expiry: 131400h
    pathlength: 1
idemix:
  rhpoolsize: 1000
  nonceexpiration: 15s
  noncesweepinterval: 15m
bccsp:
  default: SW
  sw:
    hash: SHA2
    security: 256
    filekeystore:
      keystore: msp/keystore
EOF
}

# Function to update connection profiles with actual certificates
updateConnectionProfiles() {
    echo -e "${YELLOW}Updating connection profiles with TLS certificates...${NC}"
    
    # Source the utils script to get the update function
    source scripts/utils.sh
    
    # Update the profiles
    update_connection_profiles "config" "network/organizations"
    
    echo -e "${GREEN}Connection profiles updated successfully${NC}"
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
    source scripts/utils.sh
    check_prerequisites
    
    # Create necessary directories
    mkdir -p network/organizations
    mkdir -p network/channel-artifacts
    
    # Step 1: Initialize Fabric CA servers FIRST
    initializeFabricCA
    
    # Step 2: Generate crypto materials
    generateCryptoMaterials
    
    # Step 3: Generate channel configuration
    generateChannelTx
    
    # Step 4: Generate anchor peer updates
    generateAnchorPeerTx
    
    # Step 5: Update connection profiles with actual certificates
    updateConnectionProfiles
    
    # Step 6: Verify everything was created
    verifyCryptoMaterials
    
    echo ""
    echo -e "${GREEN}All crypto materials generated successfully!${NC}"
    echo "Next step: Run ./scripts/start-network.sh to start the network"
}

# Run main function
main