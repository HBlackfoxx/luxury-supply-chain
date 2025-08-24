// consensus/consensus-engine.ts
// Production consensus engine implementation for 2-Check consensus

import { Gateway, Network, Contract } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { TransactionHandler } from '../gateway/src/fabric/transaction-handler';
import { GatewayManager } from '../gateway/src/fabric/gateway-manager';
import { SDKConfigManager } from '../gateway/src/config/sdk-config';
import { IdentityManager } from '../gateway/src/fabric/identity-manager';

interface ConsensusTransaction {
  id: string;
  sender: string;
  receiver: string;
  state: 'INITIATED' | 'SENT' | 'RECEIVED' | 'VALIDATED' | 'DISPUTED' | 'TIMEOUT';
  itemType: string;
  itemId: string;
  quantity?: number;
  timestamp: string;
  sentTimestamp?: string;
  receivedTimestamp?: string;
  metadata?: Record<string, string>;
  disputeReason?: string;
  evidence?: Array<{
    type: string;
    submittedBy: string;
    timestamp: string;
    hash: string;
    verified: boolean;
  }>;
}

interface TrustScore {
  partyId: string;
  score: number;
  totalTransactions: number;
  successfulTransactions: number;
  disputedTransactions: number;
  lastUpdated: string;
}

export class ConsensusEngine {
  private gateway?: Gateway;
  private network?: Network;
  private consensusContract?: Contract;
  private supplyContract?: Contract;
  private transactionHandler: TransactionHandler;
  private gatewayManager?: GatewayManager;
  private configManager?: SDKConfigManager;
  private identityManager?: IdentityManager;
  private organization: string;
  private userId: string;
  private initialized = false;

