import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../auth/auth-middleware';

export function createAuditRoutes(pool: Pool) {
  const router = Router();

  // Apply authentication to all routes
  router.use(authenticateToken);

  // Get audit logs with filters
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const { 
        userId, 
        action, 
        entityType, 
        entityId, 
        startDate, 
        endDate, 
        limit = 100, 
        offset = 0 
      } = req.query;

      let query = `
        SELECT 
          al.*,
          u.name as user_name,
          u.email as user_email,
          u.organization as user_organization
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      // Add filters
      if (userId) {
        query += ` AND al.user_id = $${paramCount++}`;
        params.push(userId);
      }

      if (action) {
        query += ` AND al.action = $${paramCount++}`;
        params.push(action);
      }

      if (entityType) {
        query += ` AND al.entity_type = $${paramCount++}`;
        params.push(entityType);
      }

      if (entityId) {
        query += ` AND al.entity_id = $${paramCount++}`;
        params.push(entityId);
      }

      if (startDate) {
        query += ` AND al.created_at >= $${paramCount++}`;
        params.push(new Date(startDate as string));
      }

      if (endDate) {
        query += ` AND al.created_at <= $${paramCount++}`;
        params.push(new Date(endDate as string));
      }

      // Check user's role - non-admins can only see their own organization's logs
      const user = (req as any).user;
      if (user?.role !== 'admin') {
        query += ` AND u.organization = $${paramCount++}`;
        params.push(user.organization);
      }

      query += ` ORDER BY al.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(*) 
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const countParams = params.slice(0, -2); // Remove limit and offset

      if (userId) countQuery += ` AND al.user_id = $1`;
      if (action) countQuery += ` AND al.action = $2`;
      if (entityType) countQuery += ` AND al.entity_type = $3`;
      if (entityId) countQuery += ` AND al.entity_id = $4`;
      if (startDate) countQuery += ` AND al.created_at >= $5`;
      if (endDate) countQuery += ` AND al.created_at <= $6`;
      if (user?.role !== 'admin') countQuery += ` AND u.organization = $${countParams.length}`;

      const countResult = await pool.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        logs: result.rows,
        pagination: {
          total: totalCount,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          pages: Math.ceil(totalCount / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // Get audit log statistics
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const { days = 30 } = req.query;
      const user = (req as any).user;

      let baseQuery = '';
      const params: any[] = [];
      let intervalClause = `NOW() - INTERVAL '${days} days'`;

      if (user?.role !== 'admin') {
        baseQuery = ` AND u.organization = $1`;
        params.push(user.organization);
      }

      // Get action counts
      const actionResult = await pool.query(`
        SELECT 
          action,
          COUNT(*) as count
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= ${intervalClause}
        ${baseQuery}
        GROUP BY action
        ORDER BY count DESC
      `, params);

      // Get entity type counts
      const entityResult = await pool.query(`
        SELECT 
          entity_type,
          COUNT(*) as count
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= ${intervalClause}
          AND entity_type IS NOT NULL
        ${baseQuery}
        GROUP BY entity_type
        ORDER BY count DESC
      `, params);

      // Get daily activity
      const dailyResult = await pool.query(`
        SELECT 
          DATE(al.created_at) as date,
          COUNT(*) as count
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= ${intervalClause}
        ${baseQuery}
        GROUP BY DATE(al.created_at)
        ORDER BY date DESC
      `, params);

      // Get top users
      const userResult = await pool.query(`
        SELECT 
          al.user_id,
          u.name,
          u.email,
          u.organization,
          COUNT(*) as action_count
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= ${intervalClause}
        ${baseQuery}
        GROUP BY al.user_id, u.name, u.email, u.organization
        ORDER BY action_count DESC
        LIMIT 10
      `, params);

      res.json({
        actions: actionResult.rows,
        entities: entityResult.rows,
        dailyActivity: dailyResult.rows,
        topUsers: userResult.rows
      });
    } catch (error) {
      console.error('Error fetching audit statistics:', error);
      res.status(500).json({ error: 'Failed to fetch audit statistics' });
    }
  });

  // Log a new audit entry (internal use)
  router.post('/log', async (req: Request, res: Response) => {
    try {
      const { action, entityType, entityId, details } = req.body;
      const user = (req as any).user;

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      const result = await pool.query(`
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        user?.id || 'system',
        action,
        entityType || null,
        entityId || null,
        details ? JSON.stringify(details) : null,
        req.ip || null
      ]);

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating audit log:', error);
      res.status(500).json({ error: 'Failed to create audit log' });
    }
  });

  // Get audit log for specific entity
  router.get('/entity/:entityType/:entityId', async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.params;
      const { limit = 50 } = req.query;

      const result = await pool.query(`
        SELECT 
          al.*,
          u.name as user_name,
          u.email as user_email
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.entity_type = $1 AND al.entity_id = $2
        ORDER BY al.created_at DESC
        LIMIT $3
      `, [entityType, entityId, limit]);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching entity audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch entity audit logs' });
    }
  });

  return router;
}