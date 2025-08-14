// backend/auth/auth-service.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IdentityManager } from '../gateway/src/fabric/identity-manager';
import { UserRepository } from './user-repository';

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  organization: string;
  role: string;
  fabricUserId?: string;
}

// DEPRECATED: Users now managed by UserRepository
// Keeping for reference during migration
const LEGACY_USERS: User[] = [
  // LuxeBags (Brand) users
  {
    id: 'admin-luxebags',
    email: 'admin@luxebags.com',
    password: '$2a$10$ByGHzi2LqYzjD4x4Q1EBw.QwivKCgu0uSe/ZEBEkmsN73xZe9zr5.', // password: LuxeBags2024!
    name: 'Admin User',
    organization: 'luxebags',
    role: 'admin',
    fabricUserId: 'admin'
  },
  {
    id: 'user1-luxebags',
    email: 'manager@luxebags.com',
    password: '$2a$10$ByGHzi2LqYzjD4x4Q1EBw.QwivKCgu0uSe/ZEBEkmsN73xZe9zr5.', // password: LuxeBags2024!
    name: 'Brand Manager',
    organization: 'luxebags',
    role: 'manager',
    fabricUserId: 'user1'
  },
  
  // Italian Leather (Supplier) users
  {
    id: 'admin-italianleather',
    email: 'admin@italianleather.com',
    password: '$2a$10$0LfSmC7J8.gfsOvtfY6IMOJUy4tMxMHZwZkxtsJioci2b719AVn62', // password: ItalianLeather2024!
    name: 'Supplier Admin',
    organization: 'italianleather',
    role: 'admin',
    fabricUserId: 'admin'
  },
  {
    id: 'ops-italianleather',
    email: 'operations@italianleather.com',
    password: '$2a$10$0LfSmC7J8.gfsOvtfY6IMOJUy4tMxMHZwZkxtsJioci2b719AVn62', // password: ItalianLeather2024!
    name: 'Operations Manager',
    organization: 'italianleather',
    role: 'user',
    fabricUserId: 'user1'
  },
  
  // Craft Workshop (Manufacturer) users
  {
    id: 'admin-craftworkshop',
    email: 'admin@craftworkshop.com',
    password: '$2a$10$.BE/HK6YMAjEmYWMs4DIguKNxHfXMiR4sk3rhleUgPOdVAidu.oJK', // password: CraftWorkshop2024!
    name: 'Workshop Admin',
    organization: 'craftworkshop',
    role: 'admin',
    fabricUserId: 'admin'
  },
  {
    id: 'production-craftworkshop',
    email: 'production@craftworkshop.com',
    password: '$2a$10$.BE/HK6YMAjEmYWMs4DIguKNxHfXMiR4sk3rhleUgPOdVAidu.oJK', // password: CraftWorkshop2024!
    name: 'Production Manager',
    organization: 'craftworkshop',
    role: 'user',
    fabricUserId: 'user1'
  },
  
  // Luxury Retail (Retailer) users
  {
    id: 'admin-luxuryretail',
    email: 'admin@luxuryretail.com',
    password: '$2a$10$ZIy4ywQTKGcQm.KOeVMhTe18TWDqSeOi4n5JCbGRMgF1h4tN4X6hq', // password: LuxuryRetail2024!
    name: 'Retail Admin',
    organization: 'luxuryretail',
    role: 'admin',
    fabricUserId: 'admin'
  },
  {
    id: 'store-luxuryretail',
    email: 'store@luxuryretail.com',
    password: '$2a$10$ZIy4ywQTKGcQm.KOeVMhTe18TWDqSeOi4n5JCbGRMgF1h4tN4X6hq', // password: LuxuryRetail2024!
    name: 'Store Manager',
    organization: 'luxuryretail',
    role: 'user',
    fabricUserId: 'user1'
  }
];

export class AuthService {
  private jwtSecret: string;
  private identityManager: IdentityManager;
  private userRepository: UserRepository;
  private initialized: boolean = false;

  constructor(identityManager: IdentityManager) {
    // Generate a secure JWT secret if not provided
    this.jwtSecret = this.getSecureJwtSecret();
    this.identityManager = identityManager;
    this.userRepository = new UserRepository();
  }

  /**
   * Get or generate a secure JWT secret
   */
  private getSecureJwtSecret(): string {
    const envSecret = process.env.JWT_SECRET;
    
    if (!envSecret || envSecret === 'luxury-supply-chain-secret-change-in-production') {
      console.warn('⚠️  WARNING: Using default or weak JWT secret!');
      console.warn('⚠️  Generate a secure secret with: openssl rand -base64 32');
      console.warn('⚠️  Then set JWT_SECRET environment variable');
      
      // In development, generate a random secret (will change on restart)
      if (process.env.NODE_ENV === 'development') {
        const randomSecret = crypto.randomBytes(32).toString('base64');
        console.log('📝 Generated temporary JWT secret for development');
        return randomSecret;
      }
      
      // In production, refuse to start with weak secret
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production environment');
      }
    }
    
