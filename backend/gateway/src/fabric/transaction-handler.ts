// backend/gateway/src/fabric/transaction-handler.ts
// Transaction Handler for Hyperledger Fabric
// CORRECTED for fabric-gateway 1.x API - Second Pass

import {
    Contract,
    Proposal,
    SubmittedTransaction,
    EndorseError,
    SubmitError,
    CommitError,
    CommitStatusError,
    StatusCode,
    GatewayError
} from '@hyperledger/fabric-gateway';
import {TextDecoder} from 'util';

export interface TransactionOptions {
  transientData?: Record<string, Buffer>;
  endorsingOrganizations?: string[];
  arguments?: string[];
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  result?: any;
  error?: GatewayError | Error;
  timestamp: Date;
  blockNumber?: bigint;
}

export class TransactionHandler {
  private readonly textDecoder = new TextDecoder();

  public async submitTransaction(
    contract: Contract,
    transactionName: string,
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    try {
      const args = options.arguments || [];
      
      // The new way: create a proposal first. The transaction ID lives on the proposal.
      const proposal = contract.newProposal(transactionName, {
          arguments: args,
          endorsingOrganizations: options.endorsingOrganizations,
          transientData: options.transientData
      });

      const transactionId = proposal.getTransactionId();
      const endorsedTransaction = await proposal.endorse();
      const commit = await endorsedTransaction.submit();
      const status = await commit.getStatus();

      if (!status.successful) {
        // Corrected error instantiation to avoid signature issues.
        throw new Error(`Transaction ${status.transactionId} failed to commit with status code ${status.code}`);
      }
      
      const resultBytes = endorsedTransaction.getResult();
      const result = this.parseResult(resultBytes);

      return {
        success: true,
        transactionId: status.transactionId,
        result,
        blockNumber: status.blockNumber,
        timestamp: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: error as GatewayError | Error,
        timestamp: new Date()
      };
    }
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
        error: error as GatewayError | Error,
        timestamp: new Date()
      };
    }
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

  // Error handling helpers
  public isEndorsementError(error: any): boolean {
    return error instanceof EndorseError;
  }

  public isSubmitError(error: any): boolean {
    return error instanceof SubmitError;
  }

  public isCommitError(error: any): boolean {
    return error instanceof CommitError || error instanceof CommitStatusError;
  }

  public getErrorDetails(error: any): any[] {
    if (error instanceof GatewayError && error.details) {
        return error.details;
    }
    return [];
  }
}