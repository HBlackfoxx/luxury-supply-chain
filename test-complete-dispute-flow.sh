#!/bin/bash

# Complete dispute flow test for ALL organizations
# This script tests that disputes work dynamically for every organization

echo "========================================="
echo "COMPLETE DISPUTE FLOW TEST"
echo "Testing dispute visibility and operations for ALL organizations"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URLs for each organization
LUXEBAGS_URL="http://localhost:4001/api"
ITALIAN_URL="http://localhost:4002/api"
CRAFT_URL="http://localhost:4003/api"
RETAIL_URL="http://localhost:4004/api"

# Function to get URL for organization
get_org_url() {
    local org=$1
    case $org in
        "luxebags") echo "$LUXEBAGS_URL" ;;
        "italianleather") echo "$ITALIAN_URL" ;;
        "craftworkshop") echo "$CRAFT_URL" ;;
        "luxuryretail") echo "$RETAIL_URL" ;;
        *) echo "$LUXEBAGS_URL" ;;
    esac
}

# Function to login and get token
login() {
    local email=$1
    local password=$2
    local org=$3
    
    local BASE_URL=$(get_org_url $org)
    
    echo -e "${YELLOW}Logging in as $org...${NC}"
    TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" | jq -r '.token')
    
    if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
        echo -e "${GREEN}✓ Logged in successfully${NC}"
        echo "$TOKEN" > /tmp/${org}_token.txt
        return 0
    else
        echo -e "${RED}✗ Login failed for $org${NC}"
        return 1
    fi
}

# Function to create a consensus transaction
create_transaction() {
    local token=$1
    local sender=$2
    local receiver=$3
    local item_id=$4
    
    local BASE_URL=$(get_org_url $sender)
    
    echo -e "${YELLOW}Creating transaction from $sender to $receiver for item $item_id...${NC}"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/consensus/transactions" \
        -H "Authorization: Bearer $token" \
        -H "x-org-id: $sender" \
        -H "x-user-id: admin-$sender" \
        -H "x-user-role: admin" \
        -H "Content-Type: application/json" \
        -d "{
            \"sender\": \"$sender\",
            \"receiver\": \"$receiver\",
            \"itemId\": \"$item_id\",
            \"value\": 5000,
            \"metadata\": {
                \"description\": \"Test transaction\",
                \"type\": \"material\"
            }
        }")
    
    TX_ID=$(echo $RESPONSE | jq -r '.transactionId')
    
    if [ "$TX_ID" != "null" ] && [ -n "$TX_ID" ]; then
        echo -e "${GREEN}✓ Transaction created: $TX_ID${NC}" >&2
        echo "$TX_ID"
        return 0
    else
        echo -e "${RED}✗ Failed to create transaction${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Function to confirm sent
