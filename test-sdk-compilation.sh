#!/bin/bash
# test-sdk-compilation.sh

echo "=== Testing SDK Compilation ==="

cd backend/gateway

# Install dependencies
npm init -y
npm install @hyperledger/fabric-gateway @grpc/grpc-js fabric-ca-client
npm install -D typescript @types/node

# Create tsconfig if not exists
if [ ! -f "tsconfig.json" ]; then
    cat > tsconfig.json << EOF
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
EOF
fi

# Compile TypeScript
npx tsc

if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi