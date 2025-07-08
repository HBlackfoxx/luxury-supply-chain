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
    
    # Set environment for luxebags peer0
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="LuxeBagsMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/peerOrganizations/luxebags.${BRAND_DOMAIN}/peers/peer0.luxebags.${BRAND_DOMAIN}/tls/ca.crt
    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp
    export CORE_PEER_ADDRESS=peer0.luxebags.${BRAND_DOMAIN}:7051
    
    local ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem
    
    # Create the channel
    docker exec \
        -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
        -e CORE_PEER_TLS_ENABLED=$CORE_PEER_TLS_ENABLED \
        -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
        -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
        -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
        peer0.luxebags.${BRAND_DOMAIN} \
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
    local ORG_MSP=$2
    local PEER=$3
    local PORT=$4
    
    echo -e "${YELLOW}Joining $PEER.$ORG to channel...${NC}"
    
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
        peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}$PEER.$ORG joined channel successfully${NC}"
    else
        echo -e "${RED}Failed to join $PEER.$ORG to channel${NC}"
        return 1
    fi
}

# Function to set environment variables for a specific org's admin
setAdminEnv() {
  local ORG=$1
  local ORG_MSP=$2
  local PORT=$3

  export CORE_PEER_LOCALMSPID="$ORG_MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/peers/peer0.${ORG}.${BRAND_DOMAIN}/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/users/Admin@${ORG}.${BRAND_DOMAIN}/msp
  export CORE_PEER_ADDRESS=peer0.${ORG}.${BRAND_DOMAIN}:${PORT}
}

# Function to update all anchor peers in a single, multi-signed transaction
updateAllAnchorPeers() {
  echo -e "${BLUE}Updating anchor peers for all organizations (multi-signature process)...${NC}"
  local CHANNEL_NAME="luxury-supply-chain"
  local ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem
  local ORDERER_ADDRESS="orderer1.orderer.${BRAND_DOMAIN}:7050"

  # Step 1: LuxeBags fetches the config, creates the update, and signs it
  echo -e "${YELLOW}Step 1: LuxeBags creating and signing the config update...${NC}"
  setAdminEnv luxebags LuxeBagsMSP 7051
  
  docker exec peer0.luxebags.${BRAND_DOMAIN} bash -c "
    peer channel fetch config config_block.pb -o $ORDERER_ADDRESS -c $CHANNEL_NAME --tls --cafile $ORDERER_CA
    
    configtxlator proto_decode --input config_block.pb --type common.Block | jq .data.data[0].payload.data.config > config.json
    
    jq '.channel_group.groups.Application.groups.LuxeBagsMSP.values += {\"AnchorPeers\":{\"mod_policy\": \"Admins\",\"value\":{\"anchor_peers\": [{\"host\": \"peer0.luxebags.${BRAND_DOMAIN}\",\"port\": 7051}]},\"version\": \"0\"}}' config.json > modified_config.json
    jq '.channel_group.groups.Application.groups.ItalianLeatherMSP.values += {\"AnchorPeers\":{\"mod_policy\": \"Admins\",\"value\":{\"anchor_peers\": [{\"host\": \"peer0.italianleather.${BRAND_DOMAIN}\",\"port\": 9051}]},\"version\": \"0\"}}' modified_config.json > tmp.json && mv tmp.json modified_config.json
    jq '.channel_group.groups.Application.groups.CraftWorkshopMSP.values += {\"AnchorPeers\":{\"mod_policy\": \"Admins\",\"value\":{\"anchor_peers\": [{\"host\": \"peer0.craftworkshop.${BRAND_DOMAIN}\",\"port\": 10051}]},\"version\": \"0\"}}' modified_config.json > tmp.json && mv tmp.json modified_config.json
    jq '.channel_group.groups.Application.groups.LuxuryRetailMSP.values += {\"AnchorPeers\":{\"mod_policy\": \"Admins\",\"value\":{\"anchor_peers\": [{\"host\": \"peer0.luxuryretail.${BRAND_DOMAIN}\",\"port\": 11051}]},\"version\": \"0\"}}' modified_config.json > tmp.json && mv tmp.json modified_config.json

    configtxlator proto_encode --input config.json --type common.Config --output config.pb
    configtxlator proto_encode --input modified_config.json --type common.Config --output modified_config.pb
    configtxlator compute_update --channel_id $CHANNEL_NAME --original config.pb --updated modified_config.pb --output all_anchors_update.pb
    
    configtxlator proto_decode --input all_anchors_update.pb --type common.ConfigUpdate | jq . > all_anchors_update.json
    echo '{\"payload\":{\"header\":{\"channel_header\":{\"channel_id\":\"'$CHANNEL_NAME'\", \"type\":2}},\"data\":{\"config_update\":'\$(cat all_anchors_update.json)'}}}' | jq . > all_anchors_update_in_envelope.json
    configtxlator proto_encode --input all_anchors_update_in_envelope.json --type common.Envelope --output /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/all_anchors_update_in_envelope.pb
    
    peer channel signconfigtx -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/all_anchors_update_in_envelope.pb
  "
  
  # Step 2: ItalianLeather signs the update
  echo -e "${YELLOW}Step 2: ItalianLeather signing the config update...${NC}"
  setAdminEnv italianleather ItalianLeatherMSP 9051
  docker exec peer0.italianleather.${BRAND_DOMAIN} peer channel signconfigtx -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/all_anchors_update_in_envelope.pb

  # Step 3: CraftWorkshop signs the update (we now have 3 of 4 signatures - a majority)
  echo -e "${YELLOW}Step 3: CraftWorkshop signing the config update...${NC}"
  setAdminEnv craftworkshop CraftWorkshopMSP 10051
  docker exec peer0.craftworkshop.${BRAND_DOMAIN} peer channel signconfigtx -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/all_anchors_update_in_envelope.pb
  
  # Step 4: LuxeBags submits the multi-signed update
  echo -e "${YELLOW}Step 4: LuxeBags submitting the fully signed update...${NC}"
  setAdminEnv luxebags LuxeBagsMSP 7051
  docker exec peer0.luxebags.${BRAND_DOMAIN} peer channel update -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/all_anchors_update_in_envelope.pb -o $ORDERER_ADDRESS -c $CHANNEL_NAME --tls --cafile $ORDERER_CA

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}All anchor peers updated successfully!${NC}"
  else
    echo -e "${RED}Failed to update anchor peers.${NC}"
    exit 1
  fi
}


