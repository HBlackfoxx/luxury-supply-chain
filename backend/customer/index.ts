// backend/customer/index.ts
// Main exports for customer module

export { CustomerGateway } from './customer-gateway';
export { OwnershipService } from './services/ownership-service';
export { QRService } from './services/qr-service';
export { RecoveryService } from './services/recovery-service';
export * from './types';
export { authenticateCustomer, generateToken, verifyToken } from './middleware/auth';
export { validateRequest, sanitizeInput } from './middleware/validation';