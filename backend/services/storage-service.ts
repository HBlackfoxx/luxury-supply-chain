// backend/services/storage-service.ts
// Local file storage service for product images and documents

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface StoredFile {
  id: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  uploadedAt: Date;
  uploadedBy?: string;
}

export class StorageService {
  private uploadDir: string;
  private maxFileSize: number;
  private allowedMimeTypes: string[];

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
    this.allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/json',
      'text/csv'
    ];

    this.ensureUploadDirectories();
  }

  /**
   * Ensure upload directories exist
   */
  private ensureUploadDirectories(): void {
    const dirs = [
      this.uploadDir,
      path.join(this.uploadDir, 'products'),
      path.join(this.uploadDir, 'documents'),
      path.join(this.uploadDir, 'qrcodes'),
      path.join(this.uploadDir, 'evidence')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created upload directory: ${dir}`);
      }
    });
  }

  /**
   * Configure multer for different upload types
   */
  public getUploadMiddleware(type: 'product' | 'document' | 'evidence' = 'document') {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        let subDir = 'documents';
        switch (type) {
          case 'product':
            subDir = 'products';
            break;
          case 'evidence':
            subDir = 'evidence';
            break;
        }
        const destPath = path.join(this.uploadDir, subDir);
        cb(null, destPath);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
        cb(null, `${sanitizedName}-${uniqueSuffix}${ext}`);
      }
    });

    const fileFilter = (req: any, file: any, cb: any) => {
      if (this.allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed`), false);
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: this.maxFileSize
      }
    });
  }

  /**
   * Save file metadata to database (PostgreSQL)
   */
  public async saveFileMetadata(
    file: Express.Multer.File,
    entityType: string,
    entityId: string,
    uploadedBy: string
  ): Promise<StoredFile> {
    const fileId = crypto.randomUUID();
    const relativePath = path.relative('.', file.path);
    
    const storedFile: StoredFile = {
      id: fileId,
      originalName: file.originalname,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      path: relativePath,
      url: `/uploads/${path.relative(this.uploadDir, file.path)}`,
      uploadedAt: new Date(),
      uploadedBy
    };

    // TODO: Save to PostgreSQL file_storage table
    // For now, save metadata as JSON
    const metadataPath = path.join(path.dirname(file.path), `${file.filename}.meta.json`);
    fs.writeFileSync(metadataPath, JSON.stringify({
      ...storedFile,
      entityType,
      entityId
    }, null, 2));

    return storedFile;
  }

  /**
   * Get file by ID
   */
  public async getFile(fileId: string): Promise<StoredFile | null> {
    // TODO: Retrieve from PostgreSQL
    // For now, scan metadata files
    const dirs = ['products', 'documents', 'evidence'];
    
    for (const dir of dirs) {
      const dirPath = path.join(this.uploadDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.endsWith('.meta.json')) {
          const metadata = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8'));
          if (metadata.id === fileId) {
            return metadata;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Delete file
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    const file = await this.getFile(fileId);
    if (!file) return false;

    try {
      // Delete actual file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      // Delete metadata
      const metadataPath = `${file.path}.meta.json`;
      if (fs.existsSync(metadataPath)) {
        fs.unlinkSync(metadataPath);
      }

      // TODO: Delete from PostgreSQL
      
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Get files for entity
   */
  public async getFilesForEntity(entityType: string, entityId: string): Promise<StoredFile[]> {
    // TODO: Query from PostgreSQL
    // For now, scan metadata files
    const files: StoredFile[] = [];
    const dirs = ['products', 'documents', 'evidence'];
    
    for (const dir of dirs) {
      const dirPath = path.join(this.uploadDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      
      const dirFiles = fs.readdirSync(dirPath);
      for (const file of dirFiles) {
        if (file.endsWith('.meta.json')) {
          const metadata = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf-8'));
          if (metadata.entityType === entityType && metadata.entityId === entityId) {
            files.push(metadata);
          }
        }
      }
    }
    
    return files;
  }

  /**
   * Store base64 image (for QR codes)
   */
  public async storeBase64Image(
    base64Data: string,
    filename: string,
    subDir: string = 'qrcodes'
  ): Promise<string> {
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Image, 'base64');
    
    const dirPath = path.join(this.uploadDir, subDir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const filePath = path.join(dirPath, filename);
    fs.writeFileSync(filePath, buffer);
    
    return `/uploads/${subDir}/${filename}`;
  }

  /**
   * Get upload statistics
   */
  public async getStorageStats(): Promise<any> {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      byType: {} as Record<string, number>,
      byDirectory: {} as Record<string, { count: number; size: number }>
    };

    const dirs = ['products', 'documents', 'evidence', 'qrcodes'];
    
    for (const dir of dirs) {
      const dirPath = path.join(this.uploadDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      
      const files = fs.readdirSync(dirPath);
      let dirSize = 0;
      let fileCount = 0;
      
      for (const file of files) {
        if (!file.endsWith('.meta.json')) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fileCount++;
            dirSize += stat.size;
            stats.totalFiles++;
            stats.totalSize += stat.size;
            
            const ext = path.extname(file).toLowerCase();
            stats.byType[ext] = (stats.byType[ext] || 0) + 1;
          }
        }
      }
      
      stats.byDirectory[dir] = { count: fileCount, size: dirSize };
    }
    
    return stats;
  }
}

// Singleton instance
export const storageService = new StorageService();