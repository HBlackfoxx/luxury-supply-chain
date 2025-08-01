// backend/services/organization-service.ts
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

export interface Organization {
  id: string;
  name: string;
  type: 'brand' | 'supplier' | 'manufacturer' | 'retailer' | 'logistics' | 'certifier';
  domain: string;
  apiEndpoint: string;
  fabricMSP: string;
  channels: string[];
  chaincodes: string[];
  branding?: {
    primaryColor: string;
    logo: string;
  };
  status?: 'active' | 'pending' | 'suspended';
}

export class OrganizationService extends EventEmitter {
  private organizations: Map<string, Organization> = new Map();
  private configPath: string;
  private fileWatcher?: fs.FSWatcher;

  constructor(configPath?: string) {
    super();
    this.configPath = configPath || path.join(__dirname, '../config/organizations.json');
    this.loadOrganizations();
    this.watchConfigFile();
  }

  /**
   * Load organizations from config file
   */
  private loadOrganizations(): void {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      this.organizations.clear();
      
      for (const [id, org] of Object.entries(config.organizations)) {
        this.organizations.set(id, {
          id,
          ...org as any,
          status: 'active'
        });
      }
      
      console.log(`Loaded ${this.organizations.size} organizations`);
      this.emit('organizations-updated', Array.from(this.organizations.values()));
    } catch (error) {
      console.error('Failed to load organizations:', error);
    }
  }

  /**
   * Watch config file for changes (hot reload)
   */
  private watchConfigFile(): void {
    this.fileWatcher = fs.watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        console.log('Organizations config changed, reloading...');
        this.loadOrganizations();
      }
    });
  }

  /**
   * Get all organizations
   */
  getAllOrganizations(): Organization[] {
    return Array.from(this.organizations.values());
  }

  /**
   * Get organization by ID
   */
  getOrganizationById(id: string): Organization | null {
    return this.organizations.get(id) || null;
  }

  /**
   * Get organization by email domain
   */
  getOrganizationByDomain(email: string): Organization | null {
    const domain = email.split('@')[1];
    
    for (const org of this.organizations.values()) {
      if (org.domain === domain) {
        return org;
      }
    }
    
    return null;
  }

  /**
   * Add new organization (for admin)
   */
  async addOrganization(org: Omit<Organization, 'id' | 'status'>): Promise<Organization> {
    const id = org.name.toLowerCase().replace(/\s+/g, '');
    const newOrg: Organization = {
      id,
      ...org,
      status: 'pending'
    };
    
    // Add to config
    const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    config.organizations[id] = newOrg;
    
    // Write back to file
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    
    // Reload
    this.loadOrganizations();
    
    this.emit('organization-added', newOrg);
    return newOrg;
  }

  /**
   * Get organizations by type
   */
  getOrganizationsByType(type: Organization['type']): Organization[] {
    return Array.from(this.organizations.values()).filter(org => org.type === type);
  }

  /**
   * Check if organization exists
   */
  organizationExists(id: string): boolean {
    return this.organizations.has(id);
  }

  /**
   * Get API endpoint for organization
   */
  getApiEndpoint(orgId: string): string | null {
    const org = this.organizations.get(orgId);
    return org?.apiEndpoint || null;
  }

  /**
   * Validate organization access to channel
   */
  canAccessChannel(orgId: string, channel: string): boolean {
    const org = this.organizations.get(orgId);
    return org?.channels.includes(channel) || false;
  }

  /**
   * Get organization MSP ID for Fabric
   */
  getMSPId(orgId: string): string | null {
    const org = this.organizations.get(orgId);
    return org?.fabricMSP || null;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }
  }
}