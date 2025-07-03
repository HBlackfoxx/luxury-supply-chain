#!/bin/bash

# Utility functions for network generation and management

# Function to check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check for required tools
    local tools=("docker" "docker-compose" "yq" "jq" "envsubst")
    for tool in "${tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            echo "Error: $tool is required but not installed."
            exit 1
        fi
    done
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        echo "Error: Docker daemon is not running."
        exit 1
    fi
    
    echo "All prerequisites satisfied."
}

# Function to generate Docker Compose file
generate_docker_compose() {
    local brand_config=$1
    local output_file=$2
    
    # Start with base Docker Compose structure
    cat > $output_file << 'EOF'
version: '3.7'

volumes:
EOF
    
    # Generate volumes for each organization
    local orgs=$(yq eval '.network.organizations[].id' $brand_config)
    for org in $orgs; do
        echo "  ${org}_peer0:" >> $output_file
    done
    echo "  orderer1_data:" >> $output_file
    echo "  orderer2_data:" >> $output_file
    echo "  orderer3_data:" >> $output_file
    echo "" >> $output_file
    
    # Networks section
    cat >> $output_file << 'EOF'
networks:
  luxury-network:
    name: ${NETWORK_NAME}

services:
EOF
    
    # Generate orderer services
    generate_orderer_services $brand_config >> $output_file
    
    # Generate peer services
    generate_peer_services $brand_config >> $output_file
    
    # Generate CA services
    generate_ca_services $brand_config >> $output_file
    
    # Generate CouchDB services
    generate_couchdb_services $brand_config >> $output_file
}

# Function to generate orderer services
generate_orderer_services() {
    local brand_config=$1
    local orderers=$(yq eval '.network.orderers' $brand_config)
    
    echo "  # Orderer Services"
    
    local i=0
    echo "$orderers" | yq eval '.[] | select(. != null)' | while IFS= read -r orderer; do
        local name=$(echo "$orderer" | yq eval '.name')
        local port=$(echo "$orderer" | yq eval '.port')
        local ops_port=$(echo "$orderer" | yq eval '.operationsPort')
        
        cat << EOF
  $name.orderer.\${BRAND_DOMAIN}:
    container_name: $name.orderer.\${BRAND_DOMAIN}
    image: hyperledger/fabric-orderer:\${IMAGE_TAG}
    labels:
      service: hyperledger-fabric
    environment:
      - FABRIC_LOGGING_SPEC=INFO
      - ORDERER_GENERAL_LISTENADDRESS=0.0.0.0
      - ORDERER_GENERAL_LISTENPORT=$port
      - ORDERER_GENERAL_LOCALMSPID=OrdererMSP
      - ORDERER_GENERAL_LOCALMSPDIR=/var/hyperledger/orderer/msp
      - ORDERER_GENERAL_TLS_ENABLED=true
      - ORDERER_GENERAL_TLS_PRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_TLS_CERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_TLS_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
      - ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_CLUSTER_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
      - ORDERER_GENERAL_BOOTSTRAPMETHOD=none
      - ORDERER_CHANNELPARTICIPATION_ENABLED=true
      - ORDERER_ADMIN_TLS_ENABLED=true
      - ORDERER_ADMIN_TLS_CERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_ADMIN_TLS_PRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_ADMIN_TLS_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
      - ORDERER_ADMIN_TLS_CLIENTROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
      - ORDERER_ADMIN_LISTENADDRESS=0.0.0.0:$((port + 3))
      - ORDERER_OPERATIONS_LISTENADDRESS=0.0.0.0:$ops_port
      - ORDERER_METRICS_PROVIDER=prometheus
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric
    command: orderer
    volumes:
      - ../network/system-genesis-block:/var/hyperledger/orderer
      - ../network/organizations/ordererOrganizations/orderer.\${BRAND_DOMAIN}/orderers/$name.orderer.\${BRAND_DOMAIN}/msp:/var/hyperledger/orderer/msp
      - ../network/organizations/ordererOrganizations/orderer.\${BRAND_DOMAIN}/orderers/$name.orderer.\${BRAND_DOMAIN}/tls:/var/hyperledger/orderer/tls
      - ${name}_data:/var/hyperledger/production/orderer
    ports:
      - $port:$port
      - $((port + 3)):$((port + 3))
      - $ops_port:$ops_port
    networks:
      - luxury-network

EOF
        ((i++))
    done
}

