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
    
    # Check if cryptogen exists
    if ! command -v cryptogen &> /dev/null; then
        echo -e "${RED}cryptogen tool not found. Installing...${NC}"
        curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.5 -d -s
        export PATH=$PWD/bin:$PATH
    fi
    
    # Remove previous crypto material
    rm -rf network/organizations/peerOrganizations
    rm -rf network/organizations/ordererOrganizations
    
    # Generate crypto material
    cryptogen generate --config=config/crypto-config.yaml --output="network/organizations"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to generate crypto material${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Crypto materials generated successfully${NC}"
}

# Function to fix configtx paths
fixConfigtxPaths() {
    echo -e "${YELLOW}Fixing paths in configtx.yaml...${NC}"
    
    # Create a temporary configtx.yaml with corrected paths
    cp config/configtx.yaml config/configtx_temp.yaml
    
    # Get the absolute path to the organizations directory
    ORG_PATH="$PWD/network/organizations"
    
    # Replace relative paths with absolute paths in the temp file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|../organizations|${ORG_PATH}|g" config/configtx_temp.yaml
    else
        # Linux
        sed -i "s|../organizations|${ORG_PATH}|g" config/configtx_temp.yaml
    fi
    
    echo -e "${GREEN}Paths fixed in configtx.yaml${NC}"
}

# Function to generate genesis block
generateGenesisBlock() {
    echo -e "${YELLOW}Generating genesis block...${NC}"
    
    # Check if configtxgen exists
    if ! command -v configtxgen &> /dev/null; then
        echo -e "${RED}configtxgen tool not found. Installing...${NC}"
        if [ ! -d "bin" ]; then
            curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.5 -d -s
        fi
        export PATH=$PWD/bin:$PATH
    fi
    
    # Set config path
    export FABRIC_CFG_PATH="$PWD/config"
    
    # Generate genesis block with quoted path to handle spaces
    configtxgen -profile LuxuryOrdererGenesis -channelID system-channel -outputBlock "$PWD/network/system-genesis-block/genesis.block"
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to generate genesis block${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Genesis block generated successfully${NC}"
}

# Function to generate channel transaction
generateChannelTx() {
    echo -e "${YELLOW}Generating channel configuration transaction...${NC}"
    
    export FABRIC_CFG_PATH=$PWD/config
    
    # Get channel name from environment or use default
    CHANNEL_NAME=${CHANNEL_NAME:-"luxury-supply-chain"}
    
    # Generate channel configuration transaction
    configtxgen -profile LuxurySupplyChain -outputCreateChannelTx network/channel-artifacts/${CHANNEL_NAME}.tx -channelID ${CHANNEL_NAME}
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to generate channel transaction${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Channel transaction generated successfully${NC}"
}

# Function to generate anchor peer transactions
generateAnchorPeerTx() {
    echo -e "${YELLOW}Generating anchor peer transactions...${NC}"
    
    export FABRIC_CFG_PATH=$PWD/config
    
    # Get channel name
    CHANNEL_NAME=${CHANNEL_NAME:-"luxury-supply-chain"}
    
    # Extract organization MSP IDs from the config
    # Look for lines like "Name: LuxeBagsMSP" under Organizations
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
    
    for org in "${ORGS[@]}"; do
        echo "Generating anchor peer transaction for $org"
        configtxgen -profile LuxurySupplyChain -outputAnchorPeersUpdate network/channel-artifacts/${org}anchors.tx -channelID ${CHANNEL_NAME} -asOrg $org
        
        if [ $? -ne 0 ]; then
            echo -e "${YELLOW}Warning: Could not generate anchor peer transaction for $org${NC}"
        fi
    done
    
    echo -e "${GREEN}Anchor peer transactions generated${NC}"
}

# Function to create Fabric CA server configs
generateCAConfigs() {
    echo -e "${YELLOW}Generating CA server configurations...${NC}"
    
    # Find the brand config file
    local brand_config=""
    for config_file in ../config/brands/*/network-config.yaml; do
        if [ -f "$config_file" ]; then
            brand_config="$config_file"
            break
        fi
    done
    
    if [ -z "$brand_config" ]; then
        echo -e "${YELLOW}No brand configuration found, using defaults${NC}"
        # Create default CA config for the brand
        mkdir -p network/organizations/fabric-ca/${BRAND_ID}
        createDefaultCAConfig ${BRAND_ID}
    else
        # Use yq with proper indexing
        local org_count=$(yq eval '.network.organizations | length' $brand_config)
        for ((i=0; i<$org_count; i++)); do
            local org_id=$(yq eval ".network.organizations[$i].id" $brand_config)
            mkdir -p network/organizations/fabric-ca/$org_id
            createDefaultCAConfig $org_id
        done
    fi
    
    echo -e "${GREEN}CA configurations generated successfully${NC}"
}

# Function to create default CA config
createDefaultCAConfig() {
    local org_id=$1
    
    cat > network/organizations/fabric-ca/$org_id/fabric-ca-server-config.yaml << EOF
version: 1.5.5
port: 7054
debug: false
crlsizelimit: 512000
tls:
  enabled: true
  certfile: ca-cert.pem
  keyfile: ca-key.pem
  clientauth:
    type: noclientcert
    certfiles:
ca:
  name: ca-$org_id
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
  $org_id:
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
  cn: ca.$org_id.${BRAND_DOMAIN}
  keyrequest:
    algo: ecdsa
    size: 256
  names:
    - C: US
    - ST: "California"
    - L: "San Francisco"
    - O: $org_id
    - OU:
  hosts:
    - localhost
    - ca.$org_id.${BRAND_DOMAIN}
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
    
    # Check if orderer TLS certs exist
    if [ ! -f "network/organizations/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/tls/server.crt" ]; then
        echo -e "${RED}Orderer TLS certificates not found!${NC}"
        echo "Expected path: network/organizations/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/tls/server.crt"
        return 1
    fi
    
    # Check if peer organizations exist
    if [ ! -d "network/organizations/peerOrganizations" ]; then
        echo -e "${RED}Peer organizations not found!${NC}"
        return 1
    fi
    
    echo -e "${GREEN}Crypto materials verified${NC}"
    return 0
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
    mkdir -p network/system-genesis-block
    mkdir -p network/channel-artifacts
    
    # Step 1: Generate crypto materials FIRST
    generateCryptoMaterials
    
    # Step 2: Verify crypto materials exist
    verifyCryptoMaterials
    if [ $? -ne 0 ]; then
        echo -e "${RED}Crypto materials verification failed${NC}"
        exit 1
    fi
    
    # Step 3: Generate CA configs
    generateCAConfigs
    
    # Step 4: Fix paths in configtx.yaml for genesis block generation
    #fixConfigtxPaths
    
    # Step 5: Generate genesis block (now crypto materials exist)
    generateGenesisBlock
    
    # Step 6: Generate channel configuration
    generateChannelTx
    
    # Step 7: Generate anchor peer updates
    generateAnchorPeerTx
    
    # Step 8: Update connection profiles with actual certificates
    updateConnectionProfiles
    
    echo ""
    echo -e "${GREEN}All crypto materials generated successfully!${NC}"
    echo "Next step: Run ./scripts/start-network.sh to start the network"
}

# Run main function
main