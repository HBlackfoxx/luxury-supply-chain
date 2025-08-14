// consensus/2check/core/timeout/timeout-handler.ts
// Handles transaction timeouts and reminders

import { EventEmitter } from 'events';
import { Transaction, TransactionState } from '../state/state-manager';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface TimeoutConfig {
  default: number;
  categories: TimeoutCategory[];
  reminders: ReminderConfig;
}

export interface TimeoutCategory {
  name: string;
  condition: any;
  timeout: number;
}

export interface ReminderConfig {
  first: number;
  second: number;
  final: number;
}

export interface ReminderSchedule {
  transactionId: string;
  reminderType: 'first' | 'second' | 'final';
  scheduledFor: Date;
  recipient: string;
  sent: boolean;
}

export class TimeoutHandler extends EventEmitter {
  private config: any;
  private transactions: Map<string, Transaction> = new Map();
  private reminders: Map<string, ReminderSchedule[]> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private validationEngine?: any;

  constructor(validationEngine?: any, configPath?: string) {
    super();
    this.validationEngine = validationEngine;
    this.loadConfig(configPath);
  }

  private loadConfig(configPath?: string) {
    const defaultPath = path.join(__dirname, '../../config/2check-config.yaml');
    const configFile = configPath || defaultPath;
    
    const configContent = fs.readFileSync(configFile, 'utf8');
    this.config = yaml.load(configContent) as any;
  }

