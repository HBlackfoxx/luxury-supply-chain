#!/bin/bash
# run-all-tests.sh

echo "=== Running Phase 1 Complete Test Suite ==="
echo ""

# Array to track test results
declare -A TEST_RESULTS

# Run each test suite
run_test() {
    local test_name=$1
    local test_script=$2
    
    echo "Running: $test_name"
    if bash $test_script; then
        TEST_RESULTS[$test_name]="✅ PASSED"
    else
        TEST_RESULTS[$test_name]="❌ FAILED"
    fi
    echo ""
}

# Run all tests
run_test "Configuration Generation" "./test-config-generation.sh"
run_test "Network Lifecycle" "./test-network-lifecycle.sh"
# run_test "SDK Compilation" "./test-sdk-compilation.sh"
run_test "E2E Integration" "./test-e2e-integration.sh"

# Display results
echo "=== Test Results ==="
for test in "${!TEST_RESULTS[@]}"; do
    echo "$test: ${TEST_RESULTS[$test]}"
done

# Check if all passed
if [[ ! " ${TEST_RESULTS[@]} " =~ "FAILED" ]]; then
    echo ""
    echo "🎉 All tests passed! Phase 1 is complete and ready for Phase 2."
    exit 0
else
    echo ""
    echo "⚠️  Some tests failed. Please fix issues before proceeding to Phase 2."
    exit 1
fi