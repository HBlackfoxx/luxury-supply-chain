// backend/customer/services/service-account.ts
// Service account management for handling blockchain fees

import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface ServiceAccount {
  accountId: string;
  organizationId: string;
  type: 'brand' | 'retailer';
  balance: number;
  allocated: number;
  transactions: ServiceTransaction[];
  settings: AccountSettings;
  createdAt: Date;
  lastActivity: Date;
}

export interface ServiceTransaction {
  txId: string;
  type: 'fee' | 'refund' | 'topup';
  amount: number;
  description: string;
  customerId?: string;
  productId?: string;
  timestamp: Date;
}

export interface AccountSettings {
  autoTopUp: boolean;
  autoTopUpThreshold: number;
  autoTopUpAmount: number;
  feeAllocation: {
    ownership_claim: number;
    transfer: number;
    verification: number;
  };
  bundleTransactions: boolean;
  bundleInterval: number; // minutes
}

export interface FeeEstimate {
  operation: string;
  estimatedFee: number;
  paidBy: 'brand' | 'retailer' | 'customer';
  breakdown: {
    blockchain: number;
    processing: number;
    storage: number;
  };
}

export class ServiceAccountManager extends EventEmitter {
  private accounts: Map<string, ServiceAccount> = new Map();
  private pendingBundles: Map<string, ServiceTransaction[]> = new Map();
  private bundleTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.initializeMockAccounts();
  }

  private initializeMockAccounts(): void {
    // LuxeBags brand account
    this.accounts.set('luxebags-service', {
      accountId: 'luxebags-service',
      organizationId: 'luxebags',
      type: 'brand',
      balance: 10000, // $100 in cents
      allocated: 0,
      transactions: [],
      settings: {
        autoTopUp: true,
        autoTopUpThreshold: 1000,
        autoTopUpAmount: 5000,
        feeAllocation: {
          ownership_claim: 50, // 50 cents
          transfer: 25, // 25 cents
          verification: 5 // 5 cents
        },
        bundleTransactions: true,
        bundleInterval: 5 // 5 minutes
      },
      createdAt: new Date('2024-01-01'),
      lastActivity: new Date()
    });

    // Luxury Retail account
    this.accounts.set('luxuryretail-service', {
      accountId: 'luxuryretail-service',
      organizationId: 'luxuryretail',
      type: 'retailer',
      balance: 5000,
      allocated: 0,
      transactions: [],
      settings: {
        autoTopUp: true,
        autoTopUpThreshold: 500,
        autoTopUpAmount: 2500,
        feeAllocation: {
          ownership_claim: 25,
          transfer: 15,
          verification: 5
        },
        bundleTransactions: true,
        bundleInterval: 10
      },
      createdAt: new Date('2024-01-01'),
      lastActivity: new Date()
    });
  }

  /**
   * Get fee estimate for an operation
   */
  public estimateFee(
    operation: 'ownership_claim' | 'transfer' | 'verification',
    productBrand: string
  ): FeeEstimate {
    const brandAccount = this.getAccountByOrg(productBrand);
    const fee = brandAccount?.settings.feeAllocation[operation] || 50;
    
    return {
      operation,
      estimatedFee: fee,
      paidBy: operation === 'ownership_claim' ? 'retailer' : 'brand',
      breakdown: {
        blockchain: Math.floor(fee * 0.7), // 70% blockchain
        processing: Math.floor(fee * 0.2), // 20% processing
        storage: Math.floor(fee * 0.1) // 10% storage
      }
    };
  }

  /**
   * Process a customer operation without charging the customer
   */
  public async processCustomerOperation(
    operation: 'ownership_claim' | 'transfer' | 'verification',
    customerId: string,
    productId: string,
    productBrand: string,
    retailerId?: string
  ): Promise<string> {
    console.log(`Processing ${operation} for customer ${customerId}`);
    
    // Determine who pays
    const payerOrgId = operation === 'ownership_claim' && retailerId 
      ? retailerId 
      : productBrand;
    
    const account = this.getAccountByOrg(payerOrgId);
    if (!account) {
      throw new Error(`Service account not found for ${payerOrgId}`);
    }
    
    // Get fee amount
    const feeAmount = account.settings.feeAllocation[operation];
    
    // Check balance
    if (account.balance < feeAmount) {
      await this.handleInsufficientBalance(account);
    }
    
    // Create transaction
    const transaction: ServiceTransaction = {
      txId: this.generateTxId(),
      type: 'fee',
      amount: feeAmount,
      description: `${operation} for product ${productId}`,
      customerId,
      productId,
      timestamp: new Date()
    };
    
    // Bundle or process immediately
    if (account.settings.bundleTransactions) {
      return this.addToBundle(account.accountId, transaction);
    } else {
      return this.processTransaction(account.accountId, transaction);
    }
  }

  /**
   * Add transaction to bundle
   */
  private addToBundle(accountId: string, transaction: ServiceTransaction): string {
    if (!this.pendingBundles.has(accountId)) {
      this.pendingBundles.set(accountId, []);
      
      // Start bundle timer
      const account = this.accounts.get(accountId)!;
      // Limit timeout to 30 minutes max to prevent overflow
      const intervalMs = Math.min(account.settings.bundleInterval * 60 * 1000, 30 * 60 * 1000);
      const timer = setTimeout(() => {
        this.processBundledTransactions(accountId);
      }, intervalMs);
      
      this.bundleTimers.set(accountId, timer);
    }
    
    this.pendingBundles.get(accountId)!.push(transaction);
    
    // Process immediately if bundle is large
    if (this.pendingBundles.get(accountId)!.length >= 100) {
      this.processBundledTransactions(accountId);
    }
    
    return transaction.txId;
  }

  /**
   * Process bundled transactions
   */
  private async processBundledTransactions(accountId: string): Promise<void> {
    const transactions = this.pendingBundles.get(accountId);
    if (!transactions || transactions.length === 0) return;
    
    const account = this.accounts.get(accountId)!;
    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    
    console.log(`Processing bundle of ${transactions.length} transactions, total: $${totalAmount / 100}`);
    
    // Check balance
    if (account.balance < totalAmount) {
      await this.handleInsufficientBalance(account);
    }
    
    // Process all transactions
    account.balance -= totalAmount;
    account.transactions.push(...transactions);
    account.lastActivity = new Date();
    
    // Clear bundle
    this.pendingBundles.delete(accountId);
    
    // Clear timer
    const timer = this.bundleTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.bundleTimers.delete(accountId);
    }
    
    // Emit event
    this.emit('bundle_processed', {
      accountId,
      transactionCount: transactions.length,
      totalAmount,
      timestamp: new Date()
    });
    
    // Check if auto-topup needed
    if (account.settings.autoTopUp && 
        account.balance < account.settings.autoTopUpThreshold) {
      await this.autoTopUp(account);
    }
  }

  /**
   * Process single transaction
   */
  private async processTransaction(
    accountId: string, 
    transaction: ServiceTransaction
  ): Promise<string> {
    const account = this.accounts.get(accountId)!;
    
    // Deduct fee
    account.balance -= transaction.amount;
    account.transactions.push(transaction);
    account.lastActivity = new Date();
    
    // Check if auto-topup needed
    if (account.settings.autoTopUp && 
        account.balance < account.settings.autoTopUpThreshold) {
      await this.autoTopUp(account);
    }
    
    this.emit('transaction_processed', transaction);
    
    return transaction.txId;
  }

  /**
   * Handle insufficient balance
   */
  private async handleInsufficientBalance(account: ServiceAccount): Promise<void> {
    console.log(`Insufficient balance for ${account.accountId}, triggering auto-topup`);
    
    if (account.settings.autoTopUp) {
      await this.autoTopUp(account);
    } else {
      throw new Error('Insufficient balance and auto-topup disabled');
    }
  }

  /**
   * Auto top-up account
   */
  private async autoTopUp(account: ServiceAccount): Promise<void> {
    const topUpAmount = account.settings.autoTopUpAmount;
    
    console.log(`Auto-topping up ${account.accountId} with $${topUpAmount / 100}`);
    
    // In production, charge payment method
    account.balance += topUpAmount;
    
    const topUpTx: ServiceTransaction = {
      txId: this.generateTxId(),
      type: 'topup',
      amount: topUpAmount,
      description: 'Automatic top-up',
      timestamp: new Date()
    };
    
    account.transactions.push(topUpTx);
    
    this.emit('auto_topup', {
      accountId: account.accountId,
      amount: topUpAmount,
      newBalance: account.balance,
      timestamp: new Date()
    });
  }

  /**
   * Get account by organization
   */
  private getAccountByOrg(orgId: string): ServiceAccount | undefined {
    return Array.from(this.accounts.values())
      .find(acc => acc.organizationId === orgId);
  }

  /**
   * Get account balance
   */
  public getAccountBalance(accountId: string): {
    balance: number;
    allocated: number;
    available: number;
  } {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    
    return {
      balance: account.balance,
      allocated: account.allocated,
      available: account.balance - account.allocated
    };
  }

  /**
   * Get transaction history
   */
  public getTransactionHistory(
    accountId: string,
    startDate?: Date,
    endDate?: Date
  ): ServiceTransaction[] {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    
    let transactions = account.transactions;
    
    if (startDate) {
      transactions = transactions.filter(tx => tx.timestamp >= startDate);
    }
    
    if (endDate) {
      transactions = transactions.filter(tx => tx.timestamp <= endDate);
    }
    
    return transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get usage analytics
   */
  public getUsageAnalytics(accountId: string): {
    totalTransactions: number;
    totalSpent: number;
    averageTransactionCost: number;
    topOperations: { operation: string; count: number; total: number }[];
    dailyUsage: { date: string; transactions: number; amount: number }[];
  } {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    
    const feeTransactions = account.transactions.filter(tx => tx.type === 'fee');
    const totalSpent = feeTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    
    // Group by operation type
    const operationStats = new Map<string, { count: number; total: number }>();
    
    feeTransactions.forEach(tx => {
      const operation = tx.description.split(' ')[0];
      const stats = operationStats.get(operation) || { count: 0, total: 0 };
      stats.count++;
      stats.total += tx.amount;
      operationStats.set(operation, stats);
    });
    
    // Daily usage
    const dailyStats = new Map<string, { transactions: number; amount: number }>();
    
    feeTransactions.forEach(tx => {
      const date = tx.timestamp.toISOString().split('T')[0];
      const stats = dailyStats.get(date) || { transactions: 0, amount: 0 };
      stats.transactions++;
      stats.amount += tx.amount;
      dailyStats.set(date, stats);
    });
    
    return {
      totalTransactions: feeTransactions.length,
      totalSpent,
      averageTransactionCost: feeTransactions.length > 0 
        ? Math.round(totalSpent / feeTransactions.length) 
        : 0,
      topOperations: Array.from(operationStats.entries())
        .map(([operation, stats]) => ({ operation, ...stats }))
        .sort((a, b) => b.count - a.count),
      dailyUsage: Array.from(dailyStats.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * Update account settings
   */
  public updateAccountSettings(
    accountId: string,
    settings: Partial<AccountSettings>
  ): void {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error('Account not found');
    }
    
    account.settings = {
      ...account.settings,
      ...settings
    };
    
    this.emit('settings_updated', {
      accountId,
      settings: account.settings,
      timestamp: new Date()
    });
  }

  /**
   * Generate transaction ID
   */
  private generateTxId(): string {
    return `TX-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  /**
   * Cleanup
   */
  public shutdown(): void {
    // Process any pending bundles
    for (const accountId of this.pendingBundles.keys()) {
      this.processBundledTransactions(accountId);
    }
    
    // Clear all timers
    for (const timer of this.bundleTimers.values()) {
      clearTimeout(timer);
    }
    
    this.bundleTimers.clear();
    this.pendingBundles.clear();
  }
}