# Function to generate peer services
generate_peer_services() {
    local brand_config=$1
    
    echo "  # Peer Services"
    
    yq eval '.network.organizations[]' $brand_config | while IFS= read -r org; do
        local org_id=$(echo "$org" | yq eval '.id')
        local org_name=$(echo "$org" | yq eval '.name')
        local msp_id=$(echo "$org" | yq eval '.mspId')
        
        echo "$org" | yq eval '.peers[]' | while IFS= read -r peer; do
            local peer_name=$(echo "$peer" | yq eval '.name')
            local peer_port=$(echo "$peer" | yq eval '.port')
            local chaincode_port=$(echo "$peer" | yq eval '.chaincodePort')
            local ops_port=$(echo "$peer" | yq eval '.operationsPort')
            
            cat << EOF
  $peer_name.$org_id.\${BRAND_DOMAIN}:
    container_name: $peer_name.$org_id.\${BRAND_DOMAIN}
    image: hyperledger/fabric-peer:\${IMAGE_TAG}
    labels:
      service: hyperledger-fabric
    environment:
      - FABRIC_LOGGING_SPEC=INFO
      - CORE_PEER_ID=$peer_name.$org_id.\${BRAND_DOMAIN}
      - CORE_PEER_ADDRESS=$peer_name.$org_id.\${BRAND_DOMAIN}:$peer_port
      - CORE_PEER_LISTENADDRESS=0.0.0.0:$peer_port
      - CORE_PEER_CHAINCODEADDRESS=$peer_name.$org_id.\${BRAND_DOMAIN}:$chaincode_port
      - CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:$chaincode_port
      - CORE_PEER_GOSSIP_BOOTSTRAP=$peer_name.$org_id.\${BRAND_DOMAIN}:$peer_port
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=$peer_name.$org_id.\${BRAND_DOMAIN}:$peer_port
      - CORE_PEER_LOCALMSPID=$msp_id
      - CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/msp
      - CORE_OPERATIONS_LISTENADDRESS=0.0.0.0:$ops_port
      - CORE_METRICS_PROVIDER=prometheus
      - CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG={"peername":"$peer_name.$org_id"}
      - CORE_CHAINCODE_EXECUTETIMEOUT=300s
      - CORE_PEER_TLS_ENABLED=true
      - CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt
      - CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key
      - CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
      - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb_$peer_name\_$org_id:5984
      - CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME=admin
      - CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD=adminpw
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - ../network/organizations/peerOrganizations/$org_id.\${BRAND_DOMAIN}/peers/$peer_name.$org_id.\${BRAND_DOMAIN}/msp:/etc/hyperledger/fabric/msp
      - ../network/organizations/peerOrganizations/$org_id.\${BRAND_DOMAIN}/peers/$peer_name.$org_id.\${BRAND_DOMAIN}/tls:/etc/hyperledger/fabric/tls
      - ${org_id}_${peer_name}:/var/hyperledger/production
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric/peer
    command: peer node start
    ports:
      - $peer_port:$peer_port
      - $ops_port:$ops_port
    networks:
      - luxury-network
    depends_on:
      - couchdb_$peer_name\_$org_id

EOF
        done
    done
}

# Function to generate CA services
generate_ca_services() {
    local brand_config=$1
    
    echo "  # Certificate Authority Services"
    
    local ca_port=7054
    yq eval '.network.organizations[]' $brand_config | while IFS= read -r org; do
        local org_id=$(echo "$org" | yq eval '.id')
        
        cat << EOF
  ca_$org_id:
    image: hyperledger/fabric-ca:\${IMAGE_TAG}
    labels:
      service: hyperledger-fabric
    environment:
      - FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server
      - FABRIC_CA_SERVER_CA_NAME=ca-$org_id
      - FABRIC_CA_SERVER_TLS_ENABLED=true
      - FABRIC_CA_SERVER_PORT=$ca_port
      - FABRIC_CA_SERVER_OPERATIONS_LISTENADDRESS=0.0.0.0:1$ca_port
    ports:
      - "$ca_port:$ca_port"
      - "1$ca_port:1$ca_port"
    command: sh -c 'fabric-ca-server start -b admin:adminpw -d'
    volumes:
      - ../network/organizations/fabric-ca/$org_id:/etc/hyperledger/fabric-ca-server
    container_name: ca_$org_id
    networks:
      - luxury-network

EOF
        ((ca_port++))
    done
}

