#!/bin/bash
# test-config-generation.sh

echo "=== Testing Configuration Generation ==="

# Test 1: Generate network configuration
./network/scripts/generate-network.sh -b config/brands/example-brand/network-config.yaml -o generated-test

# Verify generated files
echo "Checking generated files..."
FILES=(
    "generated-test/config/crypto-config.yaml"
    "generated-test/config/configtx.yaml"
    "generated-test/docker/docker-compose.yaml"
    "generated-test/.env"
    "generated-test/README.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Verify environment variables
source generated-test/.env
echo "Brand ID: $BRAND_ID"
echo "Brand Name: $BRAND_NAME"
echo "Network Name: $NETWORK_NAME"
