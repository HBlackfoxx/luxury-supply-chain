import { EventEmitter } from 'events';

export interface NotificationOptions {
  to: string;
  subject: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  channel?: 'email' | 'sms' | 'push' | 'system' | 'all';
  transactionId?: string;
  additionalInfo?: any;
}

export interface NotificationResult {
  id: string;
  success: boolean;
  channel: string;
  timestamp: Date;
  error?: string;
}

export interface NotificationPreference {
  userId: string;
  channels: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
  quietHours?: {
    start: string;
    end: string;
    timezone: string;
  };
  priorities: {
    low: string[];
    normal: string[];
    high: string[];
    critical: string[];
  };
}

export class NotificationService extends EventEmitter {
  private preferences: Map<string, NotificationPreference>;
  private notificationHistory: Map<string, NotificationResult[]>;
  private channelProviders: Map<string, any>;

  constructor() {
    super();
    this.preferences = new Map();
    this.notificationHistory = new Map();
    this.channelProviders = new Map();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize channel providers (placeholders for actual implementations)
    this.channelProviders.set('email', this.createEmailProvider());
    this.channelProviders.set('sms', this.createSMSProvider());
    this.channelProviders.set('push', this.createPushProvider());
    this.channelProviders.set('system', this.createSystemProvider());
  }

  public async send(options: NotificationOptions): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    const channels = this.determineChannels(options);
    const preferences = this.preferences.get(options.to);

    // Check quiet hours
    if (preferences && this.isQuietHours(preferences) && options.priority !== 'critical') {
      // Queue for later delivery
      await this.queueNotification(options);
      return [{
        id: this.generateNotificationId(),
        success: true,
        channel: 'queued',
        timestamp: new Date()
      }];
    }

    // Send through each channel
    for (const channel of channels) {
      if (this.shouldSendToChannel(options.to, channel, options.priority, preferences)) {
        const result = await this.sendToChannel(channel, options);
        results.push(result);
      }
    }

    // Store history
    const history = this.notificationHistory.get(options.to) || [];
    history.push(...results);
    this.notificationHistory.set(options.to, history);

    // Emit event
    this.emit('notification_sent', {
      to: options.to,
      results,
      transactionId: options.transactionId
    });

