#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Starting Dispute Flow Test ===${NC}"

# Step 1: Login to Italian Leather (Supplier)
echo -e "\n${YELLOW}Step 1: Login to Italian Leather${NC}"
ITALIAN_TOKEN=$(curl -s -X POST http://localhost:4002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@italianleather.com","password":"ItalianLeather2024!"}' | jq -r '.token')

if [ "$ITALIAN_TOKEN" != "null" ] && [ -n "$ITALIAN_TOKEN" ]; then
    echo "✓ Italian Leather login successful"
    echo "$ITALIAN_TOKEN" > /tmp/italian_token.txt
else
    echo -e "${RED}✗ Italian Leather login failed${NC}"
    exit 1
fi

# Step 2: Login to Craft Workshop (Manufacturer)
echo -e "\n${YELLOW}Step 2: Login to Craft Workshop${NC}"
CRAFT_TOKEN=$(curl -s -X POST http://localhost:4003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@craftworkshop.com","password":"CraftWorkshop2024!"}' | jq -r '.token')

if [ "$CRAFT_TOKEN" != "null" ] && [ -n "$CRAFT_TOKEN" ]; then
    echo "✓ Craft Workshop login successful"
    echo "$CRAFT_TOKEN" > /tmp/craft_token.txt
else
    echo -e "${RED}✗ Craft Workshop login failed${NC}"
    exit 1
fi

# Step 3: Create a material transfer transaction
echo -e "\n${YELLOW}Step 3: Create material transfer transaction${NC}"
TIMESTAMP=$(date +%s)
TRANSACTION_ID="MAT-TRANSFER-$TIMESTAMP"

TRANSACTION_RESPONSE=$(curl -s -X POST http://localhost:4002/api/consensus/transactions \
  -H "Authorization: Bearer $ITALIAN_TOKEN" \
  -H "x-org-id: italianleather" \
  -H "x-user-id: admin-italianleather" \
  -H "x-user-role: admin" \
  -H "Content-Type: application/json" \
  -d "{
    \"receiver\": \"craftworkshop\",
    \"itemId\": \"MAT-LEATHER-$TIMESTAMP\",
    \"value\": 5000,
    \"metadata\": {
      \"quantity\": \"100\",
      \"description\": \"Premium Italian Leather\",
      \"batch\": \"BATCH-2024-$TIMESTAMP\"
    }
  }")

TX_ID=$(echo "$TRANSACTION_RESPONSE" | jq -r '.transactionId')
if [ "$TX_ID" != "null" ] && [ -n "$TX_ID" ]; then
    echo "✓ Transaction created: $TX_ID"
    echo "$TX_ID" > /tmp/transaction_id.txt
else
    echo -e "${RED}✗ Transaction creation failed${NC}"
    echo "$TRANSACTION_RESPONSE"
    exit 1
fi

# Step 4: Confirm sending from Italian Leather
echo -e "\n${YELLOW}Step 4: Confirm sending from Italian Leather${NC}"
SEND_RESPONSE=$(curl -s -X POST "http://localhost:4002/api/consensus/transactions/$TX_ID/confirm-sent" \
  -H "Authorization: Bearer $ITALIAN_TOKEN" \
  -H "x-org-id: italianleather" \
  -H "x-user-id: admin-italianleather" \
  -H "x-user-role: admin" \
  -H "Content-Type: application/json" \
  -d '{"evidence":{"description":"Shipped via express delivery","trackingNumber":"TRACK-12345"}}')

if echo "$SEND_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo "✓ Material marked as sent"
else
    echo -e "${YELLOW}! Sending confirmation response:${NC}"
    echo "$SEND_RESPONSE" | jq '.'
fi

# Step 5: Create a dispute from Craft Workshop
echo -e "\n${YELLOW}Step 5: Create dispute from Craft Workshop${NC}"
DISPUTE_RESPONSE=$(curl -s -X POST "http://localhost:4003/api/consensus/transactions/$TX_ID/dispute" \
  -H "Authorization: Bearer $CRAFT_TOKEN" \
  -H "x-org-id: craftworkshop" \
  -H "x-user-id: admin-craftworkshop" \
  -H "x-user-role: admin" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "NOT_RECEIVED",
    "reason": "Material was not received at our warehouse",
    "evidence": {
      "description": "No delivery confirmation, warehouse logs show no receipt",
      "type": "MISSING_DELIVERY"
    }
  }')

DISPUTE_ID=$(echo "$DISPUTE_RESPONSE" | jq -r '.disputeId')
if [ "$DISPUTE_ID" != "null" ] && [ -n "$DISPUTE_ID" ]; then
    echo "✓ Dispute created: $DISPUTE_ID"
    echo "$DISPUTE_ID" > /tmp/dispute_id.txt
else
    echo -e "${RED}✗ Dispute creation failed${NC}"
    echo "$DISPUTE_RESPONSE" | jq '.'
    exit 1
fi

# Step 6: Check if dispute shows in open disputes for Italian Leather
echo -e "\n${YELLOW}Step 6: Check open disputes for Italian Leather${NC}"
DISPUTES_ITALIAN=$(curl -s "http://localhost:4002/api/consensus/disputes/open/italianleather" \
  -H "Authorization: Bearer $ITALIAN_TOKEN" \
  -H "x-org-id: italianleather" \
  -H "x-user-id: admin-italianleather" \
  -H "x-user-role: admin")

DISPUTE_COUNT=$(echo "$DISPUTES_ITALIAN" | jq '. | length')
if [ -z "$DISPUTE_COUNT" ]; then
    DISPUTE_COUNT=0
fi
echo "Found $DISPUTE_COUNT dispute(s) for Italian Leather"
if [ "$DISPUTE_COUNT" -gt 0 ]; then
    echo "✓ Disputes are showing correctly"
    echo "$DISPUTES_ITALIAN" | jq '.[0]'
else
    echo -e "${YELLOW}! No disputes found (may be a display issue)${NC}"
fi

# Step 7: Check if dispute shows for Craft Workshop
echo -e "\n${YELLOW}Step 7: Check open disputes for Craft Workshop${NC}"
DISPUTES_CRAFT=$(curl -s "http://localhost:4003/api/consensus/disputes/open/craftworkshop" \
  -H "Authorization: Bearer $CRAFT_TOKEN" \
  -H "x-org-id: craftworkshop" \
  -H "x-user-id: admin-craftworkshop" \
  -H "x-user-role: admin")

DISPUTE_COUNT_CRAFT=$(echo "$DISPUTES_CRAFT" | jq '. | length')
echo "Found $DISPUTE_COUNT_CRAFT dispute(s) for Craft Workshop"

# Step 8: Add evidence to the dispute
echo -e "\n${YELLOW}Step 8: Add evidence to dispute${NC}"
EVIDENCE_RESPONSE=$(curl -s -X POST "http://localhost:4002/api/consensus/disputes/$TX_ID/evidence" \
  -H "Authorization: Bearer $ITALIAN_TOKEN" \
  -H "x-org-id: italianleather" \
  -H "x-user-id: admin-italianleather" \
  -H "x-user-role: admin" \
  -H "Content-Type: application/json" \
  -d '{
    "evidence": {
      "type": "DELIVERY_PROOF",
      "description": "Signed delivery receipt from carrier",
      "hash": "abc123def456"
    }
  }')

if echo "$EVIDENCE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo "✓ Evidence added to dispute"
else
    echo -e "${YELLOW}! Evidence submission response:${NC}"
    echo "$EVIDENCE_RESPONSE" | jq '.'
fi

# Step 9: Resolve the dispute
echo -e "\n${YELLOW}Step 9: Resolve dispute${NC}"
RESOLVE_RESPONSE=$(curl -s -X POST "http://localhost:4002/api/consensus/disputes/$TX_ID/resolve" \
  -H "Authorization: Bearer $ITALIAN_TOKEN" \
  -H "x-org-id: italianleather" \
  -H "x-user-id: admin-italianleather" \
  -H "x-user-role: admin" \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "IN_FAVOR_SENDER",
    "notes": "Evidence shows material was delivered correctly",
    "compensationAmount": 0
  }')

if echo "$RESOLVE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo "✓ Dispute resolved successfully"
else
    echo -e "${YELLOW}! Resolution response:${NC}"
    echo "$RESOLVE_RESPONSE" | jq '.'
fi

# Step 10: Verify dispute is no longer in open disputes
echo -e "\n${YELLOW}Step 10: Verify dispute is resolved${NC}"
DISPUTES_AFTER=$(curl -s "http://localhost:4002/api/consensus/disputes/open/italianleather" \
  -H "Authorization: Bearer $ITALIAN_TOKEN" \
  -H "x-org-id: italianleather" \
  -H "x-user-id: admin-italianleather" \
  -H "x-user-role: admin")

DISPUTE_COUNT_AFTER=$(echo "$DISPUTES_AFTER" | jq '. | length')
echo "Disputes remaining: $DISPUTE_COUNT_AFTER"

# Summary
echo -e "\n${GREEN}=== Test Summary ===${NC}"
echo "Transaction ID: $TX_ID"
echo "Dispute ID: $DISPUTE_ID"
echo "Italian Token saved to: /tmp/italian_token.txt"
echo "Craft Token saved to: /tmp/craft_token.txt"
echo "Transaction ID saved to: /tmp/transaction_id.txt"
echo "Dispute ID saved to: /tmp/dispute_id.txt"

echo -e "\n${GREEN}=== Test Complete ===${NC}"