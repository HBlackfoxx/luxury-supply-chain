#!/bin/bash
# test-network-lifecycle.sh

set -e

echo "=== Testing Network Lifecycle ==="

cd generated-test

# Test 1: Generate crypto materials
echo "1. Generating crypto materials..."
./scripts/generate-crypto.sh

# Verify crypto generation
if [ -d "network/organizations/peerOrganizations" ]; then
    echo "✅ Peer organizations created"
else
    echo "❌ Peer organizations missing"
    exit 1
fi

if [ -f "network/system-genesis-block/genesis.block" ]; then
    echo "✅ Genesis block created"
else
    echo "❌ Genesis block missing"
    exit 1
fi

# Test 2: Start network
echo "2. Starting network..."
./scripts/start-network.sh

# Wait for network to stabilize
sleep 10

# Test 3: Verify containers are running
echo "3. Verifying containers..."
EXPECTED_CONTAINERS=(
    "orderer1.orderer"
    "peer0.luxebags"
    "peer1.luxebags"
    "ca_luxebags"
    "couchdb_peer0_luxebags"
)

for container in "${EXPECTED_CONTAINERS[@]}"; do
    if docker ps | grep -q "$container"; then
        echo "✅ $container is running"
    else
        echo "❌ $container is not running"
        docker ps
        exit 1
    fi
done

# Test 4: Create channel
echo "4. Creating channel..."
./scripts/create-channel.sh

# Test 5: Verify channel creation
docker exec peer0.luxebags.luxury peer channel list > channel_list.txt
if grep -q "luxury-supply-chain" channel_list.txt; then
    echo "✅ Channel created and joined"
else
    echo "❌ Channel not found"
    cat channel_list.txt
    exit 1
fi

# Test 6: Stop network
echo "5. Stopping network..."
./scripts/stop-network.sh

# Verify cleanup
if docker ps | grep -q "luxebags"; then
    echo "❌ Containers still running"
    exit 1
else
    echo "✅ Network stopped successfully"
fi