// backend/services/notification-service.ts
// Notification service for sending alerts and updates

import { Pool } from 'pg';

export interface NotificationConfig {
  emailEnabled: boolean;
  smsEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl?: string;
}

export interface Notification {
  id: string;
  type: 'transaction_sent' | 'transaction_received' | 'dispute_created' | 'dispute_resolved' | 'timeout_warning' | 'emergency_stop';
  recipients: string[];
  subject: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channels: ('email' | 'sms' | 'webhook' | 'in_app')[];
  timestamp: Date;
}

export class NotificationService {
  private config: NotificationConfig;
  private notificationQueue: Notification[] = [];
  private pool: Pool | null = null;

  constructor(config: NotificationConfig = {
    emailEnabled: true,
    smsEnabled: false,
    webhookEnabled: true
  }) {
    this.config = config;
    this.initializeDatabase();
    this.startQueueProcessor();
  }

  /**
   * Initialize database connection
   */
  private initializeDatabase(): void {
    if (process.env.DB_TYPE === 'postgres') {
      this.pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'luxury_supply_chain',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      });
      
      this.pool.on('error', (err) => {
        console.error('Unexpected database error:', err);
      });
    }
  }

  /**
   * Send notification based on type and data
   */
  public async sendNotification(data: {
    type: string;
    transaction?: any;
    recipients: string[];
    hoursRemaining?: number;
  }): Promise<void> {
    const notification = this.createNotification(data);
    
    // Add to queue
    this.notificationQueue.push(notification);
    
    // Log for immediate processing if high priority
    if (notification.priority === 'high' || notification.priority === 'urgent') {
      console.log('High priority notification:', notification.type, notification.recipients);
    }
  }

  /**
   * Create notification object based on type
   */
  private createNotification(data: any): Notification {
    const id = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();
    
    switch (data.type) {
      case 'transaction_sent':
        return {
          id,
          type: 'transaction_sent',
          recipients: data.recipients,
          subject: `Transaction ${data.transaction.id} sent - confirmation required`,
          message: `${data.transaction.sender} has sent ${data.transaction.itemId}. Please confirm receipt.`,
          data: { transactionId: data.transaction.id },
          priority: 'medium',
          channels: ['email', 'in_app'],
          timestamp
        };

      case 'dispute_created':
        return {
          id,
          type: 'dispute_created',
          recipients: data.recipients,
          subject: `Dispute created for transaction ${data.transaction.id}`,
          message: `A dispute has been raised for transaction ${data.transaction.id}. Immediate attention required.`,
          data: { transactionId: data.transaction.id },
          priority: 'high',
          channels: ['email', 'sms', 'in_app'],
          timestamp
        };

      case 'timeout':
        return {
          id,
          type: 'timeout_warning',
          recipients: data.recipients,
          subject: `Transaction ${data.transaction.id} timeout warning`,
          message: `Transaction will timeout in ${data.hoursRemaining} hours. Please take action.`,
          data: { transactionId: data.transaction.id, hoursRemaining: data.hoursRemaining },
          priority: data.hoursRemaining < 2 ? 'urgent' : 'high',
          channels: ['email', 'in_app'],
          timestamp
        };

      default:
        return {
          id,
          type: 'transaction_sent',
          recipients: data.recipients,
          subject: 'Notification',
          message: 'You have a new notification',
          data,
          priority: 'low',
          channels: ['in_app'],
          timestamp
        };
    }
  }

  /**
   * Process notification queue
   */
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (this.notificationQueue.length === 0) return;

      const batch = this.notificationQueue.splice(0, 10); // Process 10 at a time
      
      for (const notification of batch) {
        try {
          await this.processNotification(notification);
        } catch (error) {
          console.error('Failed to process notification:', error);
          // Re-queue failed notifications
          this.notificationQueue.push(notification);
        }
      }
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process individual notification
   */
  private async processNotification(notification: Notification): Promise<void> {
    // First, save to database
    await this.saveNotificationToDatabase(notification);
    
    const promises: Promise<void>[] = [];

    // Email notification
    if (notification.channels.includes('email') && this.config.emailEnabled) {
      promises.push(this.sendEmail(notification));
    }

    // SMS notification
    if (notification.channels.includes('sms') && this.config.smsEnabled) {
      promises.push(this.sendSMS(notification));
    }

    // Webhook notification
    if (notification.channels.includes('webhook') && this.config.webhookEnabled) {
      promises.push(this.sendWebhook(notification));
    }

    // In-app notification (always enabled)
    if (notification.channels.includes('in_app')) {
      console.log('In-app notification sent:', notification.type, notification.recipients);
    }

    await Promise.all(promises);
  }

  /**
   * Save notification to database
   */
  private async saveNotificationToDatabase(notification: Notification): Promise<void> {
    if (!this.pool) {
      console.log('Database not configured, skipping notification persistence');
      return;
    }

    try {
      // Save to all recipients
      for (const recipient of notification.recipients) {
        await this.pool.query(
          `INSERT INTO notifications (type, recipient, subject, message, data, priority, channels, read)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            notification.type,
            recipient,
            notification.subject,
            notification.message,
            JSON.stringify(notification.data || {}),
            notification.priority,
            notification.channels,
            false
          ]
        );
      }
    } catch (error) {
      console.error('Failed to save notification to database:', error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(notification: Notification): Promise<void> {
    // In production, integrate with SendGrid, AWS SES, etc.
    console.log(`EMAIL: To: ${notification.recipients.join(', ')}`);
    console.log(`Subject: ${notification.subject}`);
    console.log(`Message: ${notification.message}`);
    
    // Store in database for email service to pick up
    console.log('Email queued:', {
      to: notification.recipients,
      subject: notification.subject,
      body: notification.message,
      data: notification.data
    });
  }

  /**
   * Send SMS notification
   */
  private async sendSMS(notification: Notification): Promise<void> {
    // In production, integrate with Twilio, AWS SNS, etc.
    console.log(`SMS: To: ${notification.recipients.join(', ')}`);
    console.log(`Message: ${notification.message.substring(0, 160)}`); // SMS limit
    
    console.log('SMS queued:', {
      to: notification.recipients,
      message: notification.message.substring(0, 160)
    });
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(notification: Notification): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Notification-Type': notification.type,
          'X-Notification-ID': notification.id
        },
        body: JSON.stringify({
          id: notification.id,
          type: notification.type,
          recipients: notification.recipients,
          subject: notification.subject,
          message: notification.message,
          data: notification.data,
          priority: notification.priority,
          timestamp: notification.timestamp
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Webhook notification failed:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  public getStats() {
    return {
      queueSize: this.notificationQueue.length,
      config: this.config
    };
  }

  /**
   * Get notifications for a user
   */
  public async getNotificationsForUser(
    recipient: string, 
    options: { 
      limit?: number; 
      offset?: number; 
      unreadOnly?: boolean;
      type?: string;
    } = {}
  ): Promise<any[]> {
    if (!this.pool) {
      return [];
    }

    try {
      let query = 'SELECT * FROM notifications WHERE recipient = $1';
      const params: any[] = [recipient];
      let paramIndex = 2;

      if (options.unreadOnly) {
        query += ` AND read = false`;
      }

      if (options.type) {
        query += ` AND type = $${paramIndex}`;
        params.push(options.type);
        paramIndex++;
      }

      query += ' ORDER BY created_at DESC';

      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to get notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(notificationId: number, recipient: string): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      const result = await this.pool.query(
        'UPDATE notifications SET read = true, read_at = NOW() WHERE id = $1 AND recipient = $2',
        [notificationId, recipient]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  public async markAllAsRead(recipient: string): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      await this.pool.query(
        'UPDATE notifications SET read = true, read_at = NOW() WHERE recipient = $1 AND read = false',
        [recipient]
      );
      return true;
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      return false;
    }
  }

  /**
   * Get unread notification count
   */
  public async getUnreadCount(recipient: string): Promise<number> {
    if (!this.pool) {
      return 0;
    }

    try {
      const result = await this.pool.query(
        'SELECT COUNT(*) as count FROM notifications WHERE recipient = $1 AND read = false',
        [recipient]
      );
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  /**
   * Delete old notifications
   */
  public async deleteOldNotifications(daysToKeep: number = 30): Promise<number> {
    if (!this.pool) {
      return 0;
    }

    try {
      const result = await this.pool.query(
        'DELETE FROM notifications WHERE created_at < NOW() - INTERVAL \'$1 days\'',
        [daysToKeep]
      );
      return result.rowCount ?? 0;
    } catch (error) {
      console.error('Failed to delete old notifications:', error);
      return 0;
    }
  }
}

// Singleton instance
export const notificationService = new NotificationService();