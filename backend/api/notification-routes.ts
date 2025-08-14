// backend/api/notification-routes.ts
// REST API endpoints for notifications

import express, { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification-service';

export interface NotificationRequest extends Request {
  user?: {
    id: string;
    organization: string;
    role: string;
  };
}

export function createNotificationRoutes(): Router {
  const router = express.Router();

  /**
   * Get notifications for current user
   */
  router.get('/', async (req: NotificationRequest, res: Response) => {
    try {
      const recipient = req.user?.id || req.query.recipient as string;
      if (!recipient) {
        return res.status(400).json({ error: 'Recipient required' });
      }

      const limit = parseInt(req.query.limit as string || '50');
      const offset = parseInt(req.query.offset as string || '0');
      const unreadOnly = req.query.unreadOnly === 'true';
      const type = req.query.type as string;

      const notifications = await notificationService.getNotificationsForUser(
        recipient,
        { limit, offset, unreadOnly, type }
      );

      const unreadCount = await notificationService.getUnreadCount(recipient);

      res.json({
        notifications,
        unreadCount,
        total: notifications.length,
        limit,
        offset
      });
    } catch (error) {
      console.error('Failed to get notifications:', error);
      res.status(500).json({ 
        error: 'Failed to retrieve notifications' 
      });
    }
  });

  /**
   * Get unread notification count
   */
  router.get('/unread-count', async (req: NotificationRequest, res: Response) => {
    try {
      const recipient = req.user?.id || req.query.recipient as string;
      if (!recipient) {
        return res.status(400).json({ error: 'Recipient required' });
      }

      const count = await notificationService.getUnreadCount(recipient);
      
      res.json({ count });
    } catch (error) {
      console.error('Failed to get unread count:', error);
      res.status(500).json({ 
        error: 'Failed to get unread count' 
      });
    }
  });

  /**
   * Mark notification as read
   */
  router.put('/:id/read', async (req: NotificationRequest, res: Response) => {
    try {
      const notificationId = parseInt(req.params.id);
      const recipient = req.user?.id || req.body.recipient;
      
      if (!recipient) {
        return res.status(400).json({ error: 'Recipient required' });
      }

      const success = await notificationService.markAsRead(notificationId, recipient);
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'Notification marked as read' 
        });
      } else {
        res.status(404).json({ 
          error: 'Notification not found or unauthorized' 
        });
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
      res.status(500).json({ 
        error: 'Failed to mark notification as read' 
      });
    }
  });

  /**
   * Mark all notifications as read
   */
  router.put('/read-all', async (req: NotificationRequest, res: Response) => {
    try {
      const recipient = req.user?.id || req.body.recipient;
      
      if (!recipient) {
        return res.status(400).json({ error: 'Recipient required' });
      }

      const success = await notificationService.markAllAsRead(recipient);
      
      if (success) {
        res.json({ 
          success: true, 
          message: 'All notifications marked as read' 
        });
      } else {
        res.status(500).json({ 
          error: 'Failed to mark notifications as read' 
        });
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      res.status(500).json({ 
        error: 'Failed to mark all notifications as read' 
      });
    }
  });

  /**
   * Send test notification (development only)
   */
  if (process.env.NODE_ENV !== 'production') {
    router.post('/test', async (req: NotificationRequest, res: Response) => {
      try {
        const { recipient, type = 'test', message = 'Test notification' } = req.body;
        
        if (!recipient) {
          return res.status(400).json({ error: 'Recipient required' });
        }

        await notificationService.sendNotification({
          type,
          recipients: [recipient],
          transaction: { id: 'TEST-' + Date.now() }
        });

        res.json({ 
          success: true, 
          message: 'Test notification sent' 
        });
      } catch (error) {
        console.error('Failed to send test notification:', error);
        res.status(500).json({ 
          error: 'Failed to send test notification' 
        });
      }
    });
  }

  /**
   * Get notification statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = notificationService.getStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get stats:', error);
      res.status(500).json({ 
        error: 'Failed to get notification statistics' 
      });
    }
  });

  /**
   * Clean old notifications (admin only)
   */
  router.delete('/cleanup', async (req: NotificationRequest, res: Response) => {
    try {
      // Check if user is admin
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const daysToKeep = parseInt(req.query.days as string || '30');
      const deletedCount = await notificationService.deleteOldNotifications(daysToKeep);

      res.json({ 
        success: true, 
        message: `Deleted ${deletedCount} old notifications`,
        deletedCount
      });
    } catch (error) {
      console.error('Failed to cleanup notifications:', error);
      res.status(500).json({ 
        error: 'Failed to cleanup notifications' 
      });
    }
  });

  return router;
}