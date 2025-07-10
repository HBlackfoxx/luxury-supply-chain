// backend/gateway/src/fabric/transaction-handler.ts
// Transaction Handler for Hyperledger Fabric
// Updated for fabric-gateway 1.x API

import { Contract, Network, Gateway, ProposalOptions, SubmittedTransaction } from '@hyperledger/fabric-gateway';

export interface TransactionOptions {
  transientData?: Record<string, Buffer>;
  endorsingOrganizations?: string[];
  arguments?: string[];
  timeout?: number;
  retries?: number;
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  result?: any;
  error?: Error;
  timestamp: Date;
  blockNumber?: bigint;
  retryCount?: number;
}

export class TransactionHandler {
  private readonly textDecoder = new TextDecoder();
  private readonly textEncoder = new TextEncoder();
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly defaultRetries = 3;

  public async submitTransaction(
    contract: Contract,
    transactionName: string,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    const startTime = Date.now();
    const maxRetries = options.retries || this.defaultRetries;
    
    let lastError: Error | undefined;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const result = await this.executeTransaction(
          contract,
          transactionName,
          options
        );

        return {
          success: true,
          transactionId: result.transactionId,
          result: result.payload,
          timestamp: new Date(),
          blockNumber: result.blockNumber,
          retryCount
        };
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        if (this.shouldRetry(error) && retryCount < maxRetries) {
          await this.delay(this.calculateBackoff(retryCount));
          continue;
        }
        break;
      }
    }

    return {
      success: false,
      error: lastError,
      timestamp: new Date(),
      retryCount
    };
  }

  public async evaluateTransaction(
    contract: Contract,
    transactionName: string,
    ...args: string[]
  ): Promise<TransactionResult> {
    try {
      const resultBytes = await contract.evaluateTransaction(transactionName, ...args);
      const result = this.parseResult(resultBytes);

      return {
        success: true,
        result,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        timestamp: new Date()
      };
    }
  }

  private async executeTransaction(
    contract: Contract,
    transactionName: string,
    options: TransactionOptions
  ): Promise<{ transactionId: string; payload: any; blockNumber: bigint }> {
    const args = options.arguments || [];
    
    // Create proposal
    const proposalOptions: ProposalOptions = {};
    
    // Add transient data if provided
    if (options.transientData) {
      proposalOptions.transientData = options.transientData;
    }
    
    // Add endorsing organizations if specified
    if (options.endorsingOrganizations) {
      proposalOptions.endorsingOrganizations = options.endorsingOrganizations;
    }
    
    // Submit transaction and wait for commit
    let submitted: Uint8Array;
    let commit: SubmittedTransaction;
    
    if (proposalOptions.transientData || proposalOptions.endorsingOrganizations) {
      // Use newProposal for advanced options
      const proposal = contract.newProposal(transactionName, proposalOptions);
      const transaction = await proposal.endorse(...args);
      submitted = transaction.getResult();
      commit = await transaction.submit();
    } else {
      // Use simple submit for basic transactions
      submitted = await contract.submitTransaction(transactionName, ...args);
      // For simple submit, we need to get the transaction ID differently
      const result = this.parseResult(submitted);
      return {
        transactionId: 'tx_' + Date.now(), // Temporary ID since we can't get it from simple submit
        payload: result,
        blockNumber: BigInt(0) // Default value
      };
    }

    // Wait for transaction to be committed
    const status = await commit.getStatus();
    
    if (!status.successful) {
      throw new Error(`Transaction ${status.transactionId} failed to commit with status ${status.code}`);
    }

    // Parse result
    const payload = this.parseResult(submitted);

    return {
      transactionId: status.transactionId,
      payload,
      blockNumber: status.blockNumber
    };
  }

  private parseResult(resultBytes: Uint8Array): any {
    if (!resultBytes || resultBytes.length === 0) {
      return null;
    }
    
    const resultString = this.textDecoder.decode(resultBytes);
    
    try {
      return JSON.parse(resultString);
    } catch {
      return resultString;
    }
  }

  private shouldRetry(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || error.toString();
    
    // Retry on network errors
    if (errorMessage.includes('UNAVAILABLE') || 
        errorMessage.includes('DEADLINE_EXCEEDED') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT')) {
      return true;
    }

    // Don't retry on logical errors
    if (errorMessage.includes('ENDORSEMENT_POLICY_FAILURE') ||
        errorMessage.includes('MVCC_READ_CONFLICT') ||
        errorMessage.includes('INVALID_TRANSACTION') ||
        errorMessage.includes('DUPLICATE_TXID')) {
      return false;
    }

    return false;
  }

  private calculateBackoff(retryCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 10000; // 10 seconds
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    return exponentialDelay + jitter;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async submitBatchTransactions(
    contract: Contract,
    transactions: Array<{
      name: string;
      options: TransactionOptions;
    }>
  ): Promise<TransactionResult[]> {
    const results: TransactionResult[] = [];

    for (const tx of transactions) {
      const result = await this.submitTransaction(
        contract,
        tx.name,
        tx.options
      );
      results.push(result);

      // Stop if transaction failed
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  public createTransientData(data: Record<string, any>): Record<string, Buffer> {
    const transientData: Record<string, Buffer> = {};
    
    for (const [key, value] of Object.entries(data)) {
      const valueString = typeof value === 'string' ? value : JSON.stringify(value);
      transientData[key] = Buffer.from(valueString);
    }

    return transientData;
  }

  public async queryWithPagination(
    contract: Contract,
    queryName: string,
    pageSize: number,
    bookmark: string = ''
  ): Promise<{
    results: any[];
    metadata: {
      recordsCount: number;
      bookmark: string;
    };
  }> {
    const result = await this.evaluateTransaction(
      contract,
      queryName,
      pageSize.toString(),
      bookmark
    );

    if (!result.success || !result.result) {
      throw result.error || new Error('Query failed');
    }

    return result.result;
  }

  public async queryByRange(
    contract: Contract,
    startKey: string,
    endKey: string
  ): Promise<any[]> {
    const result = await this.evaluateTransaction(
      contract,
      'queryByRange',
      startKey,
      endKey
    );

    if (!result.success || !result.result) {
      throw result.error || new Error('Range query failed');
    }

    return result.result;
  }

  // Helper to create arguments array from object
  public createArguments(data: any): string[] {
    if (Array.isArray(data)) {
      return data.map(item => typeof item === 'string' ? item : JSON.stringify(item));
    }
    return [typeof data === 'string' ? data : JSON.stringify(data)];
  }
}