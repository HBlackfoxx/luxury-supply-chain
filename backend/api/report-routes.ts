import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ReportService } from '../services/report-service';
import { authenticateToken } from '../auth/auth-middleware';

export function createReportRoutes(pool: Pool) {
  const router = Router();
  const reportService = new ReportService(pool);

  // Apply authentication to all routes
  router.use(authenticateToken);

  // Generate a new report
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const { type = 'pdf', startDate, endDate, includeTransactions = true, includeDisputes = true, includeAnalytics = true, includeTrustScores = true } = req.body;
      const organizationId = (req as any).user?.organization;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start and end dates are required' });
      }

      const report = await reportService.generateReport({
        type,
        organizationId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        includeTransactions,
        includeDisputes,
        includeAnalytics,
        includeTrustScores
      });

      res.json({
        success: true,
        report
      });
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // List available reports
  router.get('/list', async (req: Request, res: Response) => {
    try {
      const organizationId = (req as any).user?.organization;
      
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization ID is required' });
      }

      const reports = await reportService.listReports(organizationId);
      
      res.json(reports);
    } catch (error) {
      console.error('Error listing reports:', error);
      res.status(500).json({ error: 'Failed to list reports' });
    }
  });

  // Delete a report
  router.delete('/:filename', async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const organizationId = (req as any).user?.organization;

      // Security check: ensure the report belongs to the user's organization
      if (!filename.includes(organizationId)) {
        return res.status(403).json({ error: 'Unauthorized to delete this report' });
      }

      await reportService.deleteReport(filename);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting report:', error);
      res.status(500).json({ error: 'Failed to delete report' });
    }
  });

  return router;
}