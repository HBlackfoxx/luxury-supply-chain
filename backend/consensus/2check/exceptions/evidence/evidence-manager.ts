import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

export interface Evidence {
  id: string;
  transactionId: string;
  type: EvidenceType;
  submittedBy: string;
  timestamp: Date;
  hash: string;
  data: any;
  verified: boolean;
  verificationMethod?: string;
}

export enum EvidenceType {
  SHIPPING_DOCUMENT = 'shipping_document',
  PHOTO_PROOF = 'photo_proof',
  VIDEO_PROOF = 'video_proof',
  GPS_LOCATION = 'gps_location',
  TIMESTAMP_VERIFICATION = 'timestamp_verification',
  WITNESS_CONFIRMATION = 'witness_confirmation',
  MULTI_SIGNATURE = 'multi_signature',
  INSURANCE_CONFIRMATION = 'insurance_confirmation',
  DIGITAL_SIGNATURE = 'digital_signature',
  BLOCKCHAIN_PROOF = 'blockchain_proof'
}

export interface EvidenceRequest {
  transactionId: string;
  requiredTypes: string[];
  deadline: Date;
  reason: string;
  requestedFrom: string[];
}

export interface EvidenceValidation {
  isValid: boolean;
  confidence: number;
  issues: string[];
  verifiedAt: Date;
}

export class EvidenceManager extends EventEmitter {
  private evidenceStore: Map<string, Evidence[]>;
  private evidenceRequests: Map<string, EvidenceRequest>;
  private config: any;
  private validationRules: Map<EvidenceType, (evidence: Evidence) => Promise<EvidenceValidation>>;

  constructor() {
    super();
    this.evidenceStore = new Map();
    this.evidenceRequests = new Map();
    this.validationRules = new Map();
    this.loadConfig();
    this.initializeValidationRules();
  }

