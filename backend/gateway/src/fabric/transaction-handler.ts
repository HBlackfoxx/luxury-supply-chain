// Transaction Handler for Hyperledger Fabric
// Manages blockchain transactions with retry logic and error handling

import { Contract, Network, Gateway, ProposalOptions, TransientMap } from '@hyperledger/fabric-gateway';

export interface TransactionOptions {
  transientData?: TransientMap;
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
  blockNumber?: number;
  retryCount?: number;
}

export class TransactionHandler {
  private readonly textDecoder = new TextDecoder();
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly defaultRetries = 3;

  public async submitTransaction(
    contract: Contract,
    transactionName: string,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    const startTime = Date.now();
    const timeout = options.timeout || this.defaultTimeout;
    const maxRetries = options.retries || this.defaultRetries;
    
    let lastError: Error | undefined;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const result = await this.executeTransaction(
          contract,
          transactionName,
          options,
          timeout
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
      const resultString = this.textDecoder.decode(resultBytes);
      
      let result: any;
      try {
        result = JSON.parse(resultString);
      } catch {
        result = resultString;
      }

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
    options: TransactionOptions,
    timeout: number
  ): Promise<{ transactionId: string; payload: any; blockNumber: number }> {
    const args = options.arguments || [];
    
    // Create proposal with options
    const proposal = contract.newProposal(transactionName, {
      arguments: args,
      transientData: options.transientData,
      endorsingOrganizations: options.endorsingOrganizations
    });

    // Endorse the transaction
    const transaction = await proposal.endorse();

    // Submit the transaction
    const commit = await transaction.submit();

    // Wait for transaction to be committed
    const status = await commit.getStatus();
    
    if (!status.successful) {
      throw new Error(`Transaction ${status.transactionId} failed to commit with status ${status.code}`);
    }

    // Get transaction result
    const resultBytes = transaction.getResult();
    const resultString = this.textDecoder.decode(resultBytes);
    
    let payload: any;
    try {
      payload = JSON.parse(resultString);
    } catch {
      payload = resultString;
    }

    return {
      transactionId: status.transactionId,
      payload,
      blockNumber: status.blockNumber!
    };
  }

  private shouldRetry(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || error.toString();
    
    // Retry on network errors
    if (errorMessage.includes('UNAVAILABLE') || 
        errorMessage.includes('DEADLINE_EXCEEDED') ||
        errorMessage.includes('ECONNREFUSED')) {
      return true;
    }

    // Don't retry on logical errors
    if (errorMessage.includes('ENDORSEMENT_POLICY_FAILURE') ||
        errorMessage.includes('MVCC_READ_CONFLICT') ||
        errorMessage.includes('INVALID_TRANSACTION')) {
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

  public createTransientData(data: Record<string, any>): TransientMap {
    const transientData: TransientMap = {};
    
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
}