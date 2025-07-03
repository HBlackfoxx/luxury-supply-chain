// SDK Configuration Manager for Hyperledger Fabric
// Handles dynamic configuration loading based on brand settings

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Gateway, GatewayOptions, Wallets, X509Identity } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import * as crypto from 'crypto';

export interface BrandConfig {
  brand: {
    id: string;
    name: string;
    description: string;
  };
  network: {
    organizations: Organization[];
    channels: Channel[];
  };
  consensus: ConsensusConfig;
  security: SecurityConfig;
}

export interface Organization {
  id: string;
  name: string;
  type: string;
  mspId: string;
  peers: Peer[];
}

export interface Peer {
  name: string;
  port: number;
  chaincodePort: number;
  operationsPort: number;
}

export interface Channel {
  name: string;
  consortium: string;
  application: {
    organizations: string[];
  };
}

export interface ConsensusConfig {
  type: string;
  parameters: {
    weights: Record<string, number>;
    minParticipation: number;
    reputation: {
      enabled: boolean;
      initialScore: number;
    };
    aiAdvisory: {
      enabled: boolean;
      confidenceThreshold: number;
    };
  };
}

export interface SecurityConfig {
  tls: {
    enabled: boolean;
    clientAuthRequired: boolean;
  };
  identity: {
    provider: string;
    adminIdentity: string;
  };
}

export class SDKConfigManager {
  private brandConfig: BrandConfig;
  private configPath: string;
  private cryptoPath: string;
  private walletPath: string;

  constructor(brandId: string) {
    this.configPath = path.join(__dirname, '../../../../config/brands', brandId);
    this.cryptoPath = path.join(__dirname, '../../../../network/organizations');
    this.walletPath = path.join(__dirname, '../../wallets', brandId);
    this.loadBrandConfig();
  }

  private loadBrandConfig(): void {
    const configFile = path.join(this.configPath, 'network-config.yaml');
    if (!fs.existsSync(configFile)) {
      throw new Error(`Brand configuration not found: ${configFile}`);
    }

    const configContent = fs.readFileSync(configFile, 'utf8');
    this.brandConfig = yaml.load(configContent) as BrandConfig;
  }

  public getBrandConfig(): BrandConfig {
    return this.brandConfig;
  }

  public getOrganization(orgId: string): Organization | undefined {
    return this.brandConfig.network.organizations.find(org => org.id === orgId);
  }

  public getConnectionProfile(orgId: string): any {
    const profilePath = path.join(this.configPath, `connection-${orgId}.json`);
    if (!fs.existsSync(profilePath)) {
      throw new Error(`Connection profile not found for organization: ${orgId}`);
    }

    const profileContent = fs.readFileSync(profilePath, 'utf8');
    return JSON.parse(profileContent);
  }

  public getCryptoPath(orgId: string, type: 'peer' | 'orderer' = 'peer'): string {
    const orgType = type === 'peer' ? 'peerOrganizations' : 'ordererOrganizations';
    const domain = `${orgId}.${this.brandConfig.brand.id}.luxury`;
    return path.join(this.cryptoPath, orgType, domain);
  }

  public getWalletPath(orgId: string): string {
    return path.join(this.walletPath, orgId);
  }

  public async createWallet(orgId: string): Promise<any> {
    const walletPath = this.getWalletPath(orgId);
    
    // Create wallet directory if it doesn't exist
    if (!fs.existsSync(walletPath)) {
      fs.mkdirSync(walletPath, { recursive: true });
    }

    return await Wallets.newFileSystemWallet(walletPath);
  }

  public getChannelName(): string {
    return this.brandConfig.network.channels[0]?.name || 'luxury-supply-chain';
  }

  public getConsensusConfig(): ConsensusConfig {
    return this.brandConfig.consensus;
  }

  public getSecurityConfig(): SecurityConfig {
    return this.brandConfig.security;
  }
}