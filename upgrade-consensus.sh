#!/bin/bash

# Upgrade 2check-consensus chaincode with fixed time handling

CHANNEL_NAME="luxury-supply-chain"
CC_NAME="2check-consensus"
CC_VERSION="1.1"
CC_SEQUENCE="2"
BRAND_DOMAIN="luxe-bags.luxury"

echo "Preparing upgraded chaincode..."

# Build dependencies
docker run --rm \
    -v "/Volumes/New Volume/Github/luxury-supply-chain/chaincode":/chaincode \
    -w /chaincode \
    golang:1.20 \
    bash -c "cd 2check-consensus && go mod vendor"

# Copy chaincode to peers
for peer in peer0.luxebags.${BRAND_DOMAIN} peer0.italianleather.${BRAND_DOMAIN} peer0.craftworkshop.${BRAND_DOMAIN} peer0.luxuryretail.${BRAND_DOMAIN}; do
    echo "Copying chaincode to $peer..."
    docker cp "/Volumes/New Volume/Github/luxury-supply-chain/chaincode/2check-consensus" ${peer}:/opt/gopath/src/github.com/hyperledger/fabric/chaincode/
done

# Package chaincode on first peer
echo "Packaging upgraded chaincode..."
docker exec peer0.luxebags.${BRAND_DOMAIN} bash -c "
    rm -rf /tmp/${CC_NAME}_pkg /tmp/${CC_NAME}.tar.gz
    mkdir -p /tmp/${CC_NAME}_pkg/src
    cp -r /opt/gopath/src/github.com/hyperledger/fabric/chaincode/2check-consensus/* /tmp/${CC_NAME}_pkg/src/
    echo '{\"type\":\"golang\",\"label\":\"${CC_NAME}_${CC_VERSION}\"}' > /tmp/${CC_NAME}_pkg/metadata.json
    cd /tmp/${CC_NAME}_pkg && tar -czf code.tar.gz src
    tar -czf /tmp/${CC_NAME}.tar.gz metadata.json code.tar.gz
"

# Copy package to other peers
for peer in peer0.italianleather.${BRAND_DOMAIN} peer0.craftworkshop.${BRAND_DOMAIN} peer0.luxuryretail.${BRAND_DOMAIN}; do
    echo "Copying package to $peer..."
    docker exec peer0.luxebags.${BRAND_DOMAIN} cat /tmp/${CC_NAME}.tar.gz | docker exec -i ${peer} bash -c "cat > /tmp/${CC_NAME}.tar.gz"
done

# Install on all peers
echo "Installing chaincode on all peers..."
for org in luxebags italianleather craftworkshop luxuryretail; do
    echo "Installing on $org..."
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/$org.${BRAND_DOMAIN}/users/Admin@$org.${BRAND_DOMAIN}/msp \
        peer0.$org.${BRAND_DOMAIN} peer lifecycle chaincode install /tmp/${CC_NAME}.tar.gz
done

# Get package ID from first peer
PACKAGE_ID=$(docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
    peer0.luxebags.${BRAND_DOMAIN} peer lifecycle chaincode queryinstalled 2>&1 | grep "${CC_NAME}_${CC_VERSION}" | tail -1 | awk -F'[, ]+' '{print $3}')

echo "Package ID: $PACKAGE_ID"

# Approve for all organizations
echo "Approving chaincode for all organizations..."
for org in luxebags italianleather craftworkshop luxuryretail; do
    echo "Approving for $org..."
    docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/$org.${BRAND_DOMAIN}/users/Admin@$org.${BRAND_DOMAIN}/msp \
        peer0.$org.${BRAND_DOMAIN} peer lifecycle chaincode approveformyorg \
        -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
        --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
        --tls \
        --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/tlsca/tlsca.orderer.${BRAND_DOMAIN}-cert.pem \
        --channelID ${CHANNEL_NAME} \
        --name ${CC_NAME} \
        --version ${CC_VERSION} \
        --package-id ${PACKAGE_ID} \
        --sequence ${CC_SEQUENCE}
done

# Check commit readiness
echo "Checking commit readiness..."
docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
    peer0.luxebags.${BRAND_DOMAIN} peer lifecycle chaincode checkcommitreadiness \
    --channelID ${CHANNEL_NAME} \
    --name ${CC_NAME} \
    --version ${CC_VERSION} \
    --sequence ${CC_SEQUENCE} \
    --output json

# Copy TLS certs for commit
echo "Copying TLS certificates..."
for org in italianleather craftworkshop luxuryretail; do
    docker exec peer0.$org.${BRAND_DOMAIN} cat /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/$org.${BRAND_DOMAIN}/tlsca/tlsca.$org.${BRAND_DOMAIN}-cert.pem | \
    docker exec -i peer0.luxebags.${BRAND_DOMAIN} bash -c "mkdir -p /tmp/tlscerts && cat > /tmp/tlscerts/tlsca.$org.${BRAND_DOMAIN}-cert.pem"
done

# Commit chaincode
echo "Committing chaincode upgrade..."
docker exec -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/users/Admin@luxebags.${BRAND_DOMAIN}/msp \
    peer0.luxebags.${BRAND_DOMAIN} peer lifecycle chaincode commit \
    -o orderer1.orderer.${BRAND_DOMAIN}:7050 \
    --ordererTLSHostnameOverride orderer1.orderer.${BRAND_DOMAIN} \
    --tls \
    --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/orderer.${BRAND_DOMAIN}/tlsca/tlsca.orderer.${BRAND_DOMAIN}-cert.pem \
    --channelID ${CHANNEL_NAME} \
    --name ${CC_NAME} \
    --version ${CC_VERSION} \
    --sequence ${CC_SEQUENCE} \
    --peerAddresses peer0.luxebags.${BRAND_DOMAIN}:7051 \
    --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/luxebags.${BRAND_DOMAIN}/tlsca/tlsca.luxebags.${BRAND_DOMAIN}-cert.pem \
    --peerAddresses peer0.italianleather.${BRAND_DOMAIN}:9051 \
    --tlsRootCertFiles /tmp/tlscerts/tlsca.italianleather.${BRAND_DOMAIN}-cert.pem \
    --peerAddresses peer0.craftworkshop.${BRAND_DOMAIN}:10051 \
    --tlsRootCertFiles /tmp/tlscerts/tlsca.craftworkshop.${BRAND_DOMAIN}-cert.pem \
    --peerAddresses peer0.luxuryretail.${BRAND_DOMAIN}:11051 \
    --tlsRootCertFiles /tmp/tlscerts/tlsca.luxuryretail.${BRAND_DOMAIN}-cert.pem

echo "Chaincode upgrade complete!"