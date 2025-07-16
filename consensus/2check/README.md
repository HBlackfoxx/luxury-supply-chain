# 2-Check Consensus System

## Overview
Simple, practical consensus mechanism based on sender-receiver confirmation.

## Structure
- `core/`: Core consensus engine
- `config/`: Configuration files
- `tests/`: Test suites
- `exceptions/`: Dispute and escalation handling
- `integration/`: Fabric network integration

## Quick Start
1. Configure timeouts in `config/2check-config.yaml`
2. Run tests: `npm test`
3. Deploy to network: `./deploy-consensus.sh`
