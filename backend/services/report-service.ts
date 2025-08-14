import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';

export interface ReportOptions {
  type: 'pdf' | 'csv';
  organizationId: string;
  startDate: Date;
  endDate: Date;
  includeTransactions?: boolean;
  includeDisputes?: boolean;
  includeAnalytics?: boolean;
  includeTrustScores?: boolean;
}

export class ReportService {
  private pool: Pool;
  private reportsDir: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.reportsDir = process.env.REPORTS_DIR || path.join(process.cwd(), 'uploads', 'reports');
    
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generateReport(options: ReportOptions): Promise<{ filename: string; path: string; url: string }> {
    const timestamp = format(new Date(), 'yyyyMMdd-HHmmss');
    const filename = `report-${options.organizationId}-${timestamp}.${options.type}`;
    const filepath = path.join(this.reportsDir, filename);

    if (options.type === 'csv') {
      await this.generateCSVReport(filepath, options);
    } else {
      await this.generatePDFReport(filepath, options);
    }

    return {
      filename,
      path: filepath,
      url: `/uploads/reports/${filename}`
    };
  }

  private async generateCSVReport(filepath: string, options: ReportOptions): Promise<void> {
    const csvLines: string[] = [];
    
    // Header
    csvLines.push(`Supply Chain Report - ${options.organizationId}`);
    csvLines.push(`Period: ${format(options.startDate, 'yyyy-MM-dd')} to ${format(options.endDate, 'yyyy-MM-dd')}`);
    csvLines.push(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`);
    csvLines.push('');

    // Transactions Section
    if (options.includeTransactions) {
      csvLines.push('TRANSACTIONS');
      csvLines.push('ID,Type,Partner,Item,Status,Value,Created,Confirmed');
      
      const txResult = await this.pool.query(`
        SELECT 
          id,
          CASE WHEN sender_id = $1 THEN 'SENT' ELSE 'RECEIVED' END as type,
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END as partner,
          item_description,
          status,
          value,
          created_at,
          confirmed_at
        FROM consensus_transactions
        WHERE (sender_id = $1 OR receiver_id = $1)
          AND created_at BETWEEN $2 AND $3
        ORDER BY created_at DESC
      `, [options.organizationId, options.startDate, options.endDate]);

      for (const row of txResult.rows) {
        csvLines.push([
          row.id,
          row.type,
          row.partner,
          `"${row.item_description}"`,
          row.status,
          row.value,
          format(new Date(row.created_at), 'yyyy-MM-dd HH:mm'),
          row.confirmed_at ? format(new Date(row.confirmed_at), 'yyyy-MM-dd HH:mm') : ''
        ].join(','));
      }
      csvLines.push('');
    }

    // Disputes Section
    if (options.includeDisputes) {
      csvLines.push('DISPUTES');
      csvLines.push('Transaction ID,Reason,Status,Created,Resolved');
      
      const disputeResult = await this.pool.query(`
        SELECT 
          transaction_id,
          dispute_reason,
          status,
          created_at,
          resolved_at
        FROM consensus_transactions
        WHERE (sender_id = $1 OR receiver_id = $1)
          AND created_at BETWEEN $2 AND $3
          AND status = 'DISPUTED'
        ORDER BY created_at DESC
      `, [options.organizationId, options.startDate, options.endDate]);

      for (const row of disputeResult.rows) {
        csvLines.push([
          row.transaction_id,
          `"${row.dispute_reason || 'Not specified'}"`,
          row.status,
          format(new Date(row.created_at), 'yyyy-MM-dd HH:mm'),
          row.resolved_at ? format(new Date(row.resolved_at), 'yyyy-MM-dd HH:mm') : ''
        ].join(','));
      }
      csvLines.push('');
    }

    // Analytics Summary
    if (options.includeAnalytics) {
      csvLines.push('ANALYTICS SUMMARY');
      
      // Transaction stats
      const statsResult = await this.pool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'VALIDATED' THEN 1 END) as validated,
          COUNT(CASE WHEN status = 'DISPUTED' THEN 1 END) as disputed,
          AVG(value) as avg_value,
          SUM(value) as total_value
        FROM consensus_transactions
        WHERE (sender_id = $1 OR receiver_id = $1)
          AND created_at BETWEEN $2 AND $3
      `, [options.organizationId, options.startDate, options.endDate]);

      const stats = statsResult.rows[0];
      csvLines.push(`Total Transactions,${stats.total_transactions}`);
      csvLines.push(`Validated,${stats.validated}`);
      csvLines.push(`Disputed,${stats.disputed}`);
      csvLines.push(`Average Value,${parseFloat(stats.avg_value || 0).toFixed(2)}`);
      csvLines.push(`Total Value,${parseFloat(stats.total_value || 0).toFixed(2)}`);
      csvLines.push('');
    }

    // Trust Scores
    if (options.includeTrustScores) {
      csvLines.push('TRUST SCORES');
      csvLines.push('Partner,Score,Transactions,Disputes,Last Interaction');
      
      const trustResult = await this.pool.query(`
        SELECT 
          partner_id,
          trust_score,
          total_transactions,
          dispute_count,
          last_interaction
        FROM trust_scores
        WHERE organization_id = $1
        ORDER BY trust_score DESC
      `, [options.organizationId]);

      for (const row of trustResult.rows) {
        csvLines.push([
          row.partner_id,
          row.trust_score.toFixed(1),
          row.total_transactions,
          row.dispute_count,
          format(new Date(row.last_interaction), 'yyyy-MM-dd')
        ].join(','));
      }
    }

