#!/bin/bash

# Script to onboard a new organization to the luxury supply chain network
# Usage: ./onboard-organization.sh <org-id> <org-name> <org-type> <domain>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -ne 4 ]; then
    echo -e "${RED}Usage: $0 <org-id> <org-name> <org-type> <domain>${NC}"
    echo -e "Example: $0 premiumsilk 'Premium Silk Co' supplier premiumsilk.com"
    echo -e "Types: brand, supplier, manufacturer, retailer, logistics, certifier"
    exit 1
fi

ORG_ID=$1
ORG_NAME=$2
ORG_TYPE=$3
DOMAIN=$4

echo -e "${BLUE}🚀 Onboarding new organization: ${ORG_NAME}${NC}"

# Step 1: Generate crypto materials
echo -e "${YELLOW}Step 1: Generating cryptographic materials...${NC}"
cd network

# Add organization to crypto-config
cat >> organizations/crypto-config-${ORG_ID}.yaml <<EOF
PeerOrgs:
  - Name: ${ORG_ID}
    Domain: ${ORG_ID}.luxe-bags.luxury
    EnableNodeOUs: true
    Template:
      Count: 1
    Users:
      Count: 5
EOF

# Generate certificates
./scripts/generate-crypto.sh ${ORG_ID}

echo -e "${GREEN}✅ Crypto materials generated${NC}"

# Step 2: Create backend deployment
echo -e "${YELLOW}Step 2: Creating backend deployment...${NC}"
cd ../deployments

mkdir -p ${ORG_ID}/{config,data}

# Create docker-compose.yml
cat > ${ORG_ID}/docker-compose.yml <<EOF
version: '3.8'

services:
  ${ORG_ID}-backend:
    image: luxury-supply-chain-backend:latest
    container_name: ${ORG_ID}-backend
    ports:
      - "\${API_PORT}:4000"
    environment:
      - NODE_ENV=production
      - ORG_ID=${ORG_ID}
      - ORG_NAME=${ORG_NAME}
      - ORG_TYPE=${ORG_TYPE}
      - FABRIC_ORG=${ORG_ID}
      - FABRIC_USER=admin
      - JWT_SECRET=\${JWT_SECRET}
    volumes:
      - ./config:/app/config
      - ./data:/app/data
      - ../../network/organizations:/app/fabric/organizations:ro
    networks:
      - luxury-supply-chain

  ${ORG_ID}-frontend:
    image: luxury-supply-chain-frontend:latest
    container_name: ${ORG_ID}-frontend
    ports:
      - "\${FRONTEND_PORT}:3000"
    environment:
      - NEXT_PUBLIC_ORG_ID=${ORG_ID}
      - NEXT_PUBLIC_ORG_NAME=${ORG_NAME}
      - NEXT_PUBLIC_API_URL=http://localhost:\${API_PORT}
    networks:
      - luxury-supply-chain

networks:
  luxury-supply-chain:
    external: true
EOF

# Create .env file
cat > ${ORG_ID}/.env <<EOF
# ${ORG_NAME} Environment Configuration
ORG_ID=${ORG_ID}
ORG_NAME="${ORG_NAME}"
ORG_TYPE=${ORG_TYPE}
DOMAIN=${DOMAIN}

# Ports (change these to avoid conflicts)
API_PORT=40XX
FRONTEND_PORT=30XX

# Security
JWT_SECRET=${ORG_ID}-secret-change-in-production-$(openssl rand -hex 16)

# Fabric Configuration
FABRIC_CHANNEL=luxury-supply-chain
FABRIC_CHAINCODE_SUPPLY=luxury-supply-chain
FABRIC_CHAINCODE_CONSENSUS=2check-consensus
EOF

echo -e "${GREEN}✅ Deployment configuration created${NC}"

# Step 3: Update organizations.json
echo -e "${YELLOW}Step 3: Updating organization registry...${NC}"
cd ../../backend/config

# Use Node.js to update JSON properly
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('organizations.json', 'utf-8'));

config.organizations['${ORG_ID}'] = {
  name: '${ORG_NAME}',
  type: '${ORG_TYPE}',
  domain: '${DOMAIN}',
  apiEndpoint: 'http://localhost:40XX', // Update with actual port
  fabricMSP: '${ORG_ID}MSP',
  channels: ['luxury-supply-chain'],
  chaincodes: ['luxury-supply-chain', '2check-consensus'],
  branding: {
    primaryColor: '#000000', // Update with brand color
    logo: '/logos/${ORG_ID}.png'
  }
};

fs.writeFileSync('organizations.json', JSON.stringify(config, null, 2));
console.log('Organization added to registry');
"

echo -e "${GREEN}✅ Organization registry updated${NC}"

# Step 4: Create initial users
echo -e "${YELLOW}Step 4: Creating initial users...${NC}"
cat > ../../deployments/${ORG_ID}/config/users.json <<EOF
{
  "users": [
    {
      "email": "admin@${DOMAIN}",
      "name": "Admin User",
      "role": "admin",
      "password": "${ORG_NAME}2024!"
    },
    {
      "email": "manager@${DOMAIN}",
      "name": "Manager",
      "role": "manager",
      "password": "${ORG_NAME}2024!"
    }
  ]
}
EOF

echo -e "${GREEN}✅ Initial users created${NC}"

# Step 5: Join channel (if network is running)
echo -e "${YELLOW}Step 5: Channel configuration...${NC}"
echo -e "${BLUE}Note: To join the channel, run:${NC}"
echo -e "  cd network && ./scripts/join-channel.sh ${ORG_ID}"

# Summary
echo -e "\n${GREEN}🎉 Organization ${ORG_NAME} successfully prepared!${NC}"
echo -e "\n${BLUE}Next steps:${NC}"
echo -e "1. Update port numbers in: deployments/${ORG_ID}/.env"
echo -e "2. Update API endpoint in: backend/config/organizations.json"
echo -e "3. Add logo to: frontend/web-app/public/logos/${ORG_ID}.png"
echo -e "4. Start the services:"
echo -e "   ${YELLOW}cd deployments/${ORG_ID} && docker-compose up -d${NC}"
echo -e "\n${BLUE}Default credentials:${NC}"
echo -e "  Email: admin@${DOMAIN}"
echo -e "  Password: ${ORG_NAME}2024!"