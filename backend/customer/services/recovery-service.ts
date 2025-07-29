// backend/customer/services/recovery-service.ts
// Service for handling lost access recovery

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { RecoveryRequest, Customer, OwnedProduct } from '../types';

export class RecoveryService extends EventEmitter {
  private recoveryRequests: Map<string, RecoveryRequest> = new Map();
  private recoveryTokens: Map<string, { requestId: string; expiresAt: Date }> = new Map();

  constructor() {
    super();
  }

  /**
   * Initiate recovery request
   */
  public async initiateRecovery(
    email: string,
    phone?: string,
    productIds?: string[],
    verificationMethod: 'email' | 'sms' | 'id_upload' = 'email'
  ): Promise<string> {
    console.log(`Initiating recovery for ${email}`);
    
    const requestId = this.generateRequestId();
    const request: RecoveryRequest = {
      customerId: '', // Will be filled after verification
      email,
      phone,
      productIds: productIds || [],
      verificationMethod,
      status: 'pending',
      createdAt: new Date()
    };
    
    this.recoveryRequests.set(requestId, request);
    
    // Send verification based on method
    await this.sendVerification(request, requestId);
    
    // Emit event
    this.emit('recovery_initiated', {
      requestId,
      email,
      method: verificationMethod,
      timestamp: new Date()
    });
    
    return requestId;
  }

  /**
   * Verify recovery request
   */
  public async verifyRecovery(
    requestId: string,
    verificationCode?: string,
    idDocument?: Buffer
  ): Promise<boolean> {
    const request = this.recoveryRequests.get(requestId);
    
    if (!request) {
      throw new Error('Recovery request not found');
    }
    
    if (request.status !== 'pending') {
      throw new Error('Recovery request already processed');
    }
    
    let verified = false;
    
    switch (request.verificationMethod) {
      case 'email':
      case 'sms':
        // Verify code
        verified = await this.verifyCode(requestId, verificationCode!);
        break;
        
      case 'id_upload':
        // In production, use AI/ML for document verification
        verified = idDocument !== undefined && idDocument.length > 0;
        break;
    }
    
    if (verified) {
      request.status = 'verified';
      this.recoveryRequests.set(requestId, request);
      
      // Generate recovery token
      const token = this.generateRecoveryToken(requestId);
      
      this.emit('recovery_verified', {
        requestId,
        email: request.email,
        timestamp: new Date()
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * Complete recovery and restore access
   */
  public async completeRecovery(
    recoveryToken: string,
    newCustomerId: string
  ): Promise<{
    customerId: string;
    recoveredProducts: string[];
  }> {
    const tokenData = this.recoveryTokens.get(recoveryToken);
    
    if (!tokenData) {
      throw new Error('Invalid recovery token');
    }
    
    if (tokenData.expiresAt < new Date()) {
      throw new Error('Recovery token expired');
    }
    
    const request = this.recoveryRequests.get(tokenData.requestId);
    
    if (!request || request.status !== 'verified') {
      throw new Error('Invalid recovery request');
    }
    
    // Update request
    request.customerId = newCustomerId;
    request.status = 'approved';
    this.recoveryRequests.set(tokenData.requestId, request);
    
    // Clean up token
    this.recoveryTokens.delete(recoveryToken);
    
    // Emit completion
    this.emit('recovery_completed', {
      requestId: tokenData.requestId,
      customerId: newCustomerId,
      productIds: request.productIds,
      timestamp: new Date()
    });
    
    return {
      customerId: newCustomerId,
      recoveredProducts: request.productIds
    };
  }

  /**
   * Get recovery request status
   */
  public async getRecoveryStatus(requestId: string): Promise<RecoveryRequest | null> {
    return this.recoveryRequests.get(requestId) || null;
  }

  /**
   * Admin: Approve recovery manually
   */
  public async approveRecovery(
    requestId: string,
    adminId: string,
    notes?: string
  ): Promise<void> {
    const request = this.recoveryRequests.get(requestId);
    
    if (!request) {
      throw new Error('Recovery request not found');
    }
    
    request.status = 'approved';
    request.supportTicket = `ADMIN-${adminId}-${Date.now()}`;
    this.recoveryRequests.set(requestId, request);
    
    this.emit('recovery_admin_approved', {
      requestId,
      adminId,
      notes,
      timestamp: new Date()
    });
  }

  /**
   * Admin: Reject recovery
   */
  public async rejectRecovery(
    requestId: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    const request = this.recoveryRequests.get(requestId);
    
    if (!request) {
      throw new Error('Recovery request not found');
    }
    
    request.status = 'rejected';
    request.supportTicket = `ADMIN-${adminId}-${Date.now()}`;
    this.recoveryRequests.set(requestId, request);
    
    this.emit('recovery_rejected', {
      requestId,
      adminId,
      reason,
      timestamp: new Date()
    });
  }

  /**
   * Get pending recovery requests for admin
   */
  public async getPendingRequests(): Promise<RecoveryRequest[]> {
    const pending: RecoveryRequest[] = [];
    
    for (const request of this.recoveryRequests.values()) {
      if (request.status === 'pending' || request.status === 'verified') {
        pending.push(request);
      }
    }
    
    return pending.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Private methods
   */
  private async sendVerification(
    request: RecoveryRequest,
    requestId: string
  ): Promise<void> {
    switch (request.verificationMethod) {
      case 'email':
        // In production, send actual email
        console.log(`Sending recovery email to ${request.email}`);
        console.log(`Recovery code: ${this.generateVerificationCode(requestId)}`);
        break;
        
      case 'sms':
        // In production, send actual SMS
        console.log(`Sending recovery SMS to ${request.phone}`);
        console.log(`Recovery code: ${this.generateVerificationCode(requestId)}`);
        break;
        
      case 'id_upload':
        // No code needed, just instructions
        console.log(`ID upload required for ${request.email}`);
        break;
    }
  }

  private generateVerificationCode(requestId: string): string {
    // In production, store this securely with expiry
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private async verifyCode(requestId: string, code: string): Promise<boolean> {
    // In production, verify against stored code with expiry
    // For PoC, accept any 6-character code
    return code.length === 6;
  }

  private generateRecoveryToken(requestId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    this.recoveryTokens.set(token, {
      requestId,
      expiresAt
    });
    
    return token;
  }

  private generateRequestId(): string {
    return `REC-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Cleanup expired tokens
   */
  public cleanupExpiredTokens(): void {
    const now = new Date();
    
    for (const [token, data] of this.recoveryTokens.entries()) {
      if (data.expiresAt < now) {
        this.recoveryTokens.delete(token);
      }
    }
  }
}