# Function to generate CouchDB services
generate_couchdb_services() {
    local brand_config=$1
    
    echo "  # CouchDB Services"
    
    local couch_port=5984
    yq eval '.network.organizations[]' $brand_config | while IFS= read -r org; do
        local org_id=$(echo "$org" | yq eval '.id')
        
        echo "$org" | yq eval '.peers[]' | while IFS= read -r peer; do
            local peer_name=$(echo "$peer" | yq eval '.name')
            
            cat << EOF
  couchdb_$peer_name\_$org_id:
    container_name: couchdb_$peer_name\_$org_id
    image: couchdb:3.3.2
    labels:
      service: hyperledger-fabric
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    ports:
      - "$couch_port:5984"
    networks:
      - luxury-network

EOF
            ((couch_port++))
        done
    done
}

# Function to generate connection profiles
generate_connection_profiles() {
    local brand_config=$1
    local output_dir=$2
    
    yq eval '.network.organizations[]' $brand_config | while IFS= read -r org; do
        local org_id=$(echo "$org" | yq eval '.id')
        local org_name=$(echo "$org" | yq eval '.name')
        local msp_id=$(echo "$org" | yq eval '.mspId')
        
        cat > $output_dir/connection-$org_id.json << EOF
{
    "name": "$org_name-network",
    "version": "1.0.0",
    "client": {
        "organization": "$org_name",
        "connection": {
            "timeout": {
                "peer": {
                    "endorser": "300"
                }
            }
        }
    },
    "organizations": {
        "$org_name": {
            "mspid": "$msp_id",
            "peers": [
EOF
        
        # Add peers
        local peer_count=$(echo "$org" | yq eval '.peers | length')
        local i=0
        echo "$org" | yq eval '.peers[]' | while IFS= read -r peer; do
            local peer_name=$(echo "$peer" | yq eval '.name')
            echo -n "                \"$peer_name.$org_id.\${BRAND_DOMAIN}\"" >> $output_dir/connection-$org_id.json
            ((i++))
            if [ $i -lt $peer_count ]; then
                echo "," >> $output_dir/connection-$org_id.json
            else
                echo "" >> $output_dir/connection-$org_id.json
            fi
        done
        
        cat >> $output_dir/connection-$org_id.json << EOF
            ],
            "certificateAuthorities": [
                "ca.$org_id.\${BRAND_DOMAIN}"
            ]
        }
    },
    "peers": {
EOF
        
        # Add peer details
        echo "$org" | yq eval '.peers[]' | while IFS= read -r peer; do
            local peer_name=$(echo "$peer" | yq eval '.name')
            local peer_port=$(echo "$peer" | yq eval '.port')
            
            cat >> $output_dir/connection-$org_id.json << EOF
        "$peer_name.$org_id.\${BRAND_DOMAIN}": {
            "url": "grpcs://localhost:$peer_port",
            "tlsCACerts": {
                "pem": "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----\\n"
            },
            "grpcOptions": {
                "ssl-target-name-override": "$peer_name.$org_id.\${BRAND_DOMAIN}",
                "hostnameOverride": "$peer_name.$org_id.\${BRAND_DOMAIN}"
            }
        },
EOF
        done
        
        # Close the JSON structure
        echo "    }" >> $output_dir/connection-$org_id.json
        echo "}" >> $output_dir/connection-$org_id.json
    done
}

# Function to generate network topology description
generate_network_topology() {
    local brand_config=$1
    
    echo "### Organizations"
    yq eval '.network.organizations[]' $brand_config | while IFS= read -r org; do
        local org_name=$(echo "$org" | yq eval '.name')
        local org_type=$(echo "$org" | yq eval '.type')
        local peer_count=$(echo "$org" | yq eval '.peers | length')
        echo "- **$org_name** ($org_type): $peer_count peer(s)"
    done
    
    echo ""
    echo "### Orderers"
    local orderer_count=$(yq eval '.network.orderers | length' $brand_config)
    echo "- **Raft Consensus**: $orderer_count orderer nodes"
    
    echo ""
    echo "### Channels"
    yq eval '.network.channels[]' $brand_config | while IFS= read -r channel; do
        local channel_name=$(echo "$channel" | yq eval '.name')
        echo "- **$channel_name**: Primary supply chain channel"
    done
}</document_content>
</invoke>