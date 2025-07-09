#!/bin/bash

# Create and join channel for the luxury supply chain network
# Using Channel Participation API (Fabric 2.3+)

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment variables
source .env

CHANNEL_NAME="luxury-supply-chain"
DELAY=3
MAX_RETRY=5

echo -e "${GREEN}Creating Channel: $CHANNEL_NAME${NC}"
echo "================================"

# Function to verify network is running
verifyNetwork() {
    echo -e "${YELLOW}Verifying network status...${NC}"
    
    # Check if orderer is running
    docker ps | grep orderer1.orderer.${BRAND_DOMAIN} > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${RED}Orderer is not running!${NC}"
        echo "Please run ./scripts/start-network.sh first"
        exit 1
    fi
    
    echo -e "${GREEN}Network is running${NC}"
}

# Function to create channel using osnadmin
createChannelWithOsnadmin() {
    echo -e "${YELLOW}Creating channel using osnadmin...${NC}"
    
    # First, create the channel genesis block using Docker
    echo "Creating genesis block for channel..."
    docker run --rm \
        -v "$(pwd)/config":/config \
        -v "$(pwd)/network":/network \
        -v "$(pwd)/network/channel-artifacts":/channel-artifacts \
        -e FABRIC_CFG_PATH=/config \
        hyperledger/fabric-tools:2.5.5 \
        configtxgen -configPath /config -profile LuxurySupplyChain -outputBlock /channel-artifacts/${CHANNEL_NAME}.block -channelID $CHANNEL_NAME
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create genesis block${NC}"
        exit 1
    fi
    
    # Fix permissions if needed
    if [ "$EUID" -ne 0 ]; then
        chmod -R 755 network/channel-artifacts 2>/dev/null || true
    fi
    
    # Join each orderer to the channel using osnadmin
    local orderers=("orderer1" "orderer2" "orderer3")
    local ports=(7050 8050 9050)
    local admin_ports=(7053 8053 9053)
    
    for i in ${!orderers[@]}; do
        local orderer=${orderers[$i]}
        local admin_port=${admin_ports[$i]}
        
        echo "Joining $orderer to channel..."
        
        # Use osnadmin to join the orderer to the channel
        docker exec ${orderer}.orderer.${BRAND_DOMAIN} osnadmin channel join \
            --channelID $CHANNEL_NAME \
            --config-block /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block \
            -o localhost:${admin_port} \
            --ca-file /var/hyperledger/orderer/tls/ca.crt \
            --client-cert /var/hyperledger/orderer/tls/server.crt \
            --client-key /var/hyperledger/orderer/tls/server.key
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}$orderer joined channel successfully${NC}"
        else
            echo -e "${YELLOW}Warning: $orderer may have already joined the channel${NC}"
        fi
    done
    
    # Wait for orderers to elect a leader
    echo "Waiting for Raft leader election..."
    sleep 5
}

# Function to join peer to channel
joinChannel() {
    local ORG=$1
    local ORG_MSP=$2
    local PEER=$3
    local PORT=$4
    
    echo -e "${YELLOW}Joining $PEER.$ORG to channel...${NC}"
    
    # First, fetch the channel genesis block from orderer
    docker exec ${PEER}.${ORG}.${BRAND_DOMAIN} peer channel fetch 0 \
        /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block \
        -c $CHANNEL_NAME \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --tls \
        --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem
    
    # Set peer environment
    export CORE_PEER_LOCALMSPID="${ORG_MSP}"
    export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/peers/${PEER}.${ORG}.${BRAND_DOMAIN}/tls/ca.crt
    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/users/Admin@${ORG}.${BRAND_DOMAIN}/msp
    export CORE_PEER_ADDRESS=${PEER}.${ORG}.${BRAND_DOMAIN}:${PORT}
    
    # Join channel
    docker exec \
        -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
        -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
        -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
        ${PEER}.${ORG}.${BRAND_DOMAIN} \
        peer channel join -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}$PEER.$ORG joined channel successfully${NC}"
    else
        echo -e "${RED}Failed to join $PEER.$ORG to channel${NC}"
        return 1
    fi
}

# Function to verify channel creation
verifyChannel() {
    echo -e "${YELLOW}Verifying channel creation...${NC}"
    
    # List channels on peer0
    docker exec peer0.luxebags.${BRAND_DOMAIN} peer channel list
    
    # Check orderer logs
    echo ""
    echo "Checking orderer status..."
    docker exec orderer1.orderer.${BRAND_DOMAIN} osnadmin channel list -o localhost:7053 \
        --ca-file /var/hyperledger/orderer/tls/ca.crt \
        --client-cert /var/hyperledger/orderer/tls/server.crt \
        --client-key /var/hyperledger/orderer/tls/server.key
    
    echo -e "${GREEN}Channel verification complete${NC}"
}

# Main execution
main() {
    echo "Starting channel creation process..."
    echo ""
    
    # Verify network is running
    verifyNetwork
    
    # Create channel using osnadmin
    createChannelWithOsnadmin
    
    # Join peers to channel
    echo ""
    echo -e "${BLUE}Joining peers to channel...${NC}"
    
    # Join luxebags peers
    joinChannel luxebags LuxeBagsMSP peer0 7051
    joinChannel luxebags LuxeBagsMSP peer1 8051
    
    # Join italianleather peers
    joinChannel italianleather ItalianLeatherMSP peer0 9051
    
    # Join craftworkshop peers
    joinChannel craftworkshop CraftWorkshopMSP peer0 10051
    
    # Join luxuryretail peers
    joinChannel luxuryretail LuxuryRetailMSP peer0 11051
    
    # Note about anchor peers
    echo ""
    echo -e "${BLUE}Anchor peer configuration...${NC}"
    echo "Note: Anchor peers are defined in configtx.yaml and are automatically"
    echo "configured when the channel is created with the genesis block."
    echo "No additional anchor peer updates are needed."
    
    # Verify channel
    echo ""
    verifyChannel
    
    echo ""
    echo -e "${GREEN}Channel $CHANNEL_NAME created and configured successfully!${NC}"
    echo ""
    echo "Next step: Deploy chaincode with ./scripts/deploy-chaincode.sh"
}

# Run main function
main