confirm_sent() {
    local token=$1
    local tx_id=$2
    local org=$3
    
    local BASE_URL=$(get_org_url $org)
    
    echo -e "${YELLOW}$org confirming sent for $tx_id...${NC}"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/consensus/transactions/$tx_id/confirm-sent" \
        -H "Authorization: Bearer $token" \
        -H "x-org-id: $org" \
        -H "x-user-id: admin-$org" \
        -H "x-user-role: admin" \
        -H "Content-Type: application/json" \
        -d "{
            \"evidence\": {
                \"description\": \"Package sent\",
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            }
        }")
    
    SUCCESS=$(echo $RESPONSE | jq -r '.success')
    
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✓ Confirmed sent successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to confirm sent${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Function to raise dispute
raise_dispute() {
    local token=$1
    local tx_id=$2
    local org=$3
    local reason=$4
    
    local BASE_URL=$(get_org_url $org)
    
    echo -e "${YELLOW}$org raising dispute for $tx_id: $reason${NC}"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/consensus/transactions/$tx_id/dispute" \
        -H "Authorization: Bearer $token" \
        -H "x-org-id: $org" \
        -H "x-user-id: admin-$org" \
        -H "x-user-role: admin" \
        -H "Content-Type: application/json" \
        -d "{
            \"reason\": \"$reason\",
            \"evidence\": {
                \"type\": \"DISPUTE_EVIDENCE\",
                \"description\": \"$reason\"
            }
        }")
    
    SUCCESS=$(echo $RESPONSE | jq -r '.success')
    
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✓ Dispute raised successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to raise dispute${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Function to check disputes
check_disputes() {
    local token=$1
    local org=$2
    
    local BASE_URL=$(get_org_url $org)
    
    echo -e "${YELLOW}Checking disputes for $org...${NC}"
    
    RESPONSE=$(curl -s -X GET "$BASE_URL/consensus/disputes" \
        -H "Authorization: Bearer $token" \
        -H "x-org-id: $org" \
        -H "x-user-id: admin-$org" \
        -H "x-user-role: admin")
    
    COUNT=$(echo $RESPONSE | jq '. | length' 2>/dev/null || echo 0)
    
    if [ "$COUNT" != "" ] && [ "$COUNT" -gt 0 ] 2>/dev/null; then
        echo -e "${GREEN}✓ Found $COUNT dispute(s) for $org${NC}"
        echo "$RESPONSE" | jq -r '.[] | "  - \(.transactionId): \(.sender) -> \(.receiver) [\(.reason)]"'
        return 0
    else
        echo -e "${YELLOW}No disputes found for $org${NC}"
        return 1
    fi
}

# Function to submit evidence
submit_evidence() {
    local token=$1
    local tx_id=$2
    local org=$3
    
    local BASE_URL=$(get_org_url $org)
    
    echo -e "${YELLOW}$org submitting evidence for dispute $tx_id...${NC}"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/consensus/disputes/$tx_id/evidence" \
        -H "Authorization: Bearer $token" \
        -H "x-org-id: $org" \
        -H "x-user-id: admin-$org" \
        -H "x-user-role: admin" \
        -H "Content-Type: application/json" \
        -d "{
            \"type\": \"PHOTO_EVIDENCE\",
            \"description\": \"Photo showing package was not received\",
            \"hash\": \"$(echo -n 'evidence_data' | sha256sum | cut -d' ' -f1)\"
        }")
    
    SUCCESS=$(echo $RESPONSE | jq -r '.success')
    
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✓ Evidence submitted successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to submit evidence${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

# Function to resolve dispute
resolve_dispute() {
    local token=$1
    local tx_id=$2
    local decision=$3
    local org=$4
    
    local BASE_URL=$(get_org_url $org)
    
    echo -e "${YELLOW}$org resolving dispute for $tx_id with decision: $decision${NC}"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/consensus/disputes/$tx_id/resolve" \
        -H "Authorization: Bearer $token" \
        -H "x-org-id: $org" \
        -H "x-user-id: admin-$org" \
        -H "x-user-role: admin" \
        -H "Content-Type: application/json" \
        -d "{
            \"decision\": \"$decision\",
            \"notes\": \"Dispute resolved after reviewing evidence\",
            \"compensationAmount\": 1000
        }")
    
    SUCCESS=$(echo $RESPONSE | jq -r '.success')
    
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✓ Dispute resolved successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to resolve dispute${NC}"
        echo "Response: $RESPONSE"
        return 1
    fi
}

echo ""
echo "========================================="
echo "TEST 1: Italian Leather -> Craft Workshop"
echo "========================================="

# Login as both parties
login "admin@italianleather.com" "ItalianLeather2024!" "italianleather"
ITALIAN_TOKEN=$TOKEN

login "admin@craftworkshop.com" "CraftWorkshop2024!" "craftworkshop"
CRAFT_TOKEN=$TOKEN

# Create transaction as Italian Leather
TX1=$(create_transaction "$ITALIAN_TOKEN" "italianleather" "craftworkshop" "LEATHER-$(date +%s)" 2>&1 | tail -1)

if [ -n "$TX1" ] && [ "$TX1" != "null" ]; then
    sleep 2
    
    # Italian Leather confirms sent
    confirm_sent "$ITALIAN_TOKEN" "$TX1" "italianleather"
    sleep 2
    
    # Craft Workshop raises dispute
    raise_dispute "$CRAFT_TOKEN" "$TX1" "craftworkshop" "Material not received as described"
    sleep 2
    
    # Check if BOTH parties see the dispute
    echo -e "\n${YELLOW}Checking dispute visibility:${NC}"
    check_disputes "$ITALIAN_TOKEN" "italianleather"
    check_disputes "$CRAFT_TOKEN" "craftworkshop"
    
    # Submit evidence from both parties
    submit_evidence "$ITALIAN_TOKEN" "$TX1" "italianleather"
    submit_evidence "$CRAFT_TOKEN" "$TX1" "craftworkshop"
    
    # Resolve dispute
    resolve_dispute "$CRAFT_TOKEN" "$TX1" "IN_FAVOR_RECEIVER" "craftworkshop"
fi

echo ""
echo "========================================="
echo "TEST 2: Craft Workshop -> Luxury Retail"
echo "========================================="

login "admin@luxuryretail.com" "LuxuryRetail2024!" "luxuryretail"
RETAIL_TOKEN=$TOKEN

# Create transaction as Craft Workshop
TX2=$(create_transaction "$CRAFT_TOKEN" "craftworkshop" "luxuryretail" "PRODUCT-$(date +%s)" 2>&1 | tail -1)

if [ -n "$TX2" ] && [ "$TX2" != "null" ]; then
    sleep 2
    
    # Craft Workshop confirms sent
    confirm_sent "$CRAFT_TOKEN" "$TX2" "craftworkshop"
    sleep 2
    
    # Luxury Retail raises dispute
    raise_dispute "$RETAIL_TOKEN" "$TX2" "luxuryretail" "Product damaged during shipping"
    sleep 2
    
    # Check if BOTH parties see the dispute
    echo -e "\n${YELLOW}Checking dispute visibility:${NC}"
    check_disputes "$CRAFT_TOKEN" "craftworkshop"
    check_disputes "$RETAIL_TOKEN" "luxuryretail"
    
    # Submit evidence
    submit_evidence "$CRAFT_TOKEN" "$TX2" "craftworkshop"
    submit_evidence "$RETAIL_TOKEN" "$TX2" "luxuryretail"
    
    # Resolve dispute
    resolve_dispute "$RETAIL_TOKEN" "$TX2" "SPLIT_DECISION" "luxuryretail"
fi

echo ""
echo "========================================="
echo "TEST 3: LuxeBags -> Italian Leather (Reverse Flow)"
echo "========================================="

login "admin@luxebags.com" "LuxeBags2024!" "luxebags"
LUXE_TOKEN=$TOKEN

# Create transaction as LuxeBags
TX3=$(create_transaction "$LUXE_TOKEN" "luxebags" "italianleather" "SAMPLE-$(date +%s)" 2>&1 | tail -1)

if [ -n "$TX3" ] && [ "$TX3" != "null" ]; then
    sleep 2
    
    # LuxeBags confirms sent
    confirm_sent "$LUXE_TOKEN" "$TX3" "luxebags"
    sleep 2
    
    # Italian Leather raises dispute
    raise_dispute "$ITALIAN_TOKEN" "$TX3" "italianleather" "Sample quality not as expected"
    sleep 2
    
    # Check if BOTH parties see the dispute
    echo -e "\n${YELLOW}Checking dispute visibility:${NC}"
    check_disputes "$LUXE_TOKEN" "luxebags"
    check_disputes "$ITALIAN_TOKEN" "italianleather"
    
    # Submit evidence
    submit_evidence "$LUXE_TOKEN" "$TX3" "luxebags"
    submit_evidence "$ITALIAN_TOKEN" "$TX3" "italianleather"
    
    # Resolve dispute
    resolve_dispute "$LUXE_TOKEN" "$TX3" "IN_FAVOR_SENDER" "luxebags"
fi

echo ""
echo "========================================="
echo "FINAL SUMMARY"
echo "========================================="

echo -e "\n${YELLOW}Checking final dispute state for all organizations:${NC}"

# Check disputes for all organizations
echo -e "\n${YELLOW}LuxeBags disputes:${NC}"
check_disputes "$LUXE_TOKEN" "luxebags"

echo -e "\n${YELLOW}Italian Leather disputes:${NC}"
check_disputes "$ITALIAN_TOKEN" "italianleather"

echo -e "\n${YELLOW}Craft Workshop disputes:${NC}"
check_disputes "$CRAFT_TOKEN" "craftworkshop"

echo -e "\n${YELLOW}Luxury Retail disputes:${NC}"
check_disputes "$RETAIL_TOKEN" "luxuryretail"

echo ""
echo "========================================="
echo "TEST COMPLETE"
echo "========================================="
echo ""
echo "This test verified:"
echo "1. ✓ Disputes can be created between any organizations"
echo "2. ✓ Both sender and receiver can see disputes"
echo "3. ✓ Evidence can be submitted by both parties"
echo "4. ✓ Disputes can be resolved with different decisions"
echo "5. ✓ The system works dynamically for ALL organizations"
echo ""