    return results;
  }

  private determineChannels(options: NotificationOptions): string[] {
    if (options.channel === 'all') {
      return ['email', 'sms', 'push', 'system'];
    }
    return [options.channel || 'email'];
  }

  private shouldSendToChannel(
    userId: string,
    channel: string,
    priority: string,
    preferences?: NotificationPreference
  ): boolean {
    if (!preferences) {
      // Default behavior when no preferences
      return channel === 'email' || priority === 'critical';
    }

    // Check if channel is enabled
    if (preferences.channels[channel as keyof typeof preferences.channels] === false) {
      return priority === 'critical'; // Override for critical
    }

    // Check priority preferences
    const allowedChannels = preferences.priorities[priority as keyof typeof preferences.priorities] || [];
    return allowedChannels.includes(channel) || priority === 'critical';
  }

  private async sendToChannel(
    channel: string,
    options: NotificationOptions
  ): Promise<NotificationResult> {
    const provider = this.channelProviders.get(channel);
    
    if (!provider) {
      return {
        id: this.generateNotificationId(),
        success: false,
        channel,
        timestamp: new Date(),
        error: `No provider for channel: ${channel}`
      };
    }

    try {
      const content = await this.prepareContent(channel, options);
      await provider.send(options.to, content);

      return {
        id: this.generateNotificationId(),
        success: true,
        channel,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        id: this.generateNotificationId(),
        success: false,
        channel,
        timestamp: new Date(),
        error: (error as Error).message
      };
    }
  }

  private async prepareContent(channel: string, options: NotificationOptions): Promise<any> {
    const baseContent = {
      subject: options.subject,
      priority: options.priority,
      transactionId: options.transactionId,
      timestamp: new Date()
    };

    switch (channel) {
      case 'email':
        return {
          ...baseContent,
          html: await this.generateEmailHTML(options),
          text: await this.generateEmailText(options)
        };

      case 'sms':
        return {
          ...baseContent,
          message: await this.generateSMSMessage(options)
        };

      case 'push':
        return {
          ...baseContent,
          title: options.subject,
          body: await this.generatePushBody(options),
          data: options.additionalInfo
        };

      case 'system':
        return {
          ...baseContent,
          data: options.additionalInfo
        };

      default:
        return baseContent;
    }
  }

  private async generateEmailHTML(options: NotificationOptions): Promise<string> {
    // Template for HTML emails
    return `
      <html>
        <body>
          <h2>${options.subject}</h2>
          <p>Transaction ID: ${options.transactionId || 'N/A'}</p>
          <p>Priority: ${options.priority}</p>
          ${options.additionalInfo ? `<pre>${JSON.stringify(options.additionalInfo, null, 2)}</pre>` : ''}
        </body>
      </html>
    `;
  }

  private async generateEmailText(options: NotificationOptions): Promise<string> {
    return `${options.subject}\n\nTransaction ID: ${options.transactionId || 'N/A'}\nPriority: ${options.priority}`;
  }

  private async generateSMSMessage(options: NotificationOptions): Promise<string> {
    // Keep SMS short
    const shortSubject = options.subject.substring(0, 50);
    return `${shortSubject}${options.transactionId ? ` (${options.transactionId.substring(0, 8)})` : ''}`;
  }

  private async generatePushBody(options: NotificationOptions): Promise<string> {
    return options.subject;
  }

  private isQuietHours(preferences: NotificationPreference): boolean {
    if (!preferences.quietHours) return false;

    const now = new Date();
    const timezone = preferences.quietHours.timezone;
    
    // Simplified quiet hours check
    const currentHour = now.getHours();
    const startHour = parseInt(preferences.quietHours.start.split(':')[0]);
    const endHour = parseInt(preferences.quietHours.end.split(':')[0]);

    if (startHour <= endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Overnight quiet hours
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  private async queueNotification(options: NotificationOptions): Promise<void> {
    // In production, this would queue to a persistent store
    this.emit('notification_queued', {
      to: options.to,
      options,
      queuedAt: new Date()
    });
  }

  public async setPreferences(userId: string, preferences: NotificationPreference): Promise<void> {
    this.preferences.set(userId, preferences);
    this.emit('preferences_updated', { userId, preferences });
  }

  public getPreferences(userId: string): NotificationPreference | undefined {
    return this.preferences.get(userId);
  }

  public getHistory(userId: string, limit?: number): NotificationResult[] {
    const history = this.notificationHistory.get(userId) || [];
    return limit ? history.slice(-limit) : history;
  }

  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Provider factory methods (placeholders)
  private createEmailProvider(): any {
    return {
      send: async (to: string, content: any) => {
        // Integration with email service (SendGrid, SES, etc.)
        console.log(`Email sent to ${to}:`, content.subject);
      }
    };
  }

  private createSMSProvider(): any {
    return {
      send: async (to: string, content: any) => {
        // Integration with SMS service (Twilio, SNS, etc.)
        console.log(`SMS sent to ${to}:`, content.message);
      }
    };
  }

  private createPushProvider(): any {
    return {
      send: async (to: string, content: any) => {
        // Integration with push notification service (FCM, APNS, etc.)
        console.log(`Push notification sent to ${to}:`, content.title);
      }
    };
  }

  private createSystemProvider(): any {
    return {
      send: async (to: string, content: any) => {
        // Internal system notifications
        console.log(`System notification for ${to}:`, content.subject);
      }
    };
  }

  // Bulk notification methods
  public async sendBulk(
    recipients: string[],
    template: Partial<NotificationOptions>
  ): Promise<Map<string, NotificationResult[]>> {
    const results = new Map<string, NotificationResult[]>();

    // Process in batches to avoid overwhelming services
    const batchSize = 100;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (recipient) => {
          const options: NotificationOptions = {
            ...template,
            to: recipient,
            subject: template.subject || 'Notification',
            priority: template.priority || 'normal'
          };
          
          const result = await this.send(options);
          results.set(recipient, result);
        })
      );
    }

    return results;
  }

  // Analytics methods
  public async getDeliveryStats(timeRange?: { start: Date; end: Date }): Promise<any> {
    const allHistory = Array.from(this.notificationHistory.values()).flat();
    
    const filtered = timeRange
      ? allHistory.filter(n => n.timestamp >= timeRange.start && n.timestamp <= timeRange.end)
      : allHistory;

    const stats = {
      total: filtered.length,
      successful: filtered.filter(n => n.success).length,
      failed: filtered.filter(n => !n.success).length,
      byChannel: {} as Record<string, number>,
      byPriority: {} as Record<string, number>
    };

    // Group by channel
    for (const notif of filtered) {
      stats.byChannel[notif.channel] = (stats.byChannel[notif.channel] || 0) + 1;
    }

    return stats;
  }
}