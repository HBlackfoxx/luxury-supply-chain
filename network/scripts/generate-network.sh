#!/bin/bash

# Configurable Hyperledger Fabric Network Generator
# This script generates a complete Fabric network based on brand configuration

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
BRAND_CONFIG=""
OUTPUT_DIR="./generated"
NETWORK_NAME="luxury-supply-chain"

# Function to display usage
usage() {
    echo "Usage: $0 -b <brand-config-file> [-o <output-directory>] [-n <network-name>]"
    echo "  -b: Brand configuration file (required)"
    echo "  -o: Output directory (default: ./generated)"
    echo "  -n: Network name (default: luxury-supply-chain)"
    exit 1
}

# Parse command line arguments
while getopts "b:o:n:h" opt; do
    case ${opt} in
        b )
            BRAND_CONFIG=$OPTARG
            ;;
        o )
            OUTPUT_DIR=$OPTARG
            ;;
        n )
            NETWORK_NAME=$OPTARG
            ;;
        h )
            usage
            ;;
        \? )
            usage
            ;;
    esac
done

# Check if brand config is provided
if [ -z "$BRAND_CONFIG" ]; then
    echo -e "${RED}Error: Brand configuration file is required${NC}"
    usage
fi

# Check if brand config file exists
if [ ! -f "$BRAND_CONFIG" ]; then
    echo -e "${RED}Error: Brand configuration file not found: $BRAND_CONFIG${NC}"
    exit 1
fi

echo -e "${GREEN}Luxury Supply Chain Network Generator${NC}"
echo "======================================"
echo "Brand Config: $BRAND_CONFIG"
echo "Output Directory: $OUTPUT_DIR"
echo "Network Name: $NETWORK_NAME"
echo ""

# Source utility functions
source "$(dirname "$0")/utils.sh"

# Load brand configuration
echo -e "${YELLOW}Loading brand configuration...${NC}"
BRAND_ID=$(yq eval '.brand.id' $BRAND_CONFIG)
BRAND_NAME=$(yq eval '.brand.name' $BRAND_CONFIG)
BRAND_DOMAIN=$(echo $BRAND_ID | tr '[:upper:]' '[:lower:]').luxury

echo "Brand: $BRAND_NAME"
echo "Domain: $BRAND_DOMAIN"

# Create output directory structure
echo -e "${YELLOW}Creating directory structure...${NC}"
mkdir -p $OUTPUT_DIR/{config,network,chaincode,scripts,docker}
mkdir -p $OUTPUT_DIR/network/{organizations,channel-artifacts}
# Note: No system-genesis-block directory for channel participation API

# Generate crypto configuration
echo -e "${YELLOW}Generating crypto configuration...${NC}"
export BRAND_NAME=$BRAND_NAME
export BRAND_DOMAIN=$BRAND_DOMAIN

# Debug output
echo "BRAND_NAME: $BRAND_NAME"
echo "BRAND_DOMAIN: $BRAND_DOMAIN"

# Check which template file exists and use the appropriate one
if [ -f "config/crypto-config/crypto-config-template.yaml" ]; then
    CRYPTO_TEMPLATE="config/crypto-config/crypto-config-template.yaml"
elif [ -f "config/crypto-config/crypto-config-template-brand.yaml" ]; then
    CRYPTO_TEMPLATE="config/crypto-config/crypto-config-template-brand.yaml"
else
    echo -e "${RED}Error: No crypto-config template found${NC}"
    exit 1
fi

echo "Using crypto template: $CRYPTO_TEMPLATE"
envsubst < $CRYPTO_TEMPLATE > $OUTPUT_DIR/config/crypto-config.yaml

# Verify the substitution worked
if grep -q '\${BRAND_DOMAIN}' $OUTPUT_DIR/config/crypto-config.yaml; then
    echo -e "${RED}Error: Environment variable substitution failed${NC}"
    echo "crypto-config.yaml still contains unreplaced variables"
    exit 1
fi

# Generate channel configuration
echo -e "${YELLOW}Generating channel configuration...${NC}"
envsubst < config/channel/configtx-template.yaml > $OUTPUT_DIR/config/configtx.yaml

# Generate Docker Compose file
echo -e "${YELLOW}Generating Docker Compose configuration...${NC}"
generate_docker_compose $BRAND_CONFIG $OUTPUT_DIR/docker/docker-compose.yaml

# Generate connection profiles
echo -e "${YELLOW}Generating connection profiles...${NC}"
generate_connection_profiles $BRAND_CONFIG $OUTPUT_DIR/config

# Generate environment variables file
echo -e "${YELLOW}Generating environment configuration...${NC}"
cat > $OUTPUT_DIR/.env << EOF
# Generated environment configuration for $BRAND_NAME
BRAND_ID=$BRAND_ID
BRAND_NAME=$BRAND_NAME
BRAND_DOMAIN=$BRAND_DOMAIN
NETWORK_NAME=$NETWORK_NAME
COMPOSE_PROJECT_NAME=${BRAND_ID}_${NETWORK_NAME}
IMAGE_TAG=2.5.5
CA_IMAGE_TAG=1.5.7
EOF

# Generate startup scripts
echo -e "${YELLOW}Generating startup scripts...${NC}"
cp network/scripts/*.sh $OUTPUT_DIR/scripts/
chmod +x $OUTPUT_DIR/scripts/*.sh

# Add the chaincode docker-compose
cp network/docker-compose-chaincode.yml $OUTPUT_DIR/

# Generate README for the generated network
echo -e "${YELLOW}Generating documentation...${NC}"
cat > $OUTPUT_DIR/README.md << EOF
# $BRAND_NAME - Luxury Supply Chain Network

This is a generated Hyperledger Fabric network for $BRAND_NAME.

## Network Configuration

- **Brand**: $BRAND_NAME
- **Domain**: $BRAND_DOMAIN
- **Network Name**: $NETWORK_NAME

## Quick Start

1. Generate crypto materials:
   \`\`\`bash
   cd $OUTPUT_DIR
   ./scripts/generate-crypto.sh
   \`\`\`

2. Start the network:
   \`\`\`bash
   ./scripts/start-network.sh
   \`\`\`

3. Create channel:
   \`\`\`bash
   ./scripts/create-channel.sh
   \`\`\`

4. Deploy chaincode:
   \`\`\`bash
   ./scripts/deploy-chaincode.sh
   \`\`\`

## Stop the Network

\`\`\`bash
./scripts/stop-network.sh
\`\`\`

## Network Topology

$(generate_network_topology $BRAND_CONFIG)

## Configuration Files

- **Crypto Config**: config/crypto-config.yaml
- **Channel Config**: config/configtx.yaml
- **Docker Compose**: docker/docker-compose.yaml
- **Connection Profiles**: config/connection-*.json

## Notes

This network uses Hyperledger Fabric 2.5 with the channel participation API.
There is no system channel - channels are created dynamically using osnadmin.
EOF

echo -e "${GREEN}Network generation complete!${NC}"
echo "Generated network in: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "1. cd $OUTPUT_DIR"
echo "2. ./scripts/generate-crypto.sh"
echo "3. ./scripts/start-network.sh"