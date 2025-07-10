// backend/gateway/src/fabric/gateway-manager.ts
// Gateway Connection Manager for Hyperledger Fabric
// Updated for fabric-gateway 1.x API

import { connect, Gateway, Network, Contract, Identity, Signer } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { SDKConfigManager } from '../config/sdk-config';
import { IdentityManager } from './identity-manager';

export interface ConnectionOptions {
  orgId: string;
  userId: string;
  channelName?: string;
  discovery?: boolean;
  asLocalhost?: boolean;
  connectionTimeout?: number;
}

export class GatewayManager {
  private configManager: SDKConfigManager;
  private identityManager: IdentityManager;
  private gateways: Map<string, Gateway> = new Map();
  private grpcClients: Map<string, grpc.Client> = new Map();

  constructor(configManager: SDKConfigManager, identityManager: IdentityManager) {
    this.configManager = configManager;
    this.identityManager = identityManager;
  }

  public async connect(options: ConnectionOptions): Promise<Gateway> {
    const connectionKey = `${options.orgId}-${options.userId}`;
    
    // Return existing connection if available
    if (this.gateways.has(connectionKey)) {
      return this.gateways.get(connectionKey)!;
    }

    // Get identity and signer
    const identityData = await this.identityManager.getIdentity(options.orgId, options.userId);
    if (!identityData) {
      throw new Error(`Identity not found: ${options.userId}@${options.orgId}`);
    }

    // Create gRPC client
    const client = await this.createGrpcClient(options.orgId);
    
    // Connect to gateway with new API
    const gateway = connect({
      client,
      identity: identityData.identity,
      signer: identityData.signer,
      // Default timeouts
      evaluateOptions: () => {
        return {
          deadline: Date.now() + 5000 // 5 seconds
        };
      },
      endorseOptions: () => {
        return {
          deadline: Date.now() + 15000 // 15 seconds
        };
      },
      submitOptions: () => {
        return {
          deadline: Date.now() + 30000 // 30 seconds
        };
      },
      commitStatusOptions: () => {
        return {
          deadline: Date.now() + 60000 // 60 seconds
        };
      }
    });

    this.gateways.set(connectionKey, gateway);
    this.grpcClients.set(connectionKey, client);

    console.log(`Gateway connected for ${options.userId}@${options.orgId}`);
    return gateway;
  }

  private async createGrpcClient(orgId: string): Promise<grpc.Client> {
    const org = this.configManager.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    // Get peer endpoint
    const peerEndpoint = this.configManager.getPeerEndpoint(orgId, 0);
    const peerHostname = this.configManager.getPeerHostname(orgId, 0);
    
    // Get TLS certificate
    const tlsRootCert = this.configManager.getTlsCertificate(orgId, 0);

    // Create gRPC credentials
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    
    // Create gRPC client with options
    const grpcOptions = {
      'grpc.ssl_target_name_override': peerHostname,
      'grpc.default_authority': peerHostname,
      'grpc.keepalive_time_ms': 120000,
      'grpc.http2.min_time_between_pings_ms': 120000,
      'grpc.keepalive_timeout_ms': 20000,
      'grpc.http2.max_pings_without_data': 0,
      'grpc.keepalive_permit_without_calls': 1
    };
    
    return new grpc.Client(peerEndpoint, tlsCredentials, grpcOptions);
  }

  public async getNetwork(gateway: Gateway, channelName?: string): Promise<Network> {
    const channel = channelName || this.configManager.getChannelName();
    return gateway.getNetwork(channel);
  }

  public async getContract(
    network: Network,
    chaincodeName: string,
    contractName?: string
  ): Promise<Contract> {
    return contractName
      ? network.getContract(chaincodeName, contractName)
      : network.getContract(chaincodeName);
  }

  public async disconnect(orgId: string, userId: string): Promise<void> {
    const connectionKey = `${orgId}-${userId}`;
    
    const gateway = this.gateways.get(connectionKey);
    if (gateway) {
      gateway.close();
      this.gateways.delete(connectionKey);
    }

    const client = this.grpcClients.get(connectionKey);
    if (client) {
      client.close();
      this.grpcClients.delete(connectionKey);
    }
    
    console.log(`Gateway disconnected for ${userId}@${orgId}`);
  }

  public async disconnectAll(): Promise<void> {
    for (const [key, gateway] of this.gateways) {
      gateway.close();
    }
    this.gateways.clear();

    for (const [key, client] of this.grpcClients) {
      client.close();
    }
    this.grpcClients.clear();
    
    console.log('All gateways disconnected');
  }

  public isConnected(orgId: string, userId: string): boolean {
    const connectionKey = `${orgId}-${userId}`;
    return this.gateways.has(connectionKey);
  }

  public getActiveConnections(): string[] {
    return Array.from(this.gateways.keys());
  }

  // Helper method to get a connected gateway
  public async getGateway(orgId: string, userId: string): Promise<Gateway> {
    const connectionKey = `${orgId}-${userId}`;
    let gateway = this.gateways.get(connectionKey);
    
    if (!gateway) {
      gateway = await this.connect({ orgId, userId });
    }
    
    return gateway;
  }

  // Helper method to quickly get a contract
  public async getContractFromGateway(
    orgId: string,
    userId: string,
    channelName: string,
    chaincodeName: string,
    contractName?: string
  ): Promise<Contract> {
    const gateway = await this.getGateway(orgId, userId);
    const network = await this.getNetwork(gateway, channelName);
    return await this.getContract(network, chaincodeName, contractName);
  }
}