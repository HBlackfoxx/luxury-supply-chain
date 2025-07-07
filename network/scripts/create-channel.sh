#!/bin/bash

# Create and join channel for the luxury supply chain network

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load environment variables
source .env

BRAND_NAME_LOWER=$(echo ${BRAND_NAME} | tr '[:upper:]' '[:lower:]')


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

# Function to create channel
createChannel() {
    echo -e "${YELLOW}Creating channel $CHANNEL_NAME...${NC}"
    
        
    # Set environment for brand peer0
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="${BRAND_NAME}MSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/${BRAND_NAME_LOWER}.${BRAND_DOMAIN}/peers/peer0.${BRAND_NAME_LOWER}.${BRAND_DOMAIN}/tls/ca.crt
    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${BRAND_NAME_LOWER}.${BRAND_DOMAIN}/users/Admin@${BRAND_NAME_LOWER}.${BRAND_DOMAIN}/msp
    export CORE_PEER_ADDRESS=peer0.${BRAND_NAME_LOWER}.${BRAND_DOMAIN}:7051
    
    local ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem
    
    # Create the channel
    docker exec \
        -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
        -e CORE_PEER_TLS_ENABLED=$CORE_PEER_TLS_ENABLED \
        -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
        -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
        -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
        peer0.${BRAND_NAME_LOWER}.${BRAND_DOMAIN} \
        peer channel create \
            -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
            -c $CHANNEL_NAME \
            -f ./channel-artifacts/${CHANNEL_NAME}.tx \
            --tls \
            --cafile $ORDERER_CA \
            --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create channel${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Channel created successfully${NC}"
}

# Function to join peer to channel
joinChannel() {
    local ORG=$1
    local PEER=$2
    local PORT=$3
    
    local ORG_LOWER=$(echo ${ORG} | tr '[:upper:]' '[:lower:]')
    
    echo -e "${YELLOW}Joining $PEER.$ORG to channel...${NC}"
    echo -e "${YELLOW}Joining $PEER.$ORG to channel...${NC}"
    
    # Set peer environment
    if [ "$ORG" == "${BRAND_NAME}" ]; then
        export CORE_PEER_LOCALMSPID="${BRAND_NAME}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/peers/${PEER}.${ORG_LOWER}.${BRAND_DOMAIN}/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/users/Admin@${ORG_LOWER}.${BRAND_DOMAIN}/msp
    else
        export CORE_PEER_LOCALMSPID="${ORG}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/peers/${PEER}.${ORG_LOWER}.${BRAND_DOMAIN}/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/users/Admin@${ORG_LOWER}.${BRAND_DOMAIN}/msp
    fi
    
    export CORE_PEER_ADDRESS=${PEER}.${ORG_LOWER}.${BRAND_DOMAIN}:${PORT}
    
    # Join channel
    docker exec \
        -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
        -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
        -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
        ${PEER}.${ORG_LOWER}.${BRAND_DOMAIN} \
        peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}$PEER.$ORG joined channel successfully${NC}"
    else
        echo -e "${RED}Failed to join $PEER.$ORG to channel${NC}"
        return 1
    fi
}

# Function to update anchor peers
updateAnchorPeers() {
    local ORG=$1
    local ORG_LOWER=$(echo ${ORG} | tr '[:upper:]' '[:lower:]')
    
    echo -e "${YELLOW}Updating anchor peer for $ORG...${NC}"
    
    # Set peer environment
    if [ "$ORG" == "${BRAND_NAME}" ]; then
        export CORE_PEER_LOCALMSPID="${BRAND_NAME}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/peers/peer0.${ORG_LOWER}.${BRAND_DOMAIN}/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/users/Admin@${ORG_LOWER}.${BRAND_DOMAIN}/msp
    else
        export CORE_PEER_LOCALMSPID="${ORG}MSP"
        export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/peers/peer0.${ORG_LOWER}.${BRAND_DOMAIN}/tls/ca.crt
        export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG_LOWER}.${BRAND_DOMAIN}/users/Admin@${ORG_LOWER}.${BRAND_DOMAIN}/msp
    fi
    
    export CORE_PEER_ADDRESS=peer0.${ORG_LOWER}.${BRAND_DOMAIN}:7051
    
    local ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem
    
    # Update anchor peer
    docker exec \
        -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
        -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
        -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
        peer0.${ORG_LOWER}.${BRAND_DOMAIN} \
        peer channel update \
            -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
            -c $CHANNEL_NAME \
            -f ./channel-artifacts/${CORE_PEER_LOCALMSPID}anchors.tx \
            --tls \
            --cafile $ORDERER_CA
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Anchor peer updated for $ORG${NC}"
    else
        echo -e "${RED}Failed to update anchor peer for $ORG${NC}"
    fi
}

# Function to verify channel creation
verifyChannel() {
    echo -e "${YELLOW}Verifying channel creation...${NC}"
    
    # List channels on peer0
    docker exec peer0.${BRAND_NAME_LOWER}.${BRAND_DOMAIN} peer channel list
    
    echo -e "${GREEN}Channel verification complete${NC}"
}

# Main execution
main() {
    echo "Starting channel creation process..."
    echo ""
    
    # Verify network is running
    verifyNetwork
    
    # Create channel
    createChannel
    
    # Join peers to channel
    echo ""
    echo -e "${BLUE}Joining peers to channel...${NC}"
    
    # Join brand peers
    joinChannel ${BRAND_NAME} peer0 7051
    joinChannel ${BRAND_NAME} peer1 8051
    
    # Join supplier peers
    joinChannel supplier1 peer0 9051
    
    # Join manufacturer peers
    joinChannel manufacturer1 peer0 10051
    
    # Join retailer peers
    joinChannel retailer1 peer0 11051
    
    # Update anchor peers
    echo ""
    echo -e "${BLUE}Updating anchor peers...${NC}"
    
    updateAnchorPeers ${BRAND_NAME}
    updateAnchorPeers supplier1
    updateAnchorPeers manufacturer1
    updateAnchorPeers retailer1
    
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