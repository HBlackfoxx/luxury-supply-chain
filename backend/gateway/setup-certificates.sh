#!/bin/bash
# backend/gateway/setup-certificates.sh
# Setup certificates for the SDK by linking to generated network crypto materials

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}Setting up certificates for Fabric Gateway SDK${NC}"
echo "=============================================="

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo -e "${RED}Error: Please run this script from the backend/gateway directory${NC}"
    exit 1
fi

# Check if generated-test exists
GENERATED_DIR="../../generated-test"
if [ ! -d "$GENERATED_DIR/network/organizations" ]; then
    echo -e "${RED}Error: Generated network not found at $GENERATED_DIR${NC}"
    echo "Please run the network generation first:"
    echo "  cd ../.. "
    echo "  ./network/scripts/generate-network.sh -b config/brands/example-brand/network-config.yaml -o generated-test"
    echo "  cd generated-test"
    echo "  ./scripts/generate-crypto.sh"
    exit 1
fi

# Create network directory if it doesn't exist
mkdir -p network

# Check if organizations already exists
if [ -e "network/organizations" ]; then
    echo -e "${YELLOW}Warning: network/organizations already exists${NC}"
    read -p "Do you want to replace it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping certificate setup"
        exit 0
    fi
    rm -rf network/organizations
fi

# Create symbolic link
echo -e "${BLUE}Creating symbolic link to crypto materials...${NC}"
ln -s ../../../generated-test/network/organizations network/organizations

# Verify the link
if [ -L "network/organizations" ]; then
    echo -e "${GREEN}✅ Symbolic link created successfully${NC}"
else
    echo -e "${RED}❌ Failed to create symbolic link${NC}"
    exit 1
fi

# Check if Admin certificate exists
ADMIN_CERT="network/organizations/peerOrganizations/luxebags.luxe-bags.luxury/users/Admin@luxebags.luxe-bags.luxury/msp/signcerts/Admin@luxebags.luxe-bags.luxury-cert.pem"
if [ -f "$ADMIN_CERT" ]; then
    echo -e "${GREEN}✅ Admin certificate found${NC}"
else
    echo -e "${RED}❌ Admin certificate not found${NC}"
    echo "Expected at: $ADMIN_CERT"
    exit 1
fi

# Check TLS certificate
TLS_CERT="network/organizations/peerOrganizations/luxebags.luxe-bags.luxury/peers/peer0.luxebags.luxe-bags.luxury/tls/ca.crt"
if [ -f "$TLS_CERT" ]; then
    echo -e "${GREEN}✅ TLS certificate found${NC}"
else
    echo -e "${RED}❌ TLS certificate not found${NC}"
    echo "Expected at: $TLS_CERT"
    exit 1
fi

# Create identities directory
mkdir -p identities
echo -e "${GREEN}✅ Identities directory created${NC}"

# Create logs directory
mkdir -p logs
echo -e "${GREEN}✅ Logs directory created${NC}"

echo ""
echo -e "${GREEN}Certificate setup completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Ensure the network is running:"
echo "   cd ../../generated-test"
echo "   ./scripts/start-network.sh"
echo ""
echo "2. Install dependencies:"
echo "   npm install"
echo ""
echo "3. Run tests:"
echo "   npm test"
echo ""
echo "4. Run the example:"
echo "   npm run dev"