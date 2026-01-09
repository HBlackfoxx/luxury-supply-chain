#!/bin/bash

# Luxury Supply Chain Network Teardown Script
# This script cleanly stops and removes all network components

set -e  # Exit on error

echo "=========================================="
echo "Stopping Luxury Supply Chain Network"
echo "=========================================="
echo ""

# Step 1: Stop Docker Compose services
echo "Step 1: Stopping Docker Compose services..."
docker-compose down
echo "✅ Docker Compose services stopped"
echo ""

# Step 2: Stop Fabric network if running
echo "Step 2: Stopping Fabric network..."
if [ -d "generated-test" ]; then
    cd generated-test
    if [ -f "scripts/stop-network.sh" ]; then
        ./scripts/stop-network.sh 2>/dev/null || true
    fi
    # Stop all Fabric containers
    docker stop $(docker ps -aq --filter "name=peer0\|orderer\|ca\|couchdb\|chaincode" 2>/dev/null) 2>/dev/null || true
    docker rm $(docker ps -aq --filter "name=peer0\|orderer\|ca\|couchdb\|chaincode" 2>/dev/null) 2>/dev/null || true
    cd ..
fi
echo "✅ Fabric network stopped"
echo ""

# Step 3: Clean up volumes (optional - uncomment if you want to remove data)
echo "Step 3: Cleaning up Docker volumes..."
read -p "Do you want to remove all Docker volumes (this will delete all data)? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker volume prune -f
    echo "✅ Docker volumes cleaned"
else
    echo "⏭️  Skipped volume cleanup"
fi
echo ""

# Step 4: Remove generated test directory (optional)
echo "Step 4: Clean generated files..."
read -p "Do you want to remove the generated-test directory? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf generated-test
    echo "✅ Generated test directory removed"
else
    echo "⏭️  Kept generated-test directory"
fi
echo ""

echo "=========================================="
echo "🧹 Network Teardown Complete!"
echo "=========================================="
echo ""
echo "To restart the network, run: ./setup-network.sh"
echo ""