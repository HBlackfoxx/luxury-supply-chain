// backend/consensus/setup-consensus.ts
// Simplified consensus setup - provides gateway and transaction handler

import { SDKConfigManager } from '../gateway/src/config/sdk-config';
import { IdentityManager } from '../gateway/src/fabric/identity-manager';
import { GatewayManager } from '../gateway/src/fabric/gateway-manager';
import { TransactionHandler } from '../gateway/src/fabric/transaction-handler';
import { EventListenerManager } from '../gateway/src/fabric/event-listener';
import { FabricMonitor } from '../gateway/src/monitoring/fabric-monitor';

export class ConsensusSystem {
  private configManager: SDKConfigManager;
  private identityManager: IdentityManager;
  private gatewayManager: GatewayManager;
  private transactionHandler: TransactionHandler;
  private eventListener: EventListenerManager;
  private monitor: FabricMonitor;

  constructor(brandId: string) {
    // Initialize Fabric components
    this.configManager = new SDKConfigManager(brandId);
    this.identityManager = new IdentityManager(this.configManager);
    this.gatewayManager = new GatewayManager(this.configManager, this.identityManager);
    this.transactionHandler = new TransactionHandler();
    this.eventListener = new EventListenerManager();
    this.monitor = new FabricMonitor({
      enablePrometheus: false,
      prometheusPort: parseInt(process.env.METRICS_PORT || '9090'),
      logLevel: 'info'
    });
  }

  /**
   * Initialize the consensus system
   */
  public async initialize(orgId: string, userId: string): Promise<void> {
    try {
      console.log(`Initializing consensus for ${orgId}:${userId}`);
      
      // Test connection
      const gateway = await this.gatewayManager.connect({ orgId, userId });
      const network = await this.gatewayManager.getNetwork(gateway);
      
      console.log('Successfully connected to Fabric network');
      
      // Close test connection
      gateway.close();
      
    } catch (error) {
      console.error('Failed to initialize consensus system:', error);
      throw error;
    }
  }

  /**
   * Get health status
   */
  public async getHealth(): Promise<any> {
    return {
      status: 'healthy',
      gatewayReady: !!this.gatewayManager,
      identityReady: !!this.identityManager,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup resources
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down consensus system...');
    // Cleanup if needed
  }

  // Getters for components needed by APIs
  public getGatewayManager(): GatewayManager {
    return this.gatewayManager;
  }

  public getTransactionHandler(): TransactionHandler {
    return this.transactionHandler;
  }

  public getConfigManager(): SDKConfigManager {
    return this.configManager;
  }

  public getIdentityManager(): IdentityManager {
    return this.identityManager;
  }
}