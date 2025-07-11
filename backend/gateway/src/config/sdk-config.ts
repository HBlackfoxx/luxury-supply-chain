// backend/gateway/src/config/sdk-config.ts
// SDK Configuration Manager for Hyperledger Fabric
// Updated for fabric-gateway 1.x API

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Identity } from '@hyperledger/fabric-gateway';

export interface BrandConfig {
  brand: {
    id: string;
    name: string;
    description: string;
  };
  network: {
    organizations: Organization[];
    channels: Channel[];
    orderers?: Orderer[];
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

export interface Orderer {
  name: string;
  port: number;
  operationsPort: number;
  organization: string;
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

export interface CryptoMaterial {
  credentials: {
    certificate: string;
    privateKey: string;
  };
  mspId: string;
}

export class SDKConfigManager {
  private brandConfig!: BrandConfig;
  private configPath: string;
  private cryptoPath: string;
  private identityPath: string;

  constructor(brandId: string) {
    this.configPath = path.join(__dirname, '../../../../config/brands/example-brand');
    this.cryptoPath = path.join(__dirname, '../../network/organizations');
    this.identityPath = path.join(__dirname, '../../identities', brandId);
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

  public getPeerEndpoint(orgId: string, peerIndex: number = 0): string {
    const org = this.getOrganization(orgId);
    if (!org || !org.peers[peerIndex]) {
      throw new Error(`Peer not found for organization: ${orgId}`);
    }
    return `localhost:${org.peers[peerIndex].port}`;
  }

  public getPeerHostname(orgId: string, peerIndex: number = 0): string {
    const org = this.getOrganization(orgId);
    if (!org || !org.peers[peerIndex]) {
      throw new Error(`Peer not found for organization: ${orgId}`);
    }
    const peer = org.peers[peerIndex];
    return `${peer.name}.${orgId}.${this.brandConfig.brand.id}.luxury`;
  }

  public getMspId(orgId: string): string {
    const org = this.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }
    return org.mspId;
  }

  public getCryptoPath(orgId: string, type: 'peer' | 'orderer' = 'peer'): string {
    const orgType = type === 'peer' ? 'peerOrganizations' : 'ordererOrganizations';
    const domain = `${orgId}.${this.brandConfig.brand.id}.luxury`;
    return path.join(this.cryptoPath, orgType, domain);
  }

  public getIdentityPath(orgId: string): string {
    return path.join(this.identityPath, orgId);
  }

  // Load crypto materials for a user
  public loadIdentity(orgId: string, userId: string): CryptoMaterial {
    const cryptoPath = this.getCryptoPath(orgId);
    const userPath = path.join(cryptoPath, 'users', `${userId}@${orgId}.${this.brandConfig.brand.id}.luxury`);
    
    const certPath = path.join(userPath, 'msp', 'signcerts', `${userId}@${orgId}.${this.brandConfig.brand.id}.luxury-cert.pem`);
    const keyPath = path.join(userPath, 'msp', 'keystore');
    
    if (!fs.existsSync(certPath)) {
      throw new Error(`Certificate not found for user ${userId}@${orgId}`);
    }
    
    // Find the private key
    const keyFiles = fs.readdirSync(keyPath);
    const privateKeyFile = keyFiles.find(f => f.endsWith('_sk'));
    
    if (!privateKeyFile) {
      throw new Error(`Private key not found for user ${userId}@${orgId}`);
    }
    
    const certificate = fs.readFileSync(certPath, 'utf8');
    const privateKey = fs.readFileSync(path.join(keyPath, privateKeyFile), 'utf8');
    
    return {
      credentials: {
        certificate,
        privateKey
      },
      mspId: this.getMspId(orgId)
    };
  }

  // Load admin identity
  public loadAdminIdentity(orgId: string): CryptoMaterial {
    return this.loadIdentity(orgId, 'Admin');
  }

  // Get TLS certificate for peer
  public getTlsCertificate(orgId: string, peerIndex: number = 0): Buffer {
    const org = this.getOrganization(orgId);
    if (!org || !org.peers[peerIndex]) {
      throw new Error(`Peer not found for organization: ${orgId}`);
    }
    
    const peer = org.peers[peerIndex];
    const tlsCertPath = path.join(
      this.getCryptoPath(orgId),
      'peers',
      `${peer.name}.${orgId}.${this.brandConfig.brand.id}.luxury`,
      'tls',
      'ca.crt'
    );
    
    if (!fs.existsSync(tlsCertPath)) {
      throw new Error(`TLS certificate not found: ${tlsCertPath}`);
    }
    
    return fs.readFileSync(tlsCertPath);
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

  // Create a Fabric Identity object for the gateway
  public createIdentity(orgId: string, userId: string): Identity {
    const cryptoMaterial = this.loadIdentity(orgId, userId);
    
    // Convert certificate to Uint8Array
    const encoder = new TextEncoder();
    const certBytes = encoder.encode(cryptoMaterial.credentials.certificate);
    
    return {
      credentials: certBytes,
      mspId: cryptoMaterial.mspId,
    };
  }

  // Get all peer endpoints for an organization
  public getAllPeerEndpoints(orgId: string): string[] {
    const org = this.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }
    
    return org.peers.map(peer => `localhost:${peer.port}`);
  }

  // Get orderer endpoints
  public getOrdererEndpoints(): string[] {
    if (!this.brandConfig.network.orderers) {
      // Default orderer configuration
      return ['localhost:7050', 'localhost:8050', 'localhost:9050'];
    }
    
    return this.brandConfig.network.orderers.map(orderer => `localhost:${orderer.port}`);
  }
}