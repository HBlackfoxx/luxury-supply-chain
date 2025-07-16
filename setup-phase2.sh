#!/bin/bash

# Setup script for Phase 2: 2-Check Consensus Implementation
# This script integrates Phase 2 with the existing Phase 1 network

set -e

echo "================================================"
echo "Setting up Phase 2: 2-Check Consensus"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Phase 1 network is running
check_phase1() {
    print_info "Checking Phase 1 network status..."
    
    if docker ps | grep -q "peer0.luxebags.com"; then
        print_info "Phase 1 network is running"
        return 0
    else
        print_warn "Phase 1 network is not running"
        print_info "You can start it with: cd generated-test && ./network.sh up"
        return 1
    fi
}

# Install dependencies for consensus module
install_consensus_deps() {
    print_info "Installing consensus module dependencies..."
    
    if [ ! -d "consensus/2check/node_modules" ]; then
        cd consensus/2check
        npm install
        cd ../..
    else
        print_info "Dependencies already installed"
    fi
    
    print_info "Building TypeScript files..."
    cd consensus/2check
    npm run build
    cd ../..
    
    print_info "Consensus module built successfully"
}

# Verify file structure
verify_structure() {
    print_info "Verifying Phase 2 file structure..."
    
    local missing_files=()
    
    # Check core files
    [ ! -f "consensus/2check/core/state/state-manager.ts" ] && missing_files+=("state-manager.ts")
    [ ! -f "consensus/2check/core/validation/validation-engine.ts" ] && missing_files+=("validation-engine.ts")
    [ ! -f "consensus/2check/core/timeout/timeout-handler.ts" ] && missing_files+=("timeout-handler.ts")
    [ ! -f "consensus/2check/core/trust/trust-scoring-system.ts" ] && missing_files+=("trust-scoring-system.ts")
    
    # Check integration files
    [ ! -f "consensus/2check/integration/consensus-orchestrator.ts" ] && missing_files+=("consensus-orchestrator.ts")
    [ ! -f "consensus/2check/integration/fabric-integration.ts" ] && missing_files+=("fabric-integration.ts")
    
    # Check backend integration
    [ ! -f "backend/consensus/fabric-consensus-adapter.ts" ] && missing_files+=("fabric-consensus-adapter.ts")
    [ ! -f "backend/consensus/setup-consensus.ts" ] && missing_files+=("setup-consensus.ts")
    
    if [ ${#missing_files[@]} -eq 0 ]; then
        print_info "✅ All required files present"
    else
        print_error "Missing files: ${missing_files[*]}"
        exit 1
    fi
}

# Run integration tests
run_tests() {
    print_info "Running integration tests..."
    
    node test-phase2-integration.js
}

# Create startup script
create_startup_script() {
    print_info "Creating startup script..."
    
    cat > start-consensus.sh <<'EOF'
#!/bin/bash

echo "Starting 2-Check Consensus System..."

# Check if network is running
if ! docker ps | grep -q "peer0.luxebags.com"; then
    echo "Error: Fabric network is not running"
    echo "Start it with: cd generated-test && ./network.sh up"
    exit 1
fi

# Start consensus monitoring (optional)
echo "Consensus system is integrated with the Fabric network"
echo "Use the gateway API to interact with consensus:"
echo ""
echo "POST /api/consensus/transactions - Create transaction"
echo "POST /api/consensus/transactions/:id/confirm-sent - Confirm sent"
echo "POST /api/consensus/transactions/:id/confirm-received - Confirm received"
echo "GET  /api/consensus/trust/:participantId - Get trust score"
echo ""
echo "Monitor logs with: docker logs -f dev-peer0.luxebags.com-consensus-1.0"
EOF

    chmod +x start-consensus.sh
    print_info "Startup script created: start-consensus.sh"
}

# Main execution
main() {
    print_info "Starting Phase 2 setup..."
    
    # Step 1: Check network status
    if [ "$1" != "--skip-network-check" ]; then
        check_phase1 || print_warn "Network not running - some features may not work"
    fi
    
    # Step 2: Verify file structure
    verify_structure
    
    # Step 3: Install and build
    install_consensus_deps
    
    # Step 4: Run tests
    if [ "$1" != "--skip-tests" ]; then
        run_tests
    fi
    
    # Step 5: Create startup script
    create_startup_script
    
    print_info "================================================"
    print_info "Phase 2 setup complete!"
    print_info "================================================"
    print_info ""
    print_info "Phase 2 Components Ready:"
    print_info "✅ State Manager - Transaction state tracking"
    print_info "✅ Validation Engine - Anomaly detection"
    print_info "✅ Timeout Handler - Automatic timeout management"
    print_info "✅ Trust Scoring - Dynamic trust calculation"
    print_info "✅ Dispute Resolution - Conflict management"
    print_info "✅ Evidence Manager - Proof collection"
    print_info "✅ Consensus Orchestrator - Component integration"
    print_info ""
    print_info "Integration Points:"
    print_info "✅ Fabric Consensus Adapter - Blockchain connection"
    print_info "✅ Backend API - REST endpoints"
    print_info "✅ Event Integration - Real-time updates"
    print_info ""
    print_info "Next Steps:"
    print_info "1. Deploy chaincode (if network running): cd generated-test && ./network.sh deployCC -ccn consensus -ccp ../chaincode/2check-consensus -ccl go"
    print_info "2. Start gateway: cd backend/gateway && npm start"
    print_info "3. Test API: curl http://localhost:3000/api/consensus/health"
    print_info ""
    print_info "For more information, see consensus/2check/README.md"
}

# Run main function
main "$@"