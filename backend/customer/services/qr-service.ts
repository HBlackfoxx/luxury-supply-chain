// backend/customer/services/qr-service.ts
// Service for QR code generation and verification

import crypto from 'crypto';
import { QRCodeData, VerificationResult } from '../types';

export class QRService {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(secretKey: string, baseUrl: string) {
    this.secretKey = secretKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Generate QR code data for a product
   */
  public generateQRData(
    productId: string,
    brand: string,
    model: string
  ): QRCodeData {
    const timestamp = new Date();
    const verificationUrl = `${this.baseUrl}/verify/${productId}`;
    
    // Create signature for authenticity
    const dataToSign = `${productId}:${brand}:${model}:${timestamp.toISOString()}`;
    const signature = this.createSignature(dataToSign);
    
    return {
      productId,
      brand,
      model,
      verificationUrl,
      timestamp,
      signature
    };
  }

  /**
   * Generate QR code URL
   */
  public generateQRUrl(data: QRCodeData): string {
    // Encode data for QR
    const payload = {
      p: data.productId,
      b: data.brand,
      m: data.model,
      t: data.timestamp.getTime(),
      s: data.signature.substring(0, 16) // Shortened for QR size
    };
    
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${this.baseUrl}/v/${encoded}`;
  }

  /**
   * Verify QR code data
   */
  public verifyQRData(encodedData: string): {
    isValid: boolean;
    data?: QRCodeData;
    error?: string;
  } {
    try {
      // Decode the data
      const decoded = Buffer.from(encodedData, 'base64url').toString();
      const payload = JSON.parse(decoded);
      
      // Reconstruct the data
      const timestamp = new Date(payload.t);
      const dataToVerify = `${payload.p}:${payload.b}:${payload.m}:${timestamp.toISOString()}`;
      
      // Verify signature (checking prefix only for shortened signatures)
      const expectedSignature = this.createSignature(dataToVerify);
      
      if (!expectedSignature.startsWith(payload.s)) {
        return {
          isValid: false,
          error: 'Invalid signature'
        };
      }
      
      // Check if QR code is not too old (30 days)
      const ageInDays = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays > 30) {
        return {
          isValid: false,
          error: 'QR code has expired'
        };
      }
      
      return {
        isValid: true,
        data: {
          productId: payload.p,
          brand: payload.b,
          model: payload.m,
          verificationUrl: `${this.baseUrl}/verify/${payload.p}`,
          timestamp,
          signature: expectedSignature
        }
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid QR code format'
      };
    }
  }

  /**
   * Generate NFC data (similar to QR but with more capacity)
   */
  public generateNFCData(
    productId: string,
    brand: string,
    model: string,
    additionalData?: any
  ): string {
    const data = {
      productId,
      brand,
      model,
      timestamp: new Date().toISOString(),
      verificationUrl: `${this.baseUrl}/verify/${productId}`,
      ...additionalData
    };
    
    const signature = this.createSignature(JSON.stringify(data));
    
    return JSON.stringify({
      ...data,
      signature
    });
  }

  /**
   * Verify NFC data
   */
  public verifyNFCData(nfcData: string): {
    isValid: boolean;
    data?: any;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(nfcData);
      const { signature, ...data } = parsed;
      
      // Verify signature
      const expectedSignature = this.createSignature(JSON.stringify(data));
      
      if (signature !== expectedSignature) {
        return {
          isValid: false,
          error: 'Invalid signature'
        };
      }
      
      return {
        isValid: true,
        data
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid NFC data format'
      };
    }
  }

  /**
   * Create HMAC signature
   */
  private createSignature(data: string): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Generate dynamic QR code for one-time verification
   */
  public generateDynamicQR(
    productId: string,
    purpose: 'ownership_claim' | 'transfer' | 'verification',
    expiryMinutes: number = 5
  ): {
    code: string;
    expiresAt: Date;
    verificationUrl: string;
  } {
    const code = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    
    // In production, store this in Redis with TTL
    const verificationUrl = `${this.baseUrl}/dynamic/${code}`;
    
    return {
      code,
      expiresAt,
      verificationUrl
    };
  }
}