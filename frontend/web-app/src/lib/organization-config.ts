// Frontend organization configuration
import { API_CONFIG } from './api-config';

export interface Organization {
  id: string;
  name: string;
  type: string;
  domain: string;
  apiEndpoint: string;
  branding?: {
    primaryColor: string;
    logo: string;
  };
}

class OrganizationManager {
  private organizations: Map<string, Organization> = new Map();
  private initialized = false;

  /**
   * Initialize by loading defaults immediately
   */
  initialize() {
    if (this.initialized) return;
    
    // Always load defaults first
    this.loadDefaults();
    this.initialized = true;
    
    // Optionally try to fetch updates from API later
    this.fetchUpdates();
  }
  
  /**
   * Fetch organization updates from API (non-blocking)
   */
  private async fetchUpdates() {
    try {
      // This could fetch from a central registry in the future
      // For now, we just use the defaults
    } catch (error) {
      // Silently ignore - we have defaults
    }
  }

  /**
   * Load default organizations (fallback)
   */
  private loadDefaults() {
    const defaults: Organization[] = [
      {
        id: 'luxebags',
        name: 'LuxeBags',
        type: 'brand',
        domain: 'luxebags.com',
        apiEndpoint: process.env.NEXT_PUBLIC_LUXEBAGS_API || 'http://localhost:4001',
        branding: {
          primaryColor: '#D4AF37',
          logo: '/logos/luxebags.png'
        }
      },
      {
        id: 'italianleather',
        name: 'Italian Leather Co',
        type: 'supplier',
        domain: 'italianleather.com',
        apiEndpoint: process.env.NEXT_PUBLIC_ITALIANLEATHER_API || 'http://localhost:4002',
        branding: {
          primaryColor: '#8B4513',
          logo: '/logos/italianleather.png'
        }
      },
      {
        id: 'craftworkshop',
        name: 'Craft Workshop',
        type: 'manufacturer',
        domain: 'craftworkshop.com',
        apiEndpoint: process.env.NEXT_PUBLIC_CRAFTWORKSHOP_API || 'http://localhost:4003',
        branding: {
          primaryColor: '#4169E1',
          logo: '/logos/craftworkshop.png'
        }
      },
      {
        id: 'luxuryretail',
        name: 'Luxury Retail',
        type: 'retailer',
        domain: 'luxuryretail.com',
        apiEndpoint: process.env.NEXT_PUBLIC_LUXURYRETAIL_API || 'http://localhost:4004',
        branding: {
          primaryColor: '#FF69B4',
          logo: '/logos/luxuryretail.png'
        }
      }
    ];

    defaults.forEach(org => this.organizations.set(org.id, org));
  }

  /**
   * Get organization by email domain
   */
  getByEmail(email: string): Organization | null {
    const domain = email.split('@')[1];
    
    for (const org of this.organizations.values()) {
      if (org.domain === domain) {
        return org;
      }
    }
    
    return null;
  }

  /**
   * Get organization by ID
   */
  getById(id: string): Organization | null {
    return this.organizations.get(id) || null;
  }

  /**
   * Get all organizations
   */
  getAll(): Organization[] {
    return Array.from(this.organizations.values());
  }

  /**
   * Get organizations by type
   */
  getByType(type: string): Organization[] {
    return Array.from(this.organizations.values()).filter(org => org.type === type);
  }

  /**
   * Check if email belongs to a known organization
   */
  isKnownOrganization(email: string): boolean {
    return this.getByEmail(email) !== null;
  }

  /**
   * Get API endpoint for email
   */
  getApiEndpoint(email: string): string {
    const org = this.getByEmail(email);
    return org?.apiEndpoint || API_CONFIG.consensusAPI;
  }
}

// Singleton instance
export const organizationManager = new OrganizationManager();