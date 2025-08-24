#!/bin/bash

# Luxury Supply Chain Network Setup Script
# This script automates the complete network setup process

set -e  # Exit on error

echo "=========================================="
echo "Starting Luxury Supply Chain Network Setup"
echo "=========================================="
echo ""

# Step 1: Run test config generation
echo "Step 1: Generating test configuration..."
echo "----------------------------------------"
bash -x ./test-config-generation.sh 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to generate test configuration"
    exit 1
fi
echo "✅ Test configuration generated successfully"
echo ""

# Step 2: Generate crypto materials
echo "Step 2: Generating crypto materials..."
echo "----------------------------------------"
cd generated-test
bash -x ./scripts/generate-crypto.sh 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to generate crypto materials"
    exit 1
fi
echo "✅ Crypto materials generated successfully"
echo ""

# Step 3: Start the network
echo "Step 3: Starting Fabric network..."
echo "----------------------------------------"
bash -x ./scripts/start-network.sh 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to start network"
    exit 1
fi
echo "✅ Network started successfully"
echo ""

# Step 4: Create channel
echo "Step 4: Creating channel..."
echo "----------------------------------------"
bash -x ./scripts/create-channel.sh 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to create channel"
    exit 1
fi
echo "✅ Channel created successfully"
echo ""

# Step 5: Wait for network to stabilize
echo "Step 5: Waiting for network to stabilize..."
echo "----------------------------------------"
sleep 10
echo "✅ Network stabilized"
echo ""

# Step 6: Deploy external chaincode
echo "Step 6: Deploying external chaincode..."
echo "----------------------------------------"
bash -x ./scripts/deploy-external-chaincode.sh 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to deploy external chaincode"
    exit 1
fi
echo "✅ External chaincode deployed successfully"
echo ""

# Step 7: Setup certificates
echo "Step 7: Setting up certificates..."
echo "----------------------------------------"
cd ../backend/gateway
# Automatically respond 'y' to the prompt
echo "y" | bash -x ./setup-certificates.sh 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to setup certificates"
    exit 1
fi
echo "✅ Certificates setup successfully"
echo ""

# Step 8: Start Docker Compose
echo "Step 8: Starting application services with Docker Compose..."
echo "----------------------------------------"
cd ../..  # Back to root directory
docker-compose up -d
if [ $? -ne 0 ]; then
    echo "Error: Failed to start Docker Compose services"
    exit 1
fi
echo "✅ Docker Compose services started successfully"
echo ""

echo "=========================================="
echo "🎉 Network Setup Complete!"
echo "=========================================="
echo ""
echo "Services are now running:"
echo "  - Hyperledger Fabric Network"
echo "  - External Chaincode (2check-consensus & luxury-supply-chain)"
echo "  - Backend Services (all organizations)"
echo "  - Frontend Applications"
echo ""
echo "Access the applications at:"
echo "  - LuxeBags:        http://localhost:3001"
echo "  - Italian Leather: http://localhost:3002"
echo "  - Craft Workshop:  http://localhost:3003"
echo "  - Luxury Retail:   http://localhost:3004"
echo ""
echo "Backend APIs available at:"
echo "  - LuxeBags API:        http://localhost:4001"
echo "  - Italian Leather API: http://localhost:4002"
echo "  - Craft Workshop API:  http://localhost:4003"
echo "  - Luxury Retail API:   http://localhost:4004"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop services: docker-compose down"
echo ""