  private loadConfig(): void {
    const configPath = path.join(__dirname, '../../config/timeout-rules.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configContent);
  }

  private initializeValidationRules(): void {
    // Shipping document validation
    this.validationRules.set(
      EvidenceType.SHIPPING_DOCUMENT,
      async (evidence) => this.validateShippingDocument(evidence)
    );

    // Photo proof validation
    this.validationRules.set(
      EvidenceType.PHOTO_PROOF,
      async (evidence) => this.validatePhotoProof(evidence)
    );

    // GPS location validation
    this.validationRules.set(
      EvidenceType.GPS_LOCATION,
      async (evidence) => this.validateGPSLocation(evidence)
    );

    // Timestamp validation
    this.validationRules.set(
      EvidenceType.TIMESTAMP_VERIFICATION,
      async (evidence) => this.validateTimestamp(evidence)
    );

    // Witness confirmation validation
    this.validationRules.set(
      EvidenceType.WITNESS_CONFIRMATION,
      async (evidence) => this.validateWitnessConfirmation(evidence)
    );

    // Digital signature validation
    this.validationRules.set(
      EvidenceType.DIGITAL_SIGNATURE,
      async (evidence) => this.validateDigitalSignature(evidence)
    );
  }

  public async requestEvidence(
    transactionId: string,
    requiredTypes: string[],
    parties?: string[],
    reason: string = 'verification_required'
  ): Promise<EvidenceRequest> {
    const request: EvidenceRequest = {
      transactionId,
      requiredTypes,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
      reason,
      requestedFrom: parties || []
    };

    this.evidenceRequests.set(transactionId, request);

    // Emit event for notification system
    this.emit('evidence_requested', {
      transactionId,
      requiredTypes,
      parties: request.requestedFrom,
      deadline: request.deadline
    });

    return request;
  }

  public async submitEvidence(
    transactionId: string,
    type: EvidenceType,
    data: any,
    submittedBy: string
  ): Promise<Evidence> {
    // Create evidence record
    const evidence: Evidence = {
      id: this.generateEvidenceId(),
      transactionId,
      type,
      submittedBy,
      timestamp: new Date(),
      hash: this.calculateHash(data),
      data,
      verified: false
    };

    // Validate evidence
    const validation = await this.validateEvidence(evidence);
    evidence.verified = validation.isValid;

    // Store evidence
    const transactionEvidence = this.evidenceStore.get(transactionId) || [];
    transactionEvidence.push(evidence);
    this.evidenceStore.set(transactionId, transactionEvidence);

    // Check if request is fulfilled
    await this.checkRequestFulfillment(transactionId);

    // Emit event
    this.emit('evidence_submitted', {
      transactionId,
      evidenceId: evidence.id,
      type,
      verified: evidence.verified
    });

    return evidence;
  }

  public async validateEvidence(evidence: Evidence): Promise<EvidenceValidation> {
    const validator = this.validationRules.get(evidence.type);
    
    if (!validator) {
      return {
        isValid: false,
        confidence: 0,
        issues: ['No validation rule for evidence type'],
        verifiedAt: new Date()
      };
    }

    try {
      return await validator(evidence);
    } catch (error) {
      return {
        isValid: false,
        confidence: 0,
        issues: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        verifiedAt: new Date()
      };
    }
  }

  private async validateShippingDocument(evidence: Evidence): Promise<EvidenceValidation> {
    const issues: string[] = [];
    let confidence = 1.0;

    const doc = evidence.data;

    // Check required fields
    const requiredFields = ['trackingNumber', 'carrier', 'shipDate', 'recipient', 'sender'];
    for (const field of requiredFields) {
      if (!doc[field]) {
        issues.push(`Missing required field: ${field}`);
        confidence -= 0.2;
      }
    }

    // Verify tracking number format
    if (doc.trackingNumber && !this.isValidTrackingNumber(doc.trackingNumber, doc.carrier)) {
      issues.push('Invalid tracking number format');
      confidence -= 0.3;
    }

    // Check dates
    if (doc.shipDate) {
      const shipDate = new Date(doc.shipDate);
      if (shipDate > new Date()) {
        issues.push('Ship date is in the future');
        confidence -= 0.5;
      }
    }

    return {
      isValid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      issues,
      verifiedAt: new Date()
    };
  }

  private async validatePhotoProof(evidence: Evidence): Promise<EvidenceValidation> {
    const issues: string[] = [];
    let confidence = 1.0;

    const photo = evidence.data;

    // Check metadata
    if (!photo.metadata) {
      issues.push('Missing photo metadata');
      confidence -= 0.3;
    } else {
      // Check EXIF data
      if (!photo.metadata.timestamp) {
        issues.push('Missing timestamp in metadata');
        confidence -= 0.2;
      }
      
      if (!photo.metadata.location && this.isLocationRequired(evidence.transactionId)) {
        issues.push('Missing GPS location in metadata');
        confidence -= 0.2;
      }
    }

    // Check image hash
    if (!photo.hash || photo.hash !== this.calculateHash(photo.imageData)) {
      issues.push('Image hash mismatch');
      confidence -= 0.5;
    }

    // AI-based validation (placeholder)
    if (photo.aiValidation && photo.aiValidation.confidence < 0.7) {
      issues.push('Low AI confidence in image authenticity');
      confidence *= photo.aiValidation.confidence;
    }

    return {
      isValid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      issues,
      verifiedAt: new Date()
    };
  }

  private async validateGPSLocation(evidence: Evidence): Promise<EvidenceValidation> {
    const issues: string[] = [];
    let confidence = 1.0;

    const location = evidence.data;

    // Validate coordinates
    if (!this.isValidCoordinate(location.latitude, location.longitude)) {
      issues.push('Invalid GPS coordinates');
      confidence = 0;
    }

    // Check timestamp
    const timestamp = new Date(location.timestamp);
    const now = new Date();
    if (timestamp > now) {
      issues.push('GPS timestamp is in the future');
      confidence -= 0.5;
    }

    // Check accuracy
    if (location.accuracy && location.accuracy > 100) {
      issues.push('GPS accuracy too low (>100m)');
      confidence -= 0.3;
    }

    // Verify location makes sense for transaction
    if (confidence > 0) {
      const isReasonable = await this.isLocationReasonable(
        evidence.transactionId,
        location.latitude,
        location.longitude
      );
      if (!isReasonable) {
        issues.push('Location inconsistent with transaction route');
        confidence -= 0.4;
      }
    }

    return {
      isValid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      issues,
      verifiedAt: new Date()
    };
  }

  private async validateTimestamp(evidence: Evidence): Promise<EvidenceValidation> {
    const issues: string[] = [];
    let confidence = 1.0;

    const timestamp = evidence.data;

    // Check timestamp service
    if (!timestamp.service || !this.isTrustedTimestampService(timestamp.service)) {
      issues.push('Untrusted timestamp service');
      confidence -= 0.5;
    }

    // Verify signature
    if (!timestamp.signature || !this.verifyTimestampSignature(timestamp)) {
      issues.push('Invalid timestamp signature');
      confidence -= 0.7;
    }

    // Check timestamp value
    const time = new Date(timestamp.time);
    if (time > new Date()) {
      issues.push('Timestamp is in the future');
      confidence = 0;
    }

    return {
      isValid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      issues,
      verifiedAt: new Date()
    };
  }

  private async validateWitnessConfirmation(evidence: Evidence): Promise<EvidenceValidation> {
    const issues: string[] = [];
    let confidence = 1.0;

    const witness = evidence.data;

    // Check witness identity
    if (!witness.identity || !witness.identity.verified) {
      issues.push('Witness identity not verified');
      confidence -= 0.4;
    }

    // Check witness relationship
    if (witness.relationship === 'unknown' || !witness.relationship) {
      issues.push('Unknown witness relationship');
      confidence -= 0.3;
    }

    // Verify digital signature
    if (!witness.signature || !this.verifyWitnessSignature(witness)) {
      issues.push('Invalid witness signature');
      confidence -= 0.5;
    }

    // Check witness credibility score
    if (witness.credibilityScore && witness.credibilityScore < 0.7) {
      issues.push('Low witness credibility score');
      confidence *= witness.credibilityScore;
    }

    return {
      isValid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      issues,
      verifiedAt: new Date()
    };
  }

  private async validateDigitalSignature(evidence: Evidence): Promise<EvidenceValidation> {
    const issues: string[] = [];
    let confidence = 1.0;

    const signature = evidence.data;

    // Verify signature algorithm
    if (!this.isSupportedAlgorithm(signature.algorithm)) {
      issues.push('Unsupported signature algorithm');
      confidence = 0;
    }

    // Check certificate chain
    if (!signature.certificateChain || !this.verifyCertificateChain(signature.certificateChain)) {
      issues.push('Invalid certificate chain');
      confidence -= 0.7;
    }

    // Verify signature
    if (!this.verifyDigitalSignature(signature)) {
      issues.push('Signature verification failed');
      confidence = 0;
    }

    // Check certificate expiration
    if (this.isCertificateExpired(signature.certificate)) {
      issues.push('Certificate expired');
      confidence -= 0.5;
    }

    return {
      isValid: confidence > 0.5,
      confidence: Math.max(0, confidence),
      issues,
      verifiedAt: new Date()
    };
  }

  public async getEvidence(transactionId: string): Promise<Evidence[]> {
    return this.evidenceStore.get(transactionId) || [];
  }

  public async getVerifiedEvidence(transactionId: string): Promise<Evidence[]> {
    const allEvidence = await this.getEvidence(transactionId);
    return allEvidence.filter(e => e.verified);
  }

  private async checkRequestFulfillment(transactionId: string): Promise<void> {
    const request = this.evidenceRequests.get(transactionId);
    if (!request) return;

    const evidence = await this.getVerifiedEvidence(transactionId);
    const submittedTypes = evidence.map(e => e.type);

    const fulfilled = request.requiredTypes.every(type =>
      submittedTypes.includes(type as any)
    );

    if (fulfilled) {
      this.emit('evidence_request_fulfilled', {
        transactionId,
        request,
        evidence
      });
      this.evidenceRequests.delete(transactionId);
    }
  }

  private generateEvidenceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private calculateHash(data: any): string {
    const stringData = JSON.stringify(data);
    return crypto.createHash('sha256').update(stringData).digest('hex');
  }

  private isValidTrackingNumber(trackingNumber: string, carrier: string): boolean {
    // Simplified validation - in production would use carrier-specific patterns
    const patterns = {
      'ups': /^1Z[A-Z0-9]{16}$/,
      'fedex': /^[0-9]{12,22}$/,
      'dhl': /^[0-9]{10,11}$/,
      'usps': /^[0-9]{20,22}$/
    };

    const pattern = patterns[carrier.toLowerCase() as keyof typeof patterns];
    return pattern ? pattern.test(trackingNumber) : true;
  }

  private isValidCoordinate(latitude: number, longitude: number): boolean {
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  private async isLocationReasonable(
    transactionId: string,
    latitude: number,
    longitude: number
  ): Promise<boolean> {
    // Simplified check - in production would check against expected route
    return true;
  }

  private isLocationRequired(transactionId: string): boolean {
    // Check if location is required based on transaction type or value
    return true;
  }

  private isTrustedTimestampService(service: string): boolean {
    const trustedServices = ['timestamp.digicert.com', 'timestamp.globalsign.com'];
    return trustedServices.includes(service);
  }

  private verifyTimestampSignature(timestamp: any): boolean {
    // Simplified verification - in production would use proper crypto
    return timestamp.signature && timestamp.signature.length > 0;
  }

  private verifyWitnessSignature(witness: any): boolean {
    // Simplified verification
    return witness.signature && witness.identity && witness.identity.publicKey;
  }

  private isSupportedAlgorithm(algorithm: string): boolean {
    const supported = ['RSA-SHA256', 'ECDSA-SHA256', 'Ed25519'];
    return supported.includes(algorithm);
  }

  private verifyCertificateChain(chain: any[]): boolean {
    // Simplified verification
    return chain && chain.length > 0;
  }

  private verifyDigitalSignature(signature: any): boolean {
    // Simplified verification
    return signature.value && signature.publicKey && signature.data;
  }

  private isCertificateExpired(certificate: any): boolean {
    if (!certificate || !certificate.validUntil) return true;
    return new Date(certificate.validUntil) < new Date();
  }

  public async generateEvidenceReport(transactionId: string): Promise<any> {
    const evidence = await this.getEvidence(transactionId);
    const verifiedEvidence = evidence.filter(e => e.verified);

    return {
      transactionId,
      totalEvidence: evidence.length,
      verifiedEvidence: verifiedEvidence.length,
      evidenceTypes: [...new Set(evidence.map(e => e.type))],
      confidence: this.calculateOverallConfidence(evidence),
      summary: evidence.map(e => ({
        id: e.id,
        type: e.type,
        submittedBy: e.submittedBy,
        timestamp: e.timestamp,
        verified: e.verified
      }))
    };
  }

  private calculateOverallConfidence(evidence: Evidence[]): number {
    if (evidence.length === 0) return 0;
    
    const verifiedEvidence = evidence.filter(e => e.verified);
    const baseConfidence = verifiedEvidence.length / evidence.length;
    
    // Weight by evidence type importance
    const typeWeights: Record<EvidenceType, number> = {
      [EvidenceType.DIGITAL_SIGNATURE]: 1.0,
      [EvidenceType.BLOCKCHAIN_PROOF]: 1.0,
      [EvidenceType.SHIPPING_DOCUMENT]: 0.8,
      [EvidenceType.PHOTO_PROOF]: 0.7,
      [EvidenceType.VIDEO_PROOF]: 0.7,
      [EvidenceType.GPS_LOCATION]: 0.6,
      [EvidenceType.WITNESS_CONFIRMATION]: 0.5,
      [EvidenceType.TIMESTAMP_VERIFICATION]: 0.6,
      [EvidenceType.MULTI_SIGNATURE]: 0.9,
      [EvidenceType.INSURANCE_CONFIRMATION]: 0.8
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const e of verifiedEvidence) {
      const weight = typeWeights[e.type] || 0.5;
      weightedSum += weight;
      totalWeight += 1;
    }

    return totalWeight > 0 ? (baseConfidence * weightedSum) / totalWeight : 0;
  }
}