  /**
   * Start monitoring transactions for timeouts
   */
  public startMonitoring(checkIntervalMs: number = 60000): void {
    if (this.checkInterval) {
      this.stopMonitoring();
    }

    this.checkInterval = setInterval(() => {
      this.checkTimeouts();
    }, checkIntervalMs);

    console.log(`Timeout monitoring started (interval: ${checkIntervalMs}ms)`);
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Timeout monitoring stopped');
    }
  }

  /**
   * Register a transaction for timeout monitoring
   */
  public registerTransaction(transaction: Transaction): void {
    this.transactions.set(transaction.id, transaction);
    this.scheduleReminders(transaction);
    
    this.emit('transaction:registered', {
      transactionId: transaction.id,
      timeoutAt: transaction.timeoutAt
    });
  }

  /**
   * Update transaction (e.g., after state change)
   */
  public updateTransaction(transaction: Transaction): void {
    this.transactions.set(transaction.id, transaction);
    
    // If transaction is in terminal state, remove from monitoring
    if (this.isTerminalState(transaction.state)) {
      this.removeTransaction(transaction.id);
    } else {
      // Reschedule reminders if needed
      this.rescheduleReminders(transaction);
    }
  }

  /**
   * Remove transaction from monitoring
   */
  public removeTransaction(transactionId: string): void {
    this.transactions.delete(transactionId);
    this.reminders.delete(transactionId);
    
    this.emit('transaction:removed', { transactionId });
  }

  /**
   * Check all transactions for timeouts
   */
  private checkTimeouts(): void {
    const now = new Date();
    let timeoutCount = 0;
    let reminderCount = 0;

    // Check for timeouts
    for (const [id, transaction] of this.transactions) {
      if (this.isTerminalState(transaction.state)) {
        this.removeTransaction(id);
        continue;
      }

      // Check if transaction has timed out
      if (transaction.timeoutAt <= now) {
        this.handleTimeout(transaction);
        timeoutCount++;
      } else {
        // Check for reminders
        const remindersToSend = this.checkReminders(transaction, now);
        reminderCount += remindersToSend.length;
      }
    }

    if (timeoutCount > 0 || reminderCount > 0) {
      this.emit('check:completed', {
        transactions: this.transactions.size,
        timeouts: timeoutCount,
        reminders: reminderCount
      });
    }
  }

  /**
   * Handle transaction timeout
   */
  private handleTimeout(transaction: Transaction): void {
    this.emit('timeout:detected', {
      transaction,
      exceededBy: Date.now() - transaction.timeoutAt.getTime()
    });

    // Remove from active monitoring
    this.removeTransaction(transaction.id);
  }

  /**
   * Schedule reminders for a transaction
   */
  private scheduleReminders(transaction: Transaction): void {
    const reminders = this.config.consensus.timeouts.reminders;
    const scheduledReminders: ReminderSchedule[] = [];

    // Determine who needs reminders
    const recipient = this.determineReminderRecipient(transaction);
    if (!recipient) return;

    // Schedule each reminder type
    Object.entries(reminders).forEach(([type, hours]) => {
      const reminderTime = new Date(
        transaction.timeoutAt.getTime() - (hours as number) * 60 * 60 * 1000
      );

      // Only schedule if reminder time is in the future
      if (reminderTime > new Date()) {
        scheduledReminders.push({
          transactionId: transaction.id,
          reminderType: type as 'first' | 'second' | 'final',
          scheduledFor: reminderTime,
          recipient,
          sent: false
        });
      }
    });

    this.reminders.set(transaction.id, scheduledReminders);
  }

  /**
   * Reschedule reminders (e.g., after state change)
   */
  private rescheduleReminders(transaction: Transaction): void {
    // Clear existing reminders
    this.reminders.delete(transaction.id);
    
    // Schedule new ones based on current state
    this.scheduleReminders(transaction);
  }

  /**
   * Check if reminders need to be sent
   */
  private checkReminders(transaction: Transaction, now: Date): ReminderSchedule[] {
    const remindersToSend: ReminderSchedule[] = [];
    const scheduledReminders = this.reminders.get(transaction.id) || [];

    for (const reminder of scheduledReminders) {
      if (!reminder.sent && reminder.scheduledFor <= now) {
        // Send reminder
        this.sendReminder(transaction, reminder);
        reminder.sent = true;
        remindersToSend.push(reminder);
      }
    }

    return remindersToSend;
  }

  /**
   * Send a reminder
   */
  private sendReminder(transaction: Transaction, reminder: ReminderSchedule): void {
    const hoursRemaining = Math.floor(
      (transaction.timeoutAt.getTime() - Date.now()) / (1000 * 60 * 60)
    );

    this.emit('reminder:send', {
      transaction,
      reminder,
      hoursRemaining,
      urgency: this.calculateUrgency(reminder.reminderType)
    });
  }

  /**
   * Determine who should receive reminders
   */
  private determineReminderRecipient(transaction: Transaction): string | null {
    switch (transaction.state) {
      case TransactionState.CREATED:
        return transaction.sender;
      case TransactionState.SENT:
        return transaction.receiver;
      case TransactionState.DISPUTED:
        // Both parties get reminders for disputes
        return 'both';
      default:
        return null;
    }
  }

  /**
   * Calculate reminder urgency
   */
  private calculateUrgency(reminderType: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (reminderType) {
      case 'first':
        return 'low';
      case 'second':
        return 'medium';
      case 'final':
        return 'critical';
      default:
        return 'high';
    }
  }

  /**
   * Check if state is terminal
   */
  private isTerminalState(state: TransactionState): boolean {
    const terminalStates = [
      TransactionState.VALIDATED,
      TransactionState.CANCELLED,
      TransactionState.RESOLVED
    ];
    return terminalStates.includes(state);
  }

  /**
   * Calculate custom timeout for a transaction
   */
  public calculateTimeout(transaction: any): number {
    const categories = this.config.consensus.timeouts.categories;
    
    // Check each category
    for (const category of categories) {
      if (this.matchesCondition(transaction, category.condition)) {
        return category.timeout;
      }
    }
    
    // Return default timeout
    return this.config.consensus.timeouts.default;
  }

  /**
   * Check if transaction matches a condition
   */
  private matchesCondition(transaction: any, condition: any): boolean {
    const value = this.getNestedValue(transaction, condition.field);
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'greater_than':
        return value > condition.value;
      case 'less_than':
        return value < condition.value;
      case 'in':
        return condition.value.includes(value);
      default:
        return false;
    }
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }

  /**
   * Get timeout statistics
   */
  public getStatistics(): {
    monitored: number;
    pendingReminders: number;
    overdueTransactions: number;
    averageTimeToTimeout: number;
  } {
    const now = new Date();
    let overdueCount = 0;
    let totalTimeToTimeout = 0;
    let pendingReminderCount = 0;

    for (const [id, transaction] of this.transactions) {
      if (transaction.timeoutAt <= now) {
        overdueCount++;
      }
      
      totalTimeToTimeout += transaction.timeoutAt.getTime() - transaction.created.getTime();
      
      const reminders = this.reminders.get(id) || [];
      pendingReminderCount += reminders.filter(r => !r.sent).length;
    }

    return {
      monitored: this.transactions.size,
      pendingReminders: pendingReminderCount,
      overdueTransactions: overdueCount,
      averageTimeToTimeout: this.transactions.size > 0 
        ? totalTimeToTimeout / this.transactions.size / (1000 * 60 * 60) // hours
        : 0
    };
  }

  /**
   * Force check (for testing)
   */
  public forceCheck(): void {
    this.checkTimeouts();
  }

  /**
   * Start timeout for a transaction
   */
  public async startTimeout(transactionId: string): Promise<void> {
    // This method is called when a transaction is created
    // The actual registration happens via registerTransaction
    this.emit('timeout:started', { transactionId });
  }

  /**
   * Update timeout for a transaction phase
   */
  public async updateTimeout(transactionId: string, phase: string): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      // Update timeout based on phase
      this.rescheduleReminders(transaction);
      this.emit('timeout:updated', { transactionId, phase });
    }
  }

  /**
   * Clear timeout for a transaction
   */
  public async clearTimeout(transactionId: string): Promise<void> {
    this.removeTransaction(transactionId);
    this.emit('timeout:cleared', { transactionId });
  }
}