// backend/services/notification-service.ts
// Notification service for sending alerts and updates

import { EventEmitter } from 'events';

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

export class NotificationService extends EventEmitter {
  private config: NotificationConfig;
  private notificationQueue: Notification[] = [];

  constructor(config: NotificationConfig = {
    emailEnabled: true,
    smsEnabled: false,
    webhookEnabled: true
  }) {
    super();
    this.config = config;
    this.startQueueProcessor();
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
    
    // Emit for immediate processing if high priority
    if (notification.priority === 'high' || notification.priority === 'urgent') {
      this.emit('notification:urgent', notification);
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
      this.emit('in_app_notification', notification);
    }

    await Promise.all(promises);
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
    this.emit('notification:email_queued', {
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
    
    this.emit('notification:sms_queued', {
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
}

// Singleton instance
export const notificationService = new NotificationService();