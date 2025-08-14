// backend/services/qr-service.ts
// QR code generation service for products

import QRCode from 'qrcode';
import { storageService } from './storage-service';
import fs from 'fs';
import path from 'path';

export interface QRData {
  productId: string;
  serialNumber: string;
  brand: string;
  claimUrl: string;
  verifyUrl: string;
  createdAt: string;
}

export class QRService {
  private customerGatewayUrl: string;
  private verificationUrl: string;

  constructor() {
    // Customer Gateway URL (will be used when customer gateway is implemented)
    this.customerGatewayUrl = process.env.CUSTOMER_GATEWAY_URL || 'http://localhost:3002';
    this.verificationUrl = process.env.VERIFICATION_URL || 'http://localhost:3000';
  }

  /**
   * Generate QR code for a product
   */
  async generateProductQR(
    productId: string,
    serialNumber: string,
    brand: string
  ): Promise<{ dataUrl: string; storedPath: string }> {
    try {
      // QR data that will be encoded
      const qrData: QRData = {
        productId,
        serialNumber,
        brand,
        claimUrl: `${this.customerGatewayUrl}/claim/${productId}`,
        verifyUrl: `${this.verificationUrl}/verify/${productId}`,
        createdAt: new Date().toISOString()
      };

      // Generate QR code options
      const qrOptions: QRCode.QRCodeToDataURLOptions = {
        errorCorrectionLevel: 'H', // High error correction
        type: 'image/png',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 512 // High resolution for printing
      };

      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(
        JSON.stringify(qrData),
        qrOptions
      );

      // Store QR code image
      const filename = `${productId}-${Date.now()}.png`;
      const storedPath = await storageService.storeBase64Image(
        dataUrl,
        filename,
        'qrcodes'
      );

      // Also save QR metadata
      await this.saveQRMetadata(productId, qrData, storedPath);

      return {
        dataUrl,
        storedPath
      };
    } catch (error) {
      console.error('QR generation error:', error);
      throw new Error(`Failed to generate QR code: ${(error as Error).message}`);
    }
  }

  /**
   * Generate batch QR codes
   */
  async generateBatchQR(
    products: Array<{ productId: string; serialNumber: string; brand: string }>
  ): Promise<Array<{ productId: string; dataUrl: string; storedPath: string }>> {
    const results = [];

    for (const product of products) {
      try {
        const qr = await this.generateProductQR(
          product.productId,
          product.serialNumber,
          product.brand
        );
        results.push({
          productId: product.productId,
          ...qr
        });
      } catch (error) {
        console.error(`Failed to generate QR for ${product.productId}:`, error);
        results.push({
          productId: product.productId,
          dataUrl: '',
          storedPath: '',
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Generate QR code with custom logo
   */
  async generateQRWithLogo(
    productId: string,
    serialNumber: string,
    brand: string,
    logoPath?: string
  ): Promise<{ dataUrl: string; storedPath: string }> {
    // First generate basic QR
    const basicQR = await this.generateProductQR(productId, serialNumber, brand);

    // If no logo, return basic QR
    if (!logoPath || !fs.existsSync(logoPath)) {
      return basicQR;
    }

    // TODO: Implement logo overlay using canvas or sharp library
    // For now, return basic QR
    console.log('Logo overlay not yet implemented');
    return basicQR;
  }

  /**
   * Save QR metadata
   */
  private async saveQRMetadata(
    productId: string,
    qrData: QRData,
    imagePath: string
  ): Promise<void> {
    const metadataPath = path.join(
      process.env.UPLOAD_DIR || './uploads',
      'qrcodes',
      `${productId}.meta.json`
    );

    const metadata = {
      ...qrData,
      imagePath,
      generatedAt: new Date().toISOString()
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Get QR code for product
   */
  async getProductQR(productId: string): Promise<{
    qrData: QRData | null;
    imagePath: string | null;
  }> {
    try {
      const metadataPath = path.join(
        process.env.UPLOAD_DIR || './uploads',
        'qrcodes',
        `${productId}.meta.json`
      );

      if (!fs.existsSync(metadataPath)) {
        return { qrData: null, imagePath: null };
      }

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      return {
        qrData: metadata,
        imagePath: metadata.imagePath
      };
    } catch (error) {
      console.error('Error retrieving QR code:', error);
      return { qrData: null, imagePath: null };
    }
  }

  /**
   * Verify QR code data
   */
  async verifyQRCode(qrDataString: string): Promise<{
    valid: boolean;
    data?: QRData;
    error?: string;
  }> {
    try {
      const qrData = JSON.parse(qrDataString) as QRData;

      // Verify required fields
      if (!qrData.productId || !qrData.serialNumber || !qrData.brand) {
        return {
          valid: false,
          error: 'Invalid QR code format'
        };
      }

      // Check if product exists (would query blockchain in production)
      const storedQR = await this.getProductQR(qrData.productId);
      if (!storedQR.qrData) {
        return {
          valid: false,
          error: 'Product not found'
        };
      }

      // Verify data matches
      if (
        storedQR.qrData.serialNumber !== qrData.serialNumber ||
        storedQR.qrData.brand !== qrData.brand
      ) {
        return {
          valid: false,
          error: 'QR code data mismatch'
        };
      }

      return {
        valid: true,
        data: qrData
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid QR code'
      };
    }
  }

  /**
   * Generate printable QR sheet (multiple QR codes on one page)
   */
  async generateQRSheet(
    products: Array<{ productId: string; serialNumber: string; brand: string }>
  ): Promise<string> {
    // TODO: Generate PDF with multiple QR codes using pdfkit
    console.log('QR sheet generation not yet implemented');
    return 'qr-sheet.pdf';
  }

  /**
   * Get QR statistics
   */
  async getQRStats(): Promise<{
    totalGenerated: number;
    byBrand: Record<string, number>;
    recentQRs: Array<{ productId: string; generatedAt: string }>;
  }> {
    const qrcodesDir = path.join(
      process.env.UPLOAD_DIR || './uploads',
      'qrcodes'
    );

    if (!fs.existsSync(qrcodesDir)) {
      return {
        totalGenerated: 0,
        byBrand: {},
        recentQRs: []
      };
    }

    const files = fs.readdirSync(qrcodesDir);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));
    
    const stats = {
      totalGenerated: metaFiles.length,
      byBrand: {} as Record<string, number>,
      recentQRs: [] as Array<{ productId: string; generatedAt: string }>
    };

    for (const file of metaFiles) {
      try {
        const metadata = JSON.parse(
          fs.readFileSync(path.join(qrcodesDir, file), 'utf-8')
        );
        
        // Count by brand
        stats.byBrand[metadata.brand] = (stats.byBrand[metadata.brand] || 0) + 1;
        
        // Add to recent list
        stats.recentQRs.push({
          productId: metadata.productId,
          generatedAt: metadata.generatedAt
        });
      } catch (error) {
        console.error(`Error reading QR metadata ${file}:`, error);
      }
    }

    // Sort recent QRs by date
    stats.recentQRs.sort((a, b) => 
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    );
    
    // Keep only last 10
    stats.recentQRs = stats.recentQRs.slice(0, 10);

    return stats;
  }
}

// Singleton instance
export const qrService = new QRService();