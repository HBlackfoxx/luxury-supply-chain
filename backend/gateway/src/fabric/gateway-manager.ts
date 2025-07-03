// Gateway Connection Manager for Hyperledger Fabric
// Manages connections to the blockchain network

import { connect, Gateway, GatewayOptions, Network, Contract, Identity, Signer, signers } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import * as crypto from 'crypto';
import { SDKConfigManager } from '../config/sdk-config';
import { WalletManager } from './wallet-manager';

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
  private walletManager: WalletManager;
  private gateways: Map<string, Gateway> = new Map();
  private grpcClients: Map<string, grpc.Client> = new Map();

  constructor(configManager: SDKConfigManager, walletManager: WalletManager) {
    this.configManager = configManager;
    this.walletManager = walletManager;
  }

  public async connect(options: ConnectionOptions): Promise<Gateway> {
    const connectionKey = `${options.orgId}-${options.userId}`;
    
    // Return existing connection if available
    if (this.gateways.has(connectionKey)) {
      return this.gateways.get(connectionKey)!;
    }

    // Get identity from wallet
    const identity = await this.walletManager.getIdentity(options.orgId, options.userId);
    if (!identity) {
      throw new Error(`Identity not found: ${options.userId}`);
    }

    // Create gRPC client
    const client = await this.createGrpcClient(options.orgId);
    
    // Create identity and signer
    const credentials = identity.credentials;
    const mspId = identity.mspId;
    const gatewayIdentity: Identity = { mspId, credentials };
    const signer = signers.newPrivateKeySigner(crypto.createPrivateKey(credentials.privateKey));

    // Connect to gateway
    const gateway = connect({
      client,
      identity: gatewayIdentity,
      signer,
      evaluateOptions: () => {
        return {
          deadline: Date.now() + 5000, // 5 seconds timeout
        };
      },
      endorseOptions: () => {
        return {
          deadline: Date.now() + 15000, // 15 seconds timeout
        };
      },
      submitOptions: () => {
        return {
          deadline: Date.now() + 30000, // 30 seconds timeout
        };
      },
      commitStatusOptions: () => {
        return {
          deadline: Date.now() + 60000, // 60 seconds timeout
        };
      },
    });

    this.gateways.set(connectionKey, gateway);
    this.grpcClients.set(connectionKey, client);

    return gateway;
  }

  private async createGrpcClient(orgId: string): Promise<grpc.Client> {
    const org = this.configManager.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    // Get peer endpoint
    const peer = org.peers[0]; // Use first peer as gateway
    const peerEndpoint = `localhost:${peer.port}`;
    
    // Get TLS certificate
    const tlsCertPath = `${this.configManager.getCryptoPath(orgId)}/peers/peer0.${orgId}.${this.configManager.getBrandConfig().brand.id}.luxury/tls/ca.crt`;
    const tlsRootCert = await this.getTlsCertificate(tlsCertPath);

    // Create gRPC credentials
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    
    // Create gRPC client
    return new grpc.Client(peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': `peer0.${orgId}.${this.configManager.getBrandConfig().brand.id}.luxury`,
    });
  }

  private async getTlsCertificate(certPath: string): Promise<Buffer> {
    const fs = await import('fs');
    return fs.readFileSync(certPath);
  }

  public async getNetwork(
    gateway: Gateway,
    channelName?: string
  ): Promise<Network> {
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
  }

  public isConnected(orgId: string, userId: string): boolean {
    const connectionKey = `${orgId}-${userId}`;
    return this.gateways.has(connectionKey);
  }

  public getActiveConnections(): string[] {
    return Array.from(this.gateways.keys());
  }
}