# Frontend to Backend API Mapping

## Overview
This document shows how the frontend components connect to the backend APIs we built in Phases 2-4.

## B2B Portal Mapping

### 1. Pending Actions Component
**Frontend**: `/components/b2b/pending-actions.tsx`
**Backend APIs Used**:
- `GET /api/consensus/transactions/pending/{participantId}` - Get pending transactions
- `POST /api/consensus/transactions/{id}/confirm-sent` - Confirm shipment sent
- `POST /api/consensus/transactions/{id}/confirm-received` - Confirm goods received

**Implementation**: ✅ Correctly mapped to consensus API

### 2. Trust Score Dashboard
**Frontend**: `/components/b2b/trust-score-dashboard.tsx`
**Backend APIs Used**:
- `GET /api/consensus/trust/{participantId}` - Get trust score
- `GET /api/consensus/trust/{participantId}/history` - Get trust history with partners

**Implementation**: ✅ Correctly mapped

### 3. Transaction History
**Frontend**: `/components/b2b/transaction-history.tsx`
**Backend APIs Used**:
- `GET /api/consensus/transactions` - Get all transactions with filtering

**Note**: The backend doesn't have a generic `/transactions` endpoint. Need to create one or use specific endpoints.

### 4. Batch Operations
**Frontend**: `/components/b2b/batch-operations.tsx`
**Backend APIs Used**:
- `POST /api/consensus/transactions/batch` - Process multiple confirmations

**Implementation**: ✅ Correctly mapped

## Backend Features Fully Utilized

### From Phase 2 (2-Check Consensus):
- ✅ State management (pending/confirmed states)
- ✅ Dual confirmation (sent/received)
- ✅ Trust scoring system
- ✅ Batch processing
- ❌ Emergency stop (not exposed in UI yet)
- ❌ Dispute resolution (button exists but no UI)
- ❌ Anomaly detection (running in backend)
- ❌ Progressive automation (active but not visible)

### From Phase 3 (Smart Contracts):
- ✅ Transaction creation and tracking
- ✅ B2B transfers with 2-Check
- ❌ Material verification (no UI yet)
- ❌ Quality checkpoints (no UI yet)

### From Phase 4 (Backend Services):
- ✅ 2-Check transaction APIs
- ✅ Stakeholder notifications (EventEmitter based)
- ✅ Batch processing
- ✅ Performance monitoring (metrics endpoint exists)
- ❌ Customer Gateway (separate module, not in B2B)
- ❌ Service Account Management (separate module)

## Missing Frontend Features

1. **Dispute Management UI**
   - Backend has: `/api/consensus/transactions/{id}/dispute`
   - Frontend has: Dispute button but no modal/form

2. **Emergency Stop Controls**
   - Backend has: `/api/consensus/emergency/stop`
   - Frontend needs: Admin controls

3. **Analytics Dashboard**
   - Backend has: `/api/consensus/analytics/report`
   - Frontend needs: Charts and visualizations

4. **Quality Checkpoints**
   - Backend supports quality data
   - Frontend needs: Quality input forms

## Recommendations

1. **Add Generic Transaction List Endpoint**: The backend needs a `/api/consensus/transactions` endpoint that returns filtered transactions for a participant.

2. **Implement Dispute UI**: Create a modal for dispute creation with evidence upload.

3. **Add Analytics Visualizations**: Use the performance analytics data to show charts.

4. **Show Progressive Automation**: Display when transactions are auto-approved based on trust.

5. **Add Emergency Stop Banner**: Show when system is in emergency stop mode.

## Customer Portal (To Be Built)

The Customer Gateway APIs are ready at:
- `POST /api/customer/ownership/claim`
- `POST /api/customer/ownership/transfer/generate`
- `GET /api/customer/verify/{productId}`
- Service account fees handled automatically

## Admin Dashboard (To Be Built)

Admin features available:
- Emergency stop controls
- Dispute oversight
- Network monitoring
- Analytics and reporting