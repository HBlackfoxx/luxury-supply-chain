#!/bin/bash
# validate-phase1.sh

echo "=== Phase 1 Validation Checklist ==="
echo ""

CHECKS=(
    "Configuration templates are parameterized:config/brands/templates/brand-config-template.yaml"
    "Network can be generated from config:network/scripts/generate-network.sh"
    "Crypto materials can be generated:network/scripts/generate-crypto.sh"
    "Network starts successfully:network/scripts/start-network.sh"
    "Channel can be created:network/scripts/create-channel.sh"
    "SDK compiles without errors:backend/gateway/src"
    "Connection profiles are generated:generated/config/connection-*.json"
    "Docker compose is configurable:generated/docker/docker-compose.yaml"
    "Multiple orgs are supported:network topology"
    "TLS is properly configured:crypto materials"
)

echo "Please verify each item:"
echo ""

for i in "${!CHECKS[@]}"; do
    echo "$((i+1)). ${CHECKS[$i]}"
    read -p "   Pass? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   ❌ Failed"
        FAILED+=("${CHECKS[$i]}")
    else
        echo "   ✅ Passed"
    fi
done

echo ""
echo "=== Summary ==="
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "✅ All checks passed! Phase 1 is complete."
else
    echo "❌ Failed checks:"
    for fail in "${FAILED[@]}"; do
        echo "   - $fail"
    done
fi