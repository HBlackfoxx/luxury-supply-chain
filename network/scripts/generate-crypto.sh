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

# Function to generate genesis block
generateGenesisBlock() {
    echo -e "${YELLOW}Generating genesis block...${NC}"
    
    # Check if configtxgen exists
    if ! command -v configtxgen &> /dev/null; then
        echo -e "${RED}configtxgen tool not found. Please install Fabric binaries.${NC}"
        exit 1
    fi
    
    # Set config path
    export FABRIC_CFG_PATH=$PWD/config
    
    # Generate genesis block
    configtxgen -profile LuxuryOrdererGenesis -channelID system-channel -outputBlock network/system-genesis-block/genesis.block
    
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
    
    # Generate channel configuration transaction
    configtxgen -profile LuxurySupplyChain -outputCreateChannelTx network/channel-artifacts/luxury-supply-chain.tx -channelID luxury-supply-chain
    
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
    
    # Read organizations from config
    ORGS=($(yq eval '.network.organizations[].mspId' ../config/brands/example-brand/network-config.yaml))
    
    for org in "${ORGS[@]}"; do
        echo "Generating anchor peer transaction for $org"
        configtxgen -profile LuxurySupplyChain -outputAnchorPeersUpdate network/channel-artifacts/${org}anchors.tx -channelID luxury-supply-chain -asOrg $org
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to generate anchor peer transaction for $org${NC}"
            exit 1
        fi
    done
    
    echo -e "${GREEN}Anchor peer transactions generated successfully${NC}"
}

# Function to create Fabric CA server configs
generateCAConfigs() {
    echo -e "${YELLOW}Generating CA server configurations...${NC}"
    
    # Read organizations from config
    local brand_config="../config/brands/example-brand/network-config.yaml"
    
    yq eval '.network.organizations[]' $brand_config | while IFS= read -r org; do
        local org_id=$(echo "$org" | yq eval '.id')
        local org_name=$(echo "$org" | yq eval '.name')
        
        mkdir -p network/organizations/fabric-ca/$org_id
        
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
    done
    
    echo -e "${GREEN}CA configurations generated successfully${NC}"
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
    
    # Generate all crypto materials
    generateCryptoMaterials
    generateCAConfigs
    generateGenesisBlock
    generateChannelTx
    generateAnchorPeerTx
    
    echo ""
    echo -e "${GREEN}All crypto materials generated successfully!${NC}"
    echo "Next step: Run ./scripts/start-network.sh to start the network"
}

# Run main function
main