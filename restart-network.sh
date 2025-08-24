#!/bin/bash

# Quick Restart Script for Development
# This script quickly restarts the network without regenerating crypto materials

set -e  # Exit on error

echo "=========================================="
echo "Restarting Luxury Supply Chain Network"
echo "=========================================="
echo ""

# Step 1: Stop current services
echo "Step 1: Stopping current services..."
docker-compose down
echo "✅ Services stopped"
echo ""

# Step 2: Restart Fabric network containers if needed
if [ -d "generated-test" ]; then
    echo "Step 2: Checking Fabric network status..."
    cd generated-test
    
    # Check if peers are running
    if ! docker ps | grep -q "peer0"; then
        echo "Fabric network is down. Please run ./setup-network.sh for full setup"
        exit 1
    fi
    
    cd ..
    echo "✅ Fabric network is running"
else
    echo "Error: generated-test directory not found. Please run ./setup-network.sh first"
    exit 1
fi
echo ""

# Step 3: Restart Docker Compose services
echo "Step 3: Starting Docker Compose services..."
docker-compose up -d
if [ $? -ne 0 ]; then
    echo "Error: Failed to start Docker Compose services"
    exit 1
fi
echo "✅ Docker Compose services started"
echo ""

# Step 4: Show container status
echo "Step 4: Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "backend|frontend|postgres|2check" || true
echo ""

echo "=========================================="
echo "🔄 Network Restarted Successfully!"
echo "=========================================="
echo ""
echo "Access the applications at:"
echo "  - LuxeBags:        http://localhost:3001"
echo "  - Italian Leather: http://localhost:3002"
echo "  - Craft Workshop:  http://localhost:3003"
echo "  - Luxury Retail:   http://localhost:3004"
echo ""
echo "To view logs: docker-compose logs -f [service-name]"
echo ""