  constructor(organization: string = 'luxebags', userId: string = 'admin-luxebags') {
    this.organization = organization;
    this.userId = userId;
    this.transactionHandler = new TransactionHandler();
    // Will initialize these only when needed
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Initialize managers if not already set
      if (!this.gatewayManager) {
        this.configManager = new SDKConfigManager(this.organization);
        this.identityManager = new IdentityManager(this.configManager);
        this.gatewayManager = new GatewayManager(this.configManager, this.identityManager);
      }

      // Map database user ID to Fabric identity (same logic as supply-chain API)
      let fabricUserId = 'User1'; // Default
      
      if (this.userId.includes('admin')) {
        fabricUserId = 'Admin';
      } else if (this.userId.includes('user1')) {
        fabricUserId = 'User1';
      } else if (this.userId.includes('user2')) {
        fabricUserId = 'User2';
      }

      // Connect using GatewayManager (same as supply-chain API)
      this.gateway = await this.gatewayManager.connect({ 
        orgId: this.organization, 
        userId: fabricUserId 
      });

      // Get network and contracts
      this.network = this.gateway.getNetwork('luxury-supply-chain');
      this.consensusContract = this.network.getContract('2check-consensus', 'ConsensusContract');
      this.supplyContract = this.network.getContract('luxury-supply-chain', 'SupplyChainContract');
      
      this.initialized = true;
      console.log('Consensus engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize consensus engine:', error);
      throw error;
    }
  }

  private getPeerPort(org: string): number {
    const portMap: Record<string, number> = {
      'luxebags': 7051,
      'italianleather': 8051,
      'craftworkshop': 9051,
      'luxuryretail': 10051
    };
    return portMap[org] || 7051;
  }

  /**
   * Create a B2B transaction directly on blockchain
   * This replaces the state manager based approach
   */
  async createB2BTransaction(params: {
    sender: string;
    receiver: string;
    itemId: string;
    value: number;
    metadata?: any;
  }): Promise<string> {
    try {
      await this.initialize();
      
      // Generate transaction ID
      const transactionId = `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Convert all metadata values to strings for Go chaincode compatibility
      const metadata: Record<string, string> = {};
      if (params.metadata) {
        for (const [key, value] of Object.entries(params.metadata)) {
          metadata[key] = String(value);
        }
      }
      // Add value as string in metadata
      metadata.value = String(params.value);
      
      // Submit transaction directly to blockchain
      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'SubmitTransaction',
        {
          arguments: [
            transactionId,
            params.sender,
            params.receiver,
            'material',  // Default type for B2B transfers
            params.itemId,
            JSON.stringify(metadata)
          ]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to create transaction');
      }

      console.log(`Transaction ${transactionId} created on blockchain`);
      console.log(`From ${params.sender} to ${params.receiver}`);
      
      // Wait a moment for transaction to be committed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify transaction was created
      try {
        const verifyResult = await this.transactionHandler.evaluateTransaction(
          this.consensusContract!,
          'GetTransaction',
          transactionId
        );
        console.log('Verification result:', JSON.stringify(verifyResult));
        if (verifyResult.success) {
          console.log('Transaction verified in blockchain');
        } else {
          console.error('Transaction verification failed:', verifyResult.error);
        }
      } catch (verifyError) {
        console.error('Warning: Could not verify transaction immediately after creation:', verifyError);
      }
      
      return transactionId;
    } catch (error) {
      console.error('Error creating B2B transaction:', error);
      throw error;
    }
  }

  async confirmSent(transactionId: string, evidence: any): Promise<any> {
    try {
      await this.initialize();

      // First check if transaction exists in consensus chaincode
      let tx: ConsensusTransaction | null = null;
      
      try {
        const result = await this.transactionHandler.evaluateTransaction(
          this.consensusContract!,
          'GetTransaction',
          transactionId
        );
        console.log('GetTransaction result:', JSON.stringify(result));
        
        if (!result.success) {
          throw new Error('Failed to get transaction: ' + JSON.stringify(result.error));
        }
        
        tx = result.result as ConsensusTransaction;
        console.log('Found transaction in blockchain:', tx);
      } catch (error) {
        console.log('Transaction not found in consensus, error:', error);
        console.log('Will check if it exists with GetAllTransactions...');
        
        // Try to get all transactions to debug
        try {
          const allTxResult = await this.transactionHandler.evaluateTransaction(
            this.consensusContract!,
            'GetAllTransactions'
          );
          const allTx = allTxResult.result as ConsensusTransaction[];
          console.log(`Total transactions in blockchain: ${allTx?.length || 0}`);
          const matchingTx = allTx?.find((t: ConsensusTransaction) => t.id === transactionId);
          if (matchingTx) {
            console.log('Transaction found in GetAllTransactions:', matchingTx);
            tx = matchingTx;
          }
        } catch (debugError) {
          console.error('Could not get all transactions for debugging:', debugError);
        }
      }

      // If transaction doesn't exist, it's an error
      // All transactions must be created before confirming
      if (!tx) {
        console.error(`Transaction ${transactionId} not found`);
        throw new Error(`Transaction ${transactionId} not found`);
      }

      // Now confirm sent
      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'ConfirmSent',
        {
          arguments: [transactionId, this.organization]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to confirm sent');
      }

      // Note: No database caching - blockchain is the only source of truth

      return {
        success: true,
        transactionId,
        status: 'SENT',
        timestamp: new Date().toISOString(),
        evidence,
        blockNumber: result.blockNumber?.toString()
      };
    } catch (error) {
      console.error('Error confirming sent:', error);
      throw error;
    }
  }

  async confirmReceived(transactionId: string, evidence: any): Promise<any> {
    try {
      await this.initialize();

      // Check if transaction exists
      const txResult = await this.transactionHandler.evaluateTransaction(
        this.consensusContract!,
        'GetTransaction',
        transactionId
      );

      if (!txResult.result) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      // Confirm received
      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'ConfirmReceived',
        {
          arguments: [transactionId, this.organization]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to confirm received');
      }

      // Get updated transaction state
      const updatedTxResult = await this.transactionHandler.evaluateTransaction(
        this.consensusContract!,
        'GetTransaction',
        transactionId
      );

      const updatedTx = updatedTxResult.result as ConsensusTransaction;

      // Note: No database caching - blockchain is the only source of truth

      // If validated, update trust scores have already been handled by chaincode
      
      return {
        success: true,
        transactionId,
        status: updatedTx.state,
        timestamp: new Date().toISOString(),
        evidence,
        blockNumber: result.blockNumber?.toString(),
        validated: updatedTx.state === 'VALIDATED'
      };
    } catch (error) {
      console.error('Error confirming received:', error);
      throw error;
    }
  }

  async initiateDispute(transactionId: string, reason: string, evidence: any, requestedReturnQuantity: number = 0): Promise<any> {
    try {
      await this.initialize();

      // Check if transaction exists in blockchain
      let tx: ConsensusTransaction | null = null;
      
      try {
        const result = await this.transactionHandler.evaluateTransaction(
          this.consensusContract!,
          'GetTransaction',
          transactionId
        );
        tx = result.result as ConsensusTransaction;
        console.log('Found transaction in blockchain:', {
          id: tx.id,
          sender: tx.sender,
          receiver: tx.receiver,
          state: tx.state,
          quantity: tx.quantity,
          metadata: tx.metadata
        });
      } catch (error) {
        console.error('Transaction not found in consensus blockchain:', transactionId);
        throw new Error(`Transaction ${transactionId} not found. Please ensure the transaction exists before disputing.`);
      }

      // Transaction must exist to dispute it
      if (!tx) {
        throw new Error(`Transaction ${transactionId} not found in blockchain`);
      }

      const disputeId = `DISPUTE-${transactionId}-${Date.now()}`;

      // Raise dispute in chaincode
      // Use the provided requestedReturnQuantity or default to transaction quantity from metadata
      const txQuantity = tx.quantity || (tx.metadata?.quantity ? parseFloat(tx.metadata.quantity) : 0);
      const returnQty = requestedReturnQuantity || txQuantity || 0;
      
      // Map organization to MSP ID for chaincode
      const mspIdMap: Record<string, string> = {
        'luxebags': 'LuxeBagsMSP',
        'italianleather': 'ItalianLeatherMSP',
        'craftworkshop': 'CraftWorkshopMSP',
        'luxuryretail': 'LuxuryRetailMSP'
      };
      const initiatorMspId = mspIdMap[this.organization] || `${this.organization.charAt(0).toUpperCase() + this.organization.slice(1)}MSP`;
      
      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'RaiseDispute',
        {
          arguments: [transactionId, initiatorMspId, reason, returnQty.toString()]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to raise dispute');
      }

      // Submit evidence if provided
      if (evidence && evidence.description) {
        const evidenceHash = crypto.createHash('sha256')
          .update(JSON.stringify(evidence))
          .digest('hex');

        await this.transactionHandler.submitTransaction(
          this.consensusContract!,
          'SubmitEvidence',
          {
            arguments: [
              transactionId,
              evidence.type || 'DISPUTE_EVIDENCE',
              this.organization,
              evidenceHash
            ]
          }
        );
      }

      // For material transfers, mark them as disputed in supply chain
      if (transactionId.startsWith('MAT-TRANSFER-')) {
        try {
          await this.transactionHandler.submitTransaction(
            this.supplyContract!,
            'SupplyChainContract:UpdateTransferStatus',
            {
              arguments: [transactionId, 'DISPUTED']
            }
          );
          console.log('Material transfer marked as disputed in supply chain');
        } catch (e) {
          console.log('Could not update transfer status in supply chain:', e);
          // This is not critical, continue
        }
      }

      // Note: No database caching - blockchain is the only source of truth
      // Notifications could be sent via external service (email, SMS, etc.)

      return {
        success: true,
        disputeId,
        transactionId,
        reason,
        evidence,
        status: 'DISPUTED',
        timestamp: new Date().toISOString(),
        blockNumber: result.blockNumber?.toString()
      };
    } catch (error) {
      console.error('Error initiating dispute:', error);
      throw error;
    }
  }

  async getPendingTransactions(organization: string): Promise<any[]> {
    try {
      await this.initialize();

      // Query all transactions and filter for pending ones
      const queryString = JSON.stringify({
        selector: {
          $or: [
            { sender: organization, state: 'INITIATED' },
            { receiver: organization, state: 'SENT' }
          ]
        }
      });

      const result = await this.transactionHandler.evaluateTransaction(
        this.consensusContract!,
        'QueryTransactions',
        queryString
      );

      return result.result || [];
    } catch (error) {
      console.error('Error getting pending transactions:', error);
      return [];
    }
  }

  async getDisputedTransactions(organization: string): Promise<any[]> {
    try {
      await this.initialize();

      console.log(`Fetching disputed transactions for ${organization}...`);
      
      // Get all disputed transactions (only returns state=DISPUTED)
      const disputedResult = await this.transactionHandler.evaluateTransaction(
        this.consensusContract!,
        'GetDisputedTransactions'
      );

      console.log('GetDisputedTransactions result:', disputedResult);
      
      // Also get all transactions to find resolved disputes
      // We need to check metadata for disputeStatus = RESOLVED_*
      const allTxResult = await this.transactionHandler.evaluateTransaction(
        this.consensusContract!,
        'GetAllTransactions'
      );
      
      console.log('Checking all transactions for resolved disputes');

      // Combine disputed and resolved disputes
      let allDisputed: ConsensusTransaction[] = [];
      
      // Add currently disputed transactions
      if (disputedResult.result) {
        allDisputed = [...(disputedResult.result as ConsensusTransaction[])];
      }
      
      // Add resolved disputes from all transactions
      if (allTxResult.result) {
        const allTransactions = allTxResult.result as ConsensusTransaction[];
        const resolvedDisputes = allTransactions.filter(tx => 
          tx.metadata?.disputeStatus === 'RESOLVED_ACCEPTED' || 
          tx.metadata?.disputeStatus === 'RESOLVED_ARBITRATED'
        );
        allDisputed = [...allDisputed, ...resolvedDisputes];
      }
      
      if (allDisputed.length === 0) {
        console.log('No disputed or resolved transactions found');
        return [];
      }
      
      console.log(`Found ${allDisputed.length} total disputed transactions`);
      
      // Log metadata to debug dispute ID
      if (allDisputed.length > 0) {
        console.log('First disputed transaction metadata:', JSON.stringify(allDisputed[0].metadata, null, 2));
      }
      
      // Map organization to MSP ID for filtering
      const mspIdMap: Record<string, string> = {
        'luxebags': 'LuxeBagsMSP',
        'italianleather': 'ItalianLeatherMSP',
        'craftworkshop': 'CraftWorkshopMSP',
        'luxuryretail': 'LuxuryRetailMSP'
      };
      const orgMspId = mspIdMap[organization] || `${organization.charAt(0).toUpperCase() + organization.slice(1)}MSP`;
      
      console.log(`Filtering for organization ${organization} (MSP ID: ${orgMspId})`);
      
      // Filter for disputed transactions involving this organization
      const disputed = allDisputed.filter((tx: ConsensusTransaction) => 
        tx.sender === orgMspId || tx.receiver === orgMspId
      );
      
      console.log(`Found ${disputed.length} disputed transactions for ${organization}`);

      // Map MSP IDs back to organization names for frontend
      const mspToOrg: Record<string, string> = {
        'LuxeBagsMSP': 'luxebags',
        'ItalianLeatherMSP': 'italianleather',
        'CraftWorkshopMSP': 'craftworkshop',
        'LuxuryRetailMSP': 'luxuryretail'
      };
      
      // Map to frontend format with all required fields
      return disputed.map(tx => {
        // Get the actual dispute initiator from metadata
        const disputeInitiator = tx.metadata?.disputeInitiator || tx.sender;
        const disputeRespondent = disputeInitiator === tx.sender ? tx.receiver : tx.sender;
        
        // Check if dispute is resolved
        const isResolved = tx.metadata?.disputeStatus === 'RESOLVED_ACCEPTED' || 
                          tx.metadata?.disputeStatus === 'RESOLVED_ARBITRATED';
        
        // Build resolution object if resolved
        let resolution = undefined;
        if (isResolved) {
          // For RESOLVED_ACCEPTED, the dispute initiator is the winner (other party accepted fault)
          // For RESOLVED_ARBITRATED, use the stored winner
          const winner = tx.metadata?.winner || (tx.metadata?.disputeStatus === 'RESOLVED_ACCEPTED' ? disputeInitiator : tx.sender);
          const decision = winner === tx.sender ? 'IN_FAVOR_SENDER' : 'IN_FAVOR_RECEIVER';
          
          resolution = {
            disputeId: tx.metadata?.disputeID || tx.metadata?.resolutionID, // Add the actual dispute ID
            decision: decision,
            requiredAction: tx.metadata?.requiredAction || 'RETURN',
            actionQuantity: parseInt(tx.metadata?.actionQuantity || tx.metadata?.requestedReturnQuantity || '0'),
            resolvedBy: tx.metadata?.resolvedBy || 'system',
            resolvedAt: tx.metadata?.resolutionTimestamp || tx.timestamp,
            notes: tx.metadata?.resolutionNotes || 'Dispute accepted by respondent',
            actionCompleted: tx.metadata?.actionCompleted === 'true',
            followUpTxId: tx.metadata?.followUpTxId
          };
        }
        
        return {
          id: tx.id,
          transactionId: tx.id,
          initiator: mspToOrg[disputeInitiator] || disputeInitiator,  // The one who raised the dispute
          respondent: mspToOrg[disputeRespondent] || disputeRespondent,  // The other party
          sender: mspToOrg[tx.sender] || tx.sender,  // Original transaction sender
          receiver: mspToOrg[tx.receiver] || tx.receiver,  // Original transaction receiver
          type: tx.metadata?.disputeType || tx.disputeReason || 'NOT_RECEIVED',
          reason: tx.disputeReason || tx.metadata?.disputeType || 'No reason provided',
          status: isResolved ? 'RESOLVED' : (tx.state === 'DISPUTED' ? 'OPEN' : 'INVESTIGATING'),
          itemType: tx.itemType,
          itemId: tx.itemId,
          state: tx.state,
          disputeReason: tx.disputeReason,
          timestamp: tx.timestamp,
          createdAt: tx.timestamp,
          updatedAt: tx.timestamp,
          role: tx.sender === organization ? 'sender' : 'receiver',
          partner: tx.sender === organization ? tx.receiver : tx.sender,
          resolution: resolution,  // Add resolution object
          transactionDetails: {
            itemDescription: `${tx.itemType}: ${tx.itemId}`,
            value: parseInt(tx.metadata?.quantity || '1000'),
            sender: tx.sender,
            receiver: tx.receiver,
            timestamp: tx.timestamp,
            itemType: tx.itemType || 'MATERIAL',
            itemId: tx.itemId,
            quantity: parseInt(tx.metadata?.quantity || tx.metadata?.requestedReturnQuantity || '0')
          },
          evidence: []  // Evidence would need to be fetched separately
        };
      });
    } catch (error) {
      console.error('Error getting disputed transactions:', error);
      return [];
    }
  }

  async submitEvidence(transactionId: string, evidenceType: string, submittedBy: string, hash: string): Promise<any> {
    try {
      await this.initialize();

      // Submit evidence to chaincode
      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'SubmitEvidence',
        {
          arguments: [
            transactionId,
            evidenceType,
            submittedBy,
            hash
          ]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to submit evidence');
      }

      return {
        success: true,
        transactionId,
        evidenceType,
        submittedBy,
        hash,
        timestamp: new Date().toISOString(),
        blockNumber: result.blockNumber?.toString()
      };
    } catch (error) {
      console.error('Error submitting evidence:', error);
      throw error;
    }
  }

  async resolveDispute(transactionId: string, resolver: string, decision: string, notes: string, compensationAmount: number): Promise<any> {
    try {
      await this.initialize();

      // Call ResolveDispute in chaincode
      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'ResolveDispute',
        {
          arguments: [
            transactionId,
            resolver,
            decision,
            notes,
            compensationAmount.toString()
          ]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to resolve dispute');
      }

      // For material transfers, update status back to verified/completed
      if (transactionId.startsWith('MAT-TRANSFER-')) {
        try {
          await this.transactionHandler.submitTransaction(
            this.supplyContract!,
            'SupplyChainContract:UpdateTransferStatus',
            {
              arguments: [transactionId, 'RESOLVED']
            }
          );
          console.log('Material transfer marked as resolved in supply chain');
        } catch (e) {
          console.log('Could not update transfer status in supply chain:', e);
        }
      }

      return {
        success: true,
        transactionId,
        decision,
        resolver,
        compensationAmount,
        timestamp: new Date().toISOString(),
        blockNumber: result.blockNumber?.toString()
      };
    } catch (error) {
      console.error('Error resolving dispute:', error);
      throw error;
    }
  }

  async getTrustScore(partyId: string): Promise<TrustScore | null> {
    try {
      await this.initialize();

      const result = await this.transactionHandler.evaluateTransaction(
        this.consensusContract!,
        'GetTrustScore',
        partyId
      );

      return result.result as TrustScore;
    } catch (error) {
      console.error('Error getting trust score:', error);
      return null;
    }
  }

  getMetrics(): any {
    // This would query actual metrics from blockchain
    return {
      totalTransactions: 0,
      pendingTransactions: 0,
      validatedTransactions: 0,
      disputedTransactions: 0
    };
  }

  async cleanup(): Promise<void> {
    if (this.gateway) {
      this.gateway.close();
      this.initialized = false;
    }
  }

  async updateTrustFromEvent(partyID: string, event: string, positive?: boolean): Promise<any> {
    try {
      await this.initialize();

      const eventData = JSON.stringify({
        partyID,
        event,
        positive: positive || false
      });

      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'UpdateTrustFromEvent',
        {
          arguments: [eventData]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to update trust from event');
      }

      return {
        success: true,
        message: 'Trust score updated based on event',
        partyID,
        event,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error updating trust from event:', error);
      throw error;
    }
  }

  async validateTransaction(transactionId: string): Promise<any> {
    try {
      await this.initialize();

      const result = await this.transactionHandler.submitTransaction(
        this.consensusContract!,
        'ValidateTransaction',
        {
          arguments: [transactionId]
        }
      );

      if (!result.success) {
        throw result.error || new Error('Failed to validate transaction');
      }

      return {
        success: true,
        transactionId,
        message: 'Transaction validated for timeout',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error validating transaction:', error);
      throw error;
    }
  }
}