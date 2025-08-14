// backend/gateway/src/fabric/identity-manager.ts
// Identity Manager for Hyperledger Fabric
// Manages identities without wallet (fabric-gateway 1.x doesn't have wallet concept)

import { Identity, Signer, signers } from '@hyperledger/fabric-gateway';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SDKConfigManager } from '../config/sdk-config';

// Declare FabricCAServices type to avoid TypeScript errors
declare const FabricCAServices: any;
// Dynamic import to avoid module resolution issues
const loadFabricCA = () => {
  try {
    return require('fabric-ca-client');
  } catch (err) {
    console.warn('Warning: fabric-ca-client not available, CA operations disabled');
    return null;
  }
};
const FabricCAServicesClass = loadFabricCA();

export interface EnrollmentOptions {
  enrollmentID: string;
  enrollmentSecret: string;
  role?: string;
  affiliation?: string;
  attrs?: Array<{ name: string; value: string; ecert?: boolean }>;
}

export interface StoredIdentity {
  certificate: string;
  privateKey: string;
  mspId: string;
}

export class IdentityManager {
  private configManager: SDKConfigManager;
  private caClients: Map<string, any> = new Map();

  constructor(configManager: SDKConfigManager) {
    this.configManager = configManager;
  }

  // Store identity to file system
  private async storeIdentity(orgId: string, userId: string, identity: StoredIdentity): Promise<void> {
    const identityPath = this.configManager.getIdentityPath(orgId);
    const userPath = path.join(identityPath, userId);
    
    // Create directory if it doesn't exist
    fs.mkdirSync(userPath, { recursive: true });
    
    // Store certificate and private key
    fs.writeFileSync(path.join(userPath, 'cert.pem'), identity.certificate);
    fs.writeFileSync(path.join(userPath, 'key.pem'), identity.privateKey);
    fs.writeFileSync(path.join(userPath, 'mspId.txt'), identity.mspId);
  }

  // Load identity from file system
  private async loadStoredIdentity(orgId: string, userId: string): Promise<StoredIdentity | null> {
    // Check if we're looking for admin - use the mounted Fabric certificates
    if (userId.toLowerCase() === 'admin') {
      const fabricUserPath = `/app/fabric/organizations/peerOrganizations/${orgId}.luxe-bags.luxury/users/Admin@${orgId}.luxe-bags.luxury`;
      const mspPath = path.join(fabricUserPath, 'msp');
      
      // Check if Fabric certificates exist
      if (fs.existsSync(mspPath)) {
        const certPath = path.join(mspPath, 'signcerts', `Admin@${orgId}.luxe-bags.luxury-cert.pem`);
        const keyPath = path.join(mspPath, 'keystore', 'priv_sk');
        
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
          return {
            certificate: fs.readFileSync(certPath, 'utf8'),
            privateKey: fs.readFileSync(keyPath, 'utf8'),
            mspId: this.configManager.getMspId(orgId)
          };
        }
      }
    }
    
    // Fallback to original logic for non-admin users
    const identityPath = this.configManager.getIdentityPath(orgId);
    const userPath = path.join(identityPath, userId);
    
    const certPath = path.join(userPath, 'cert.pem');
    const keyPath = path.join(userPath, 'key.pem');
    const mspIdPath = path.join(userPath, 'mspId.txt');
    
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      return null;
    }
    
    return {
      certificate: fs.readFileSync(certPath, 'utf8'),
      privateKey: fs.readFileSync(keyPath, 'utf8'),
      mspId: fs.readFileSync(mspIdPath, 'utf8').trim()
    };
  }

  public async getCAClient(orgId: string): Promise<any> {
    if (!this.caClients.has(orgId)) {
      const org = this.configManager.getOrganization(orgId);
      if (!org) {
        throw new Error(`Organization not found: ${orgId}`);
      }

      const caInfo = this.getCAInfo(orgId);
      const caTLSCACerts = [caInfo.tlsCACert];
      if (!FabricCAServicesClass) {
        throw new Error('fabric-ca-client not available');
      }
      const caClient = new FabricCAServicesClass(
        caInfo.url,
        { trustedRoots: caTLSCACerts, verify: false },
        caInfo.caName
      );

      this.caClients.set(orgId, caClient);
    }
    return this.caClients.get(orgId)!;
  }

 // backend/gateway/src/fabric/identity-manager.ts
// Fix for line 89

