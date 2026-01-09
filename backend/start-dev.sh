#!/bin/bash

# Development startup script for all organizations

echo "Starting Luxury Supply Chain Backend Services..."
echo "=============================================="

# Function to start a backend service
start_backend() {
    local port=$1
    local org=$2
    local name=$3
    
    echo "Starting $name on port $port..."
    PORT=$port ORG_ID=$org BRAND_ID=$org npm run dev &
    echo "$name PID: $!"
}

# Kill any existing processes on our ports
echo "Cleaning up existing processes..."
for port in 4001 4002 4003 4004; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

# Start all backend services
start_backend 4001 "luxebags" "LuxeBags"
start_backend 4002 "italianleather" "Italian Leather"
start_backend 4003 "craftworkshop" "Craft Workshop"
start_backend 4004 "luxuryretail" "Luxury Retail"

echo ""
echo "All backend services starting..."
echo ""
echo "API Endpoints:"
echo "- LuxeBags:        http://localhost:4001"
echo "- Italian Leather: http://localhost:4002"
echo "- Craft Workshop:  http://localhost:4003"
echo "- Luxury Retail:   http://localhost:4004"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for interrupt
wait