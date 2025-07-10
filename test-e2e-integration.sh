#!/bin/bash
# test-e2e-integration.sh

echo "=== End-to-End Integration Test ==="

# Function to check if previous step succeeded
check_status() {
    if [ $? -ne 0 ]; then
        echo "❌ Test failed at: $1"
        exit 1
    fi
}

# 1. Generate network
echo "Step 1: Generating network configuration..."
./network/scripts/generate-network.sh -b config/brands/example-brand/network-config.yaml -o test-e2e
check_status "Network generation"

cd test-e2e

# 2. Generate crypto
echo "Step 2: Generating crypto materials..."
./scripts/generate-crypto.sh
check_status "Crypto generation"

# 3. Start network
echo "Step 3: Starting network..."
./scripts/start-network.sh
check_status "Network start"

# 4. Create channel
echo "Step 4: Creating channel..."
sleep 10
./scripts/create-channel.sh
check_status "Channel creation"

# 5. Test SDK connection
echo "Step 5: Testing SDK connection..."
cd ../backend/gateway
npm test
check_status "SDK tests"

# 6. Cleanup
echo "Step 6: Cleaning up..."
cd ../../test-e2e
./scripts/stop-network.sh
cd ..
rm -rf test-e2e

echo "✅ All integration tests passed!"