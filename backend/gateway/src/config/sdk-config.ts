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
    // Use environment variables for paths with fallbacks
    this.configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../../../config/brands/example-brand');
    this.cryptoPath = process.env.FABRIC_CRYPTO_PATH || '/app/fabric/organizations' || path.join(__dirname, '../../network/organizations');
    this.identityPath = process.env.IDENTITY_PATH || path.join(__dirname, '../../identities', brandId);
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
    // Use peer hostname when running in Docker, otherwise localhost
    const hostname = process.env.FABRIC_PEER_HOST || 
                    (process.env.NODE_ENV === 'production' ? 
                      `peer${peerIndex}.${orgId}.${this.brandConfig.brand.id}.luxury` : 
                      'localhost');
    return `${hostname}:${org.peers[peerIndex].port}`;
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
    const privateKeyFile = keyFiles.find((f: string) => f.endsWith('_sk'));
    
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

  // Get peer TLS certificate
  private getPeerTLSCertPem(orgId: string): string {
    const certPath = path.join(
      this.cryptoPath,
      'peerOrganizations',
      `${orgId}.luxe-bags.luxury`,
      'peers',
      `peer0.${orgId}.luxe-bags.luxury`,
      'tls',
      'ca.crt'
    );
    
    if (fs.existsSync(certPath)) {
      return fs.readFileSync(certPath, 'utf8');
    }
    
    // Return a placeholder for testing
    return '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
  }

  // Get organization CA certificate
  private getOrgCACertPem(orgId: string): string {
    const certPath = path.join(
      this.cryptoPath,
      'peerOrganizations',
      `${orgId}.luxe-bags.luxury`,
      'ca',
      `ca.${orgId}.luxe-bags.luxury-cert.pem`
    );
    
    if (fs.existsSync(certPath)) {
      return fs.readFileSync(certPath, 'utf8');
    }
    
    // Return a placeholder for testing
    return '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
  }

  // Get orderer TLS certificate
  private getOrdererTLSCertPem(ordererId: string): string {
    const certPath = path.join(
      this.cryptoPath,
      'ordererOrganizations',
      'orderer.luxe-bags.luxury',
      'orderers',
      `${ordererId}.orderer.luxe-bags.luxury`,
      'tls',
      'ca.crt'
    );
    
    if (fs.existsSync(certPath)) {
      return fs.readFileSync(certPath, 'utf8');
    }
    
    // For default orderer
    const defaultPath = path.join(
      this.cryptoPath,
      'ordererOrganizations',
      'orderer.luxe-bags.luxury',
      'orderers',
      'orderer1.orderer.luxe-bags.luxury',
      'tls',
      'ca.crt'
    );
    
    if (fs.existsSync(defaultPath)) {
      return fs.readFileSync(defaultPath, 'utf8');
    }
    
    // Return a placeholder for testing
    return '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----';
  }

  // Get connection profile for Fabric SDK Gateway
  public getConnectionProfile(): any {
    const organizations: any = {};
    const peers: any = {};
    const certificateAuthorities: any = {};

    // Build organizations section
    this.brandConfig.network.organizations.forEach(org => {
      organizations[org.id] = {
        mspid: org.mspId,
        peers: org.peers.map(peer => `${peer.name}.${org.id}.luxe-bags.luxury`),
        certificateAuthorities: [`ca.${org.id}.luxe-bags.luxury`]
      };

      // Build peers section
      org.peers.forEach(peer => {
        const peerName = `${peer.name}.${org.id}.luxe-bags.luxury`;
        peers[peerName] = {
          url: `grpcs://localhost:${peer.port}`,
          tlsCACerts: {
            pem: this.getPeerTLSCertPem(org.id)
          },
          grpcOptions: {
            'ssl-target-name-override': peerName,
            hostnameOverride: peerName
          }
        };
      });

      // Build CAs section
      const caName = `ca.${org.id}.luxe-bags.luxury`;
      certificateAuthorities[caName] = {
        url: `https://localhost:${7054 + this.brandConfig.network.organizations.indexOf(org) * 1000}`,
        caName: `ca-${org.id}`,
        tlsCACerts: {
          pem: [this.getOrgCACertPem(org.id)]
        },
        httpOptions: {
          verify: false
        }
      };
    });

    // Build orderers section
    const orderers: any = {};
    if (this.brandConfig.network.orderers) {
      this.brandConfig.network.orderers.forEach((orderer, index) => {
        const ordererName = `${orderer.name}.orderer.luxe-bags.luxury`;
        orderers[ordererName] = {
          url: `grpcs://localhost:${orderer.port}`,
          tlsCACerts: {
            pem: this.getOrdererTLSCertPem(orderer.name)
          },
          grpcOptions: {
            'ssl-target-name-override': ordererName,
            hostnameOverride: ordererName
          }
        };
      });
    } else {
      // Default orderer configuration
      orderers['orderer1.orderer.luxe-bags.luxury'] = {
        url: 'grpcs://localhost:7050',
        tlsCACerts: {
          pem: this.getOrdererTLSCertPem('orderer1')
        },
        grpcOptions: {
          'ssl-target-name-override': 'orderer1.orderer.luxe-bags.luxury',
          hostnameOverride: 'orderer1.orderer.luxe-bags.luxury'
        }
      };
    }

    // Build channels section
    const channels: any = {};
    this.brandConfig.network.channels.forEach(channel => {
      channels[channel.name] = {
        orderers: Object.keys(orderers),
        peers: {}
      };

      // Add all peers from participating organizations
      channel.application.organizations.forEach(orgId => {
        const org = this.brandConfig.network.organizations.find(o => o.id === orgId);
        if (org) {
          org.peers.forEach(peer => {
            const peerName = `${peer.name}.${org.id}.luxe-bags.luxury`;
            channels[channel.name].peers[peerName] = {
              endorsingPeer: true,
              chaincodeQuery: true,
              ledgerQuery: true,
              eventSource: true
            };
          });
        }
      });
    });

    return {
      name: 'luxury-supply-chain-network',
      version: '1.0.0',
      client: {
        organization: this.brandConfig.brand.id,
        connection: {
          timeout: {
            peer: {
              endorser: '300'
            },
            orderer: '300'
          }
        }
      },
      organizations,
      peers,
      orderers,
      certificateAuthorities,
      channels
    };
  }
}