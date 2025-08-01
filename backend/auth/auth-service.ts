// backend/auth/auth-service.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { IdentityManager } from '../gateway/src/fabric/identity-manager';

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  organization: string;
  role: string;
  fabricUserId?: string;
}

// In production, these would be in a database
const USERS: User[] = [
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

  constructor(identityManager: IdentityManager) {
    this.jwtSecret = process.env.JWT_SECRET || 'luxury-supply-chain-secret-change-in-production';
    this.identityManager = identityManager;
  }

  /**
   * Authenticate user and return JWT token
   */
  async login(email: string, password: string): Promise<{ user: Omit<User, 'password'>, token: string } | null> {
    const user = USERS.find(u => u.email === email);
    
    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
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
  getUserById(id: string): Omit<User, 'password'> | null {
    const user = USERS.find(u => u.id === id);
    if (!user) return null;
    
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get all users for an organization (for admin)
   */
  getOrganizationUsers(organization: string): Omit<User, 'password'>[] {
    return USERS
      .filter(u => u.organization === organization)
      .map(({ password: _, ...user }) => user);
  }

  /**
   * Initialize Fabric identities for all users
   */
  async initializeFabricIdentities(): Promise<void> {
    console.log('Initializing Fabric identities for all users...');
    
    for (const user of USERS) {
      try {
        // Check if identity exists
        const identity = await this.identityManager.getIdentity(user.organization, user.fabricUserId || 'user1');
        
        if (!identity && user.fabricUserId !== 'admin') {
          // Register and enroll non-admin users
          console.log(`Registering ${user.name} (${user.email}) in Fabric...`);
          await this.identityManager.registerAndEnrollUser(
            user.organization,
            user.fabricUserId || 'user1',
            {
              affiliation: `${user.organization}.department1`,
              attrs: [
                { name: 'email', value: user.email, ecert: true },
                { name: 'role', value: user.role, ecert: true }
              ]
            }
          );
        }
      } catch (error) {
        console.warn(`Failed to initialize Fabric identity for ${user.email}:`, error);
      }
    }
    
    console.log('Fabric identity initialization complete');
  }

  /**
   * Get demo credentials for documentation
   */
  static getDemoCredentials() {
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