private getCAInfo(orgId: string): { url: string; caName: string; tlsCACert: string } {
    const org = this.configManager.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const cryptoPath = this.configManager.getCryptoPath(orgId);
    // Use brand.id from config which is 'luxe-bags'
    const tlsCACertPath = path.join(cryptoPath, 'tlsca', `tlsca.${orgId}.${this.configManager.getBrandConfig().brand.id}.luxury-cert.pem`);
    
    // If tlsca cert doesn't exist, try the ca cert as fallback
    let tlsCACert: string;
    if (fs.existsSync(tlsCACertPath)) {
      tlsCACert = fs.readFileSync(tlsCACertPath, 'utf8');
    } else {
      // Fallback to regular CA cert
      const caCertPath = path.join(cryptoPath, 'ca', `ca.${orgId}.${this.configManager.getBrandConfig().brand.id}.luxury-cert.pem`);
      if (!fs.existsSync(caCertPath)) {
        throw new Error(`CA certificate not found: ${caCertPath}`);
      }
      tlsCACert = fs.readFileSync(caCertPath, 'utf8');
    }
    
    // Determine CA port based on organization index
    const brandConfig = this.configManager.getBrandConfig();
    const orgIndex = brandConfig.network.organizations.findIndex(o => o.id === orgId);
    const caPort = 7054 + orgIndex;

    return {
      url: `https://localhost:${caPort}`,
      caName: `ca-${orgId}`,
      tlsCACert
    };
  }

  public async enrollAdmin(orgId: string): Promise<void> {
    // Check if admin already exists in stored identities
    const existingIdentity = await this.loadStoredIdentity(orgId, 'admin');
    if (existingIdentity) {
      console.log(`Admin identity already exists for ${orgId}`);
      return;
    }

    const caClient = await this.getCAClient(orgId);
    
    // Enroll admin user
    const enrollment = await caClient.enroll({
      enrollmentID: 'admin',
      enrollmentSecret: 'adminpw'
    });

    const identity: StoredIdentity = {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
      mspId: this.configManager.getMspId(orgId)
    };

    await this.storeIdentity(orgId, 'admin', identity);
    console.log(`Successfully enrolled admin for ${orgId}`);
  }

  public async registerAndEnrollUser(
    orgId: string,
    userId: string,
    options: Partial<EnrollmentOptions> = {}
  ): Promise<void> {
    // Check if user already exists
    const existingIdentity = await this.loadStoredIdentity(orgId, userId);
    if (existingIdentity) {
      console.log(`User ${userId} already exists for ${orgId}`);
      return;
    }

    // Load admin identity to register the new user
    const adminIdentity = await this.loadStoredIdentity(orgId, 'admin');
    if (!adminIdentity) {
      throw new Error('Admin identity not found. Please enroll admin first.');
    }

    const caClient = await this.getCAClient(orgId);
    
    // Check if fabric-ca-client is available
    if (!FabricCAServicesClass) {
      throw new Error('fabric-ca-client module not available');
    }
    
    // Create an admin user object that the CA client expects
    // The fabric-ca-client expects a user object with specific methods
    const adminUser = {
      getName: () => 'admin',
      getIdentity: () => ({
        certificate: adminIdentity.certificate
      }),
      getSigningIdentity: () => ({
        certificate: adminIdentity.certificate,
        key: adminIdentity.privateKey
      }),
      getMspId: () => adminIdentity.mspId,
      setEnrollment: () => Promise.resolve(),
      isEnrolled: () => true
    };

    // Register the user with the admin user context
    const secret = await caClient.register({
      affiliation: options.affiliation || `${orgId}.department1`,
      enrollmentID: userId,
      role: options.role || 'client',
      attrs: options.attrs || [],
      maxEnrollments: -1
    }, adminUser);

    // Enroll the user
    const enrollment = await caClient.enroll({
      enrollmentID: userId,
      enrollmentSecret: secret
    });

    const identity: StoredIdentity = {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
      mspId: this.configManager.getMspId(orgId)
    };

    await this.storeIdentity(orgId, userId, identity);
    console.log(`Successfully enrolled user ${userId} for ${orgId}`);
  }

  // Get identity and signer for gateway connection
  public async getIdentity(orgId: string, userId: string): Promise<{ identity: Identity; signer: Signer } | null> {
    // First try to load from stored identities
    let storedIdentity = await this.loadStoredIdentity(orgId, userId);
    
    // If not found in stored identities, try to load from crypto materials
    if (!storedIdentity) {
      try {
        const cryptoMaterial = this.configManager.loadIdentity(orgId, userId);
        storedIdentity = {
          certificate: cryptoMaterial.credentials.certificate,
          privateKey: cryptoMaterial.credentials.privateKey,
          mspId: cryptoMaterial.mspId
        };
      } catch (error) {
        return null;
      }
    }
    
    // Convert certificate to Uint8Array
    const encoder = new TextEncoder();
    const certBytes = encoder.encode(storedIdentity.certificate);
    
    const identity: Identity = {
      credentials: certBytes,
      mspId: storedIdentity.mspId
    };
    
    const privateKey = crypto.createPrivateKey(storedIdentity.privateKey);
    const signer = signers.newPrivateKeySigner(privateKey);
    
    return { identity, signer };
  }

  public async listIdentities(orgId: string): Promise<string[]> {
    const identityPath = this.configManager.getIdentityPath(orgId);
    
    if (!fs.existsSync(identityPath)) {
      return [];
    }
    
    const files = fs.readdirSync(identityPath);
    return files.filter(f => fs.statSync(path.join(identityPath, f)).isDirectory());
  }

  public async deleteIdentity(orgId: string, userId: string): Promise<void> {
    const identityPath = this.configManager.getIdentityPath(orgId);
    const userPath = path.join(identityPath, userId);
    
    if (fs.existsSync(userPath)) {
      fs.rmSync(userPath, { recursive: true, force: true });
      console.log(`Removed identity ${userId} from ${orgId}`);
    }
  }

  public async importIdentity(
    orgId: string,
    userId: string,
    certificate: string,
    privateKey: string
  ): Promise<void> {
    const identity: StoredIdentity = {
      certificate,
      privateKey,
      mspId: this.configManager.getMspId(orgId)
    };
    
    await this.storeIdentity(orgId, userId, identity);
    console.log(`Successfully imported identity ${userId} for ${orgId}`);
  }

  public async exportIdentity(orgId: string, userId: string): Promise<StoredIdentity | null> {
    return await this.loadStoredIdentity(orgId, userId);
  }
}