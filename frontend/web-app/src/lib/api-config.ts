// API configuration
export const API_CONFIG = {
  consensusAPI: process.env.NEXT_PUBLIC_CONSENSUS_API_URL || 'http://localhost:4000/api/consensus',
  customerAPI: process.env.NEXT_PUBLIC_CUSTOMER_API_URL || 'http://localhost:3002/api/customer',
};

// Create axios instance with default config
import axios from 'axios';

export const consensusAPI = axios.create({
  baseURL: API_CONFIG.consensusAPI,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const customerAPI = axios.create({
  baseURL: API_CONFIG.customerAPI,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Dynamic API configuration based on logged-in organization
export function getApiForOrganization(orgId: string) {
  // Ensure organization manager is initialized
  organizationManager.initialize();
  
  const org = organizationManager.getById(orgId);
  if (!org) {
    throw new Error(`Unknown organization: ${orgId}`);
  }
  
  const api = axios.create({
    baseURL: org.apiEndpoint,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add auth interceptor
  api.interceptors.request.use((config) => {
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      try {
        const { state } = JSON.parse(authStorage);
        if (state?.user && state?.token) {
          config.headers['Authorization'] = `Bearer ${state.token}`;
          config.headers['x-org-id'] = state.user.organization;
          config.headers['x-user-id'] = state.user.id;
          config.headers['x-user-role'] = state.user.role;
        }
      } catch (e) {
        console.error('Failed to parse auth storage:', e);
      }
    }
    return config;
  });

  return api;
}

// Import organization manager - moved to bottom to avoid circular dependency
import { organizationManager } from './organization-config';

// Legacy interceptor for backward compatibility
consensusAPI.interceptors.request.use((config) => {
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage);
      if (state?.user && state?.token) {
        // Ensure organization manager is initialized
        organizationManager.initialize();
        
        // Use the organization's specific API endpoint
        const org = organizationManager.getById(state.user.organization);
        if (org) {
          config.baseURL = org.apiEndpoint + '/api/consensus';
        }
        config.headers['Authorization'] = `Bearer ${state.token}`;
        config.headers['x-org-id'] = state.user.organization;
        config.headers['x-user-id'] = state.user.id;
        config.headers['x-user-role'] = state.user.role;
      }
    } catch (e) {
      console.error('Failed to parse auth storage:', e);
    }
  }
  return config;
});