    // Validate secret strength
    if (envSecret && envSecret.length < 32) {
      console.warn('⚠️  JWT secret should be at least 32 characters for security');
    }
    
    return envSecret || crypto.randomBytes(32).toString('base64');
  }

  /**
   * Initialize the auth service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.userRepository.initialize();
    this.initialized = true;
    
    // Log security status
    const userCount = await this.userRepository.count();
    console.log(`✅ Auth service initialized with ${userCount} users`);
    
    if (process.env.JWT_SECRET) {
      console.log('✅ Using configured JWT secret');
    } else {
      console.log('⚠️  Using generated JWT secret (configure JWT_SECRET for production)');
    }
  }

  /**
   * Get the database connection pool
   */
  getPool() {
    return this.userRepository.getPool();
  }

  /**
   * Authenticate user and return JWT token
   */
  async login(email: string, password: string): Promise<{ user: Omit<User, 'password'>, token: string } | null> {
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Verify credentials against repository
    const user = await this.userRepository.verifyPassword(email, password);
    
    if (!user) {
      return null;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        organization: user.organization,
        role: user.role,
        fabricUserId: user.fabricUserId
      },
      this.jwtSecret,
      { expiresIn: '24h' }
    );

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<Omit<User, 'password'> | null> {
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    const user = await this.userRepository.findById(id);
    if (!user) return null;
    
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get all users for an organization (for admin)
   */
  async getOrganizationUsers(organization: string): Promise<Omit<User, 'password'>[]> {
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    const users = await this.userRepository.findByOrganization(organization);
    return users.map(({ password: _, ...user }) => user);
  }

  /**
   * Initialize Fabric identities for all users
   * Maps database users to existing Fabric identities (User1, User2, etc.)
   */
  async initializeFabricIdentities(): Promise<void> {
    console.log('Verifying Fabric identities for all users...');
    
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Get all organizations
    const organizations = ['luxebags', 'italianleather', 'craftworkshop', 'luxuryretail'];
    
    for (const org of organizations) {
      const users = await this.userRepository.findByOrganization(org);
      for (const user of users) {
        try {
          // Convert fabric_user_id to proper format (user1 -> User1, admin -> Admin)
          const fabricUserId = user.fabricUserId || 'User1';
          const properFabricId = fabricUserId.charAt(0).toUpperCase() + fabricUserId.slice(1);
          
          // Check if the pre-generated identity exists
          const identity = await this.identityManager.getIdentity(user.organization, properFabricId);
          
          if (identity) {
            console.log(`✓ Using existing identity ${properFabricId} for ${user.email}`);
          } else {
            console.warn(`⚠ Identity ${properFabricId} not found for ${user.email}, will use Admin identity as fallback`);
          }
        } catch (error) {
          console.warn(`Failed to verify Fabric identity for ${user.email}:`, error);
        }
      }
    }
    
    console.log('Fabric identity verification complete');
  }

  /**
   * Get demo credentials for documentation
   */
  /**
   * Create a new user (admin only)
   */
  async createUser(userData: Omit<User, 'id'>): Promise<Omit<User, 'password'> | null> {
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    const user = await this.userRepository.create(userData);
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    // Ensure service is initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    return await this.userRepository.changePassword(userId, oldPassword, newPassword);
  }

  static getDemoCredentials() {
    console.log('⚠️  Demo credentials - DO NOT USE IN PRODUCTION');
    console.log('Set INIT_DEFAULT_USERS=true and configure passwords via environment variables');
    return [
      {
        organization: 'LuxeBags (Brand)',
        users: [
          { email: 'admin@luxebags.com', password: 'LuxeBags2024!', role: 'Admin' },
          { email: 'manager@luxebags.com', password: 'LuxeBags2024!', role: 'Manager' }
        ]
      },
      {
        organization: 'Italian Leather (Supplier)',
        users: [
          { email: 'admin@italianleather.com', password: 'ItalianLeather2024!', role: 'Admin' },
          { email: 'operations@italianleather.com', password: 'ItalianLeather2024!', role: 'Operations' }
        ]
      },
      {
        organization: 'Craft Workshop (Manufacturer)',
        users: [
          { email: 'admin@craftworkshop.com', password: 'CraftWorkshop2024!', role: 'Admin' },
          { email: 'production@craftworkshop.com', password: 'CraftWorkshop2024!', role: 'Production' }
        ]
      },
      {
        organization: 'Luxury Retail (Retailer)',
        users: [
          { email: 'admin@luxuryretail.com', password: 'LuxuryRetail2024!', role: 'Admin' },
          { email: 'store@luxuryretail.com', password: 'LuxuryRetail2024!', role: 'Store Manager' }
        ]
      }
    ];
  }
}