# Function to update anchor peers
updateAnchorPeers() {
    local ORG=$1
    local ORG_MSP=$2
    
    echo -e "${YELLOW}Updating anchor peer for $ORG_MSP...${NC}"
    
    # Set peer environment
    export CORE_PEER_LOCALMSPID="${ORG_MSP}"
    export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/peers/peer0.${ORG}.${BRAND_DOMAIN}/tls/ca.crt
    export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/${ORG}.${BRAND_DOMAIN}/users/Admin@${ORG}.${BRAND_DOMAIN}/msp
    export CORE_PEER_ADDRESS=peer0.${ORG}.${BRAND_DOMAIN}:7051
    
    local ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/orderers/orderer1.orderer.${BRAND_DOMAIN}/msp/tlscacerts/tlsca.orderer.${BRAND_DOMAIN}-cert.pem
    
    # Update anchor peer
    docker exec \
        -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE \
        -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH \
        -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS \
        peer0.${ORG}.${BRAND_DOMAIN} \
        peer channel update \
            -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
            -c $CHANNEL_NAME \
            -f ./channel-artifacts/${ORG_MSP}anchors.tx \
            --tls \
            --cafile $ORDERER_CA
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Anchor peer updated for $ORG_MSP${NC}"
    else
        echo -e "${RED}Failed to update anchor peer for $ORG_MSP${NC}"
    fi
}

# Function to verify channel creation
verifyChannel() {
    echo -e "${YELLOW}Verifying channel creation...${NC}"
    
    # List channels on peer0
    docker exec peer0.luxebags.${BRAND_DOMAIN} peer channel list
    
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
    
    # Join luxebags peers
    joinChannel luxebags LuxeBagsMSP peer0 7051
    joinChannel luxebags LuxeBagsMSP peer1 8051
    
    # Join italianleather peers
    joinChannel italianleather ItalianLeatherMSP peer0 9051
    
    # Join craftworkshop peers
    joinChannel craftworkshop CraftWorkshopMSP peer0 10051
    
    # Join luxuryretail peers
    joinChannel luxuryretail LuxuryRetailMSP peer0 11051
    
    # Update anchor peers
    echo ""
    echo -e "${BLUE}Updating anchor peers...${NC}"
    
    updateAllAnchorPeers
    
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