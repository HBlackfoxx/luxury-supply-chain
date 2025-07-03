// Wallet Manager for Hyperledger Fabric identities
// Handles identity creation, enrollment, and management

import { Wallets, X509Identity, Wallet } from '@hyperledger/fabric-gateway';
import * as FabricCAServices from 'fabric-ca-client';
import * as fs from 'fs';
import * as path from 'path';
import { SDKConfigManager } from '../config/sdk-config';

export interface EnrollmentOptions {
  enrollmentID: string;
  enrollmentSecret: string;
  role?: string;
  affiliation?: string;
  attrs?: Array<{ name: string; value: string; ecert?: boolean }>;
}

export class WalletManager {
  private configManager: SDKConfigManager;
  private wallets: Map<string, Wallet> = new Map();
  private caClients: Map<string, FabricCAServices> = new Map();

  constructor(configManager: SDKConfigManager) {
    this.configManager = configManager;
  }

  public async getWallet(orgId: string): Promise<Wallet> {
    if (!this.wallets.has(orgId)) {
      const wallet = await this.configManager.createWallet(orgId);
      this.wallets.set(orgId, wallet);
    }
    return this.wallets.get(orgId)!;
  }

  public async getCAClient(orgId: string): Promise<FabricCAServices> {
    if (!this.caClients.has(orgId)) {
      const org = this.configManager.getOrganization(orgId);
      if (!org) {
        throw new Error(`Organization not found: ${orgId}`);
      }

      const caInfo = this.getCAInfo(orgId);
      const caTLSCACerts = [caInfo.tlsCACert];
      const caClient = new FabricCAServices(
        caInfo.url,
        { trustedRoots: caTLSCACerts, verify: false },
        caInfo.caName
      );

      this.caClients.set(orgId, caClient);
    }
    return this.caClients.get(orgId)!;
  }

  private getCAInfo(orgId: string): { url: string; caName: string; tlsCACert: string } {
    const org = this.configManager.getOrganization(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const cryptoPath = this.configManager.getCryptoPath(orgId);
    const tlsCACertPath = path.join(cryptoPath, 'ca', 'ca.pem');
    
    if (!fs.existsSync(tlsCACertPath)) {
      throw new Error(`CA TLS certificate not found: ${tlsCACertPath}`);
    }

    const tlsCACert = fs.readFileSync(tlsCACertPath, 'utf8');
    
    // Determine CA port based on organization index
    const orgIndex = this.configManager.getBrandConfig().network.organizations.findIndex(o => o.id === orgId);
    const caPort = 7054 + orgIndex;

    return {
      url: `https://localhost:${caPort}`,
      caName: `ca-${orgId}`,
      tlsCACert
    };
  }

  public async enrollAdmin(orgId: string): Promise<void> {
    const wallet = await this.getWallet(orgId);
    const adminIdentity = await wallet.get('admin');

    if (adminIdentity) {
      console.log(`Admin identity already exists for ${orgId}`);
      return;
    }

    const caClient = await this.getCAClient(orgId);
    
    // Enroll admin user
    const enrollment = await caClient.enroll({
      enrollmentID: 'admin',
      enrollmentSecret: 'adminpw'
    });

    const x509Identity: X509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: this.configManager.getOrganization(orgId)!.mspId,
      type: 'X.509',
    };

    await wallet.put('admin', x509Identity);
    console.log(`Successfully enrolled admin for ${orgId}`);
  }

  public async registerAndEnrollUser(
    orgId: string,
    userId: string,
    options: Partial<EnrollmentOptions> = {}
  ): Promise<void> {
    const wallet = await this.getWallet(orgId);
    const userIdentity = await wallet.get(userId);

    if (userIdentity) {
      console.log(`User ${userId} already exists in wallet`);
      return;
    }

    // Check if admin exists
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
      throw new Error('Admin identity not found. Please enroll admin first.');
    }

    const caClient = await this.getCAClient(orgId);
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    // Register the user
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

    const x509Identity: X509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: this.configManager.getOrganization(orgId)!.mspId,
      type: 'X.509',
    };

    await wallet.put(userId, x509Identity);
    console.log(`Successfully enrolled user ${userId} for ${orgId}`);
  }

  public async getIdentity(orgId: string, userId: string): Promise<X509Identity | undefined> {
    const wallet = await this.getWallet(orgId);
    const identity = await wallet.get(userId);
    return identity as X509Identity | undefined;
  }

  public async listIdentities(orgId: string): Promise<string[]> {
    const wallet = await this.getWallet(orgId);
    return await wallet.list();
  }

  public async deleteIdentity(orgId: string, userId: string): Promise<void> {
    const wallet = await this.getWallet(orgId);
    await wallet.remove(userId);
    console.log(`Removed identity ${userId} from ${orgId} wallet`);
  }

  public async importIdentity(
    orgId: string,
    userId: string,
    certificate: string,
    privateKey: string
  ): Promise<void> {
    const wallet = await this.getWallet(orgId);
    
    const x509Identity: X509Identity = {
      credentials: {
        certificate,
        privateKey,
      },
      mspId: this.configManager.getOrganization(orgId)!.mspId,
      type: 'X.509',
    };

    await wallet.put(userId, x509Identity);
    console.log(`Successfully imported identity ${userId} for ${orgId}`);
  }

  public async exportIdentity(orgId: string, userId: string): Promise<X509Identity | null> {
    const wallet = await this.getWallet(orgId);
    const identity = await wallet.get(userId);
    
    if (!identity || identity.type !== 'X.509') {
      return null;
    }

    return identity as X509Identity;
  }
}