    // Write to file
    fs.writeFileSync(filepath, csvLines.join('\n'), 'utf8');
  }

  private async generatePDFReport(filepath: string, options: ReportOptions): Promise<void> {
    // For PDF generation, we'll create an HTML report that can be converted to PDF
    // In production, you would use a library like puppeteer or pdfkit
    
    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Supply Chain Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; border-bottom: 2px solid #d4af37; padding-bottom: 10px; }
    h2 { color: #666; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f5f5f5; padding: 10px; text-align: left; border: 1px solid #ddd; }
    td { padding: 8px; border: 1px solid #ddd; }
    .summary { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .metric-label { font-weight: bold; color: #666; }
    .metric-value { font-size: 24px; color: #333; }
  </style>
</head>
<body>
  <h1>Supply Chain Report</h1>
  <div class="summary">
    <p><strong>Organization:</strong> ${options.organizationId}</p>
    <p><strong>Period:</strong> ${format(options.startDate, 'yyyy-MM-dd')} to ${format(options.endDate, 'yyyy-MM-dd')}</p>
    <p><strong>Generated:</strong> ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
  </div>
`;

    // Add analytics summary
    if (options.includeAnalytics) {
      const statsResult = await this.pool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'VALIDATED' THEN 1 END) as validated,
          COUNT(CASE WHEN status = 'DISPUTED' THEN 1 END) as disputed,
          AVG(value) as avg_value,
          SUM(value) as total_value
        FROM consensus_transactions
        WHERE (sender_id = $1 OR receiver_id = $1)
          AND created_at BETWEEN $2 AND $3
      `, [options.organizationId, options.startDate, options.endDate]);

      const stats = statsResult.rows[0];
      
      html += `
  <h2>Performance Metrics</h2>
  <div class="summary">
    <div class="metric">
      <div class="metric-label">Total Transactions</div>
      <div class="metric-value">${stats.total_transactions}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Validation Rate</div>
      <div class="metric-value">${stats.total_transactions > 0 ? ((stats.validated / stats.total_transactions) * 100).toFixed(1) : 0}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Dispute Rate</div>
      <div class="metric-value">${stats.total_transactions > 0 ? ((stats.disputed / stats.total_transactions) * 100).toFixed(1) : 0}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Total Value</div>
      <div class="metric-value">$${parseFloat(stats.total_value || 0).toFixed(2)}</div>
    </div>
  </div>
`;
    }

    // Add transactions table
    if (options.includeTransactions) {
      const txResult = await this.pool.query(`
        SELECT 
          id,
          CASE WHEN sender_id = $1 THEN 'SENT' ELSE 'RECEIVED' END as type,
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END as partner,
          item_description,
          status,
          value,
          created_at
        FROM consensus_transactions
        WHERE (sender_id = $1 OR receiver_id = $1)
          AND created_at BETWEEN $2 AND $3
        ORDER BY created_at DESC
        LIMIT 50
      `, [options.organizationId, options.startDate, options.endDate]);

      html += `
  <h2>Recent Transactions</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Type</th>
        <th>Partner</th>
        <th>Item</th>
        <th>Status</th>
        <th>Value</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
`;

      for (const row of txResult.rows) {
        html += `
      <tr>
        <td>${row.id.substring(0, 8)}...</td>
        <td>${row.type}</td>
        <td>${row.partner}</td>
        <td>${row.item_description}</td>
        <td>${row.status}</td>
        <td>$${row.value}</td>
        <td>${format(new Date(row.created_at), 'yyyy-MM-dd HH:mm')}</td>
      </tr>
`;
      }

      html += `
    </tbody>
  </table>
`;
    }

    // Add trust scores
    if (options.includeTrustScores) {
      const trustResult = await this.pool.query(`
        SELECT 
          partner_id,
          trust_score,
          total_transactions,
          dispute_count
        FROM trust_scores
        WHERE organization_id = $1
        ORDER BY trust_score DESC
        LIMIT 10
      `, [options.organizationId]);

      if (trustResult.rows.length > 0) {
        html += `
  <h2>Partner Trust Scores</h2>
  <table>
    <thead>
      <tr>
        <th>Partner</th>
        <th>Trust Score</th>
        <th>Transactions</th>
        <th>Disputes</th>
      </tr>
    </thead>
    <tbody>
`;

        for (const row of trustResult.rows) {
          html += `
      <tr>
        <td>${row.partner_id}</td>
        <td>${row.trust_score.toFixed(1)}%</td>
        <td>${row.total_transactions}</td>
        <td>${row.dispute_count}</td>
      </tr>
`;
        }

        html += `
    </tbody>
  </table>
`;
      }
    }

    html += `
</body>
</html>
`;

    // Save as HTML (can be converted to PDF with additional tools)
    fs.writeFileSync(filepath.replace('.pdf', '.html'), html, 'utf8');
    
    // For now, we'll also save the HTML as a "PDF" placeholder
    // In production, you would use a proper PDF generation library
    fs.writeFileSync(filepath, html, 'utf8');
  }

  async listReports(organizationId: string, limit: number = 20): Promise<any[]> {
    const files = fs.readdirSync(this.reportsDir);
    const reports = files
      .filter(f => f.includes(organizationId))
      .map(filename => {
        const filepath = path.join(this.reportsDir, filename);
        const stats = fs.statSync(filepath);
        return {
          filename,
          url: `/uploads/reports/${filename}`,
          size: stats.size,
          createdAt: stats.birthtime,
          type: filename.endsWith('.csv') ? 'csv' : 'pdf'
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    
    return reports;
  }

  async deleteReport(filename: string): Promise<void> {
    const filepath = path.join(this.reportsDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}