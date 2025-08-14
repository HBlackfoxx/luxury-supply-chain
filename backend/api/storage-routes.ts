// backend/api/storage-routes.ts
// REST API endpoints for file storage

import express, { Router, Request, Response } from 'express';
import { storageService } from '../services/storage-service';
import path from 'path';

export interface StorageRequest extends Request {
  user?: {
    id: string;
    organization: string;
    role: string;
  };
}

export function createStorageRoutes(): Router {
  const router = express.Router();

  // Get upload middleware for different file types
  const productUpload = storageService.getUploadMiddleware('product');
  const documentUpload = storageService.getUploadMiddleware('document');
  const evidenceUpload = storageService.getUploadMiddleware('evidence');

  /**
   * Upload product image
   */
  router.post('/upload/product/:productId', 
    productUpload.single('image'),
    async (req: StorageRequest, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { productId } = req.params;
        const uploadedBy = req.user?.id || 'anonymous';

        const storedFile = await storageService.saveFileMetadata(
          req.file,
          'product',
          productId,
          uploadedBy
        );

        res.json({
          success: true,
          file: storedFile
        });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
          error: 'Failed to upload file',
          message: (error as Error).message 
        });
      }
    }
  );

  /**
   * Upload multiple product images
   */
  router.post('/upload/product/:productId/batch',
    productUpload.array('images', 10),
    async (req: StorageRequest, res: Response) => {
      try {
        if (!req.files || !Array.isArray(req.files)) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        const { productId } = req.params;
        const uploadedBy = req.user?.id || 'anonymous';

        const storedFiles = await Promise.all(
          req.files.map(file => 
            storageService.saveFileMetadata(file, 'product', productId, uploadedBy)
          )
        );

        res.json({
          success: true,
          files: storedFiles
        });
      } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({ 
          error: 'Failed to upload files',
          message: (error as Error).message 
        });
      }
    }
  );

  /**
   * Upload document
   */
  router.post('/upload/document',
    documentUpload.single('document'),
    async (req: StorageRequest, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { entityType, entityId } = req.body;
        if (!entityType || !entityId) {
          return res.status(400).json({ 
            error: 'Missing entityType or entityId' 
          });
        }

        const uploadedBy = req.user?.id || 'anonymous';

        const storedFile = await storageService.saveFileMetadata(
          req.file,
          entityType,
          entityId,
          uploadedBy
        );

        res.json({
          success: true,
          file: storedFile
        });
      } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({ 
          error: 'Failed to upload document',
          message: (error as Error).message 
        });
      }
    }
  );

  /**
   * Upload evidence for dispute
   */
  router.post('/upload/evidence/:disputeId',
    evidenceUpload.array('evidence', 5),
    async (req: StorageRequest, res: Response) => {
      try {
        if (!req.files || !Array.isArray(req.files)) {
          return res.status(400).json({ error: 'No files uploaded' });
        }

        const { disputeId } = req.params;
        const uploadedBy = req.user?.id || 'anonymous';

        const storedFiles = await Promise.all(
          req.files.map(file => 
            storageService.saveFileMetadata(file, 'dispute_evidence', disputeId, uploadedBy)
          )
        );

        res.json({
          success: true,
          files: storedFiles
        });
      } catch (error) {
        console.error('Evidence upload error:', error);
        res.status(500).json({ 
          error: 'Failed to upload evidence',
          message: (error as Error).message 
        });
      }
    }
  );

  /**
   * Get file by ID
   */
  router.get('/file/:fileId', async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const file = await storageService.getFile(fileId);

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.json(file);
    } catch (error) {
      console.error('Get file error:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve file',
        message: (error as Error).message 
      });
    }
  });

  /**
   * Get files for entity
   */
  router.get('/files/:entityType/:entityId', async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.params;
      const files = await storageService.getFilesForEntity(entityType, entityId);

      res.json({
        entityType,
        entityId,
        files,
        count: files.length
      });
    } catch (error) {
      console.error('Get entity files error:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve files',
        message: (error as Error).message 
      });
    }
  });

  /**
   * Delete file
   */
  router.delete('/file/:fileId', async (req: StorageRequest, res: Response) => {
    try {
      const { fileId } = req.params;
      
      // Check permissions (only uploader or admin can delete)
      const file = await storageService.getFile(fileId);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // TODO: Check if user has permission to delete
      
      const deleted = await storageService.deleteFile(fileId);
      
      if (deleted) {
        res.json({ 
          success: true, 
          message: 'File deleted successfully' 
        });
      } else {
        res.status(500).json({ error: 'Failed to delete file' });
      }
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ 
        error: 'Failed to delete file',
        message: (error as Error).message 
      });
    }
  });

  /**
   * Get storage statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await storageService.getStorageStats();
      res.json(stats);
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ 
        error: 'Failed to get storage statistics',
        message: (error as Error).message 
      });
    }
  });

  /**
   * Store base64 image (for QR codes)
   */
  router.post('/store-base64', async (req: StorageRequest, res: Response) => {
    try {
      const { base64Data, filename, type = 'qrcodes' } = req.body;
      
      if (!base64Data || !filename) {
        return res.status(400).json({ 
          error: 'Missing base64Data or filename' 
        });
      }

      const url = await storageService.storeBase64Image(base64Data, filename, type);
      
      res.json({
        success: true,
        url,
        filename
      });
    } catch (error) {
      console.error('Store base64 error:', error);
      res.status(500).json({ 
        error: 'Failed to store base64 image',
        message: (error as Error).message 
      });
    }
  });

  return router;
}