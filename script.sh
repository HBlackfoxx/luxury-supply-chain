#!/bin/bash

# Define base directory
BASE_DIR="./"

# List of directories to create
DIRS=(
  "$BASE_DIR/config/brands/example-brand"
  "$BASE_DIR/config/brands/templates"
  "$BASE_DIR/config/crypto-config"
  "$BASE_DIR/config/channel"
  "$BASE_DIR/config/docker"
  "$BASE_DIR/network/scripts"
  "$BASE_DIR/network/organizations"
  "$BASE_DIR/network/channel-artifacts"
  "$BASE_DIR/chaincode/luxury-supply-chain"
  "$BASE_DIR/backend/gateway"
  "$BASE_DIR/backend/ai-service"
  "$BASE_DIR/frontend/web-app"
  "$BASE_DIR/frontend/mobile-app"
  "$BASE_DIR/docs"
)

# Create directories
for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
done

# Create placeholder files
touch "$BASE_DIR/config/brands/example-brand/network-config.yaml"
touch "$BASE_DIR/config/brands/example-brand/consensus-config.yaml"
touch "$BASE_DIR/config/brands/example-brand/chaincode-config.yaml"
touch "$BASE_DIR/config/brands/example-brand/ai-config.yaml"
touch "$BASE_DIR/config/brands/templates/brand-config-template.yaml"
touch "$BASE_DIR/config/crypto-config/crypto-config-template.yaml"
touch "$BASE_DIR/config/channel/configtx-template.yaml"
touch "$BASE_DIR/config/docker/docker-compose-template.yaml"
touch "$BASE_DIR/network/scripts/generate-network.sh"
touch "$BASE_DIR/network/scripts/start-network.sh"
touch "$BASE_DIR/network/scripts/stop-network.sh"
touch "$BASE_DIR/network/scripts/utils.sh"
touch "$BASE_DIR/docs/configuration-guide.md"

echo "Directory structure for 'luxury-supply-chain' has been created."
