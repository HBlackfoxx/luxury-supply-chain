// backend/auth/user-repository.ts
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { User } from './auth-service';
import { PostgresUserRepository } from './postgres-user-repository';

/**
 * User Repository - Manages user data persistence
 * In production, this would connect to a real database (PostgreSQL, MongoDB, etc.)
 * For now, using JSON file storage as a step up from in-memory
 */
export class UserRepository {
  private dbPath: string;
  private users: Map<string, User>;
  private initialized: boolean = false;
  private postgresRepo?: PostgresUserRepository;
  private dbType: string;

  constructor() {
    this.dbType = process.env.DB_TYPE || 'json';
    
    if (this.dbType === 'postgres') {
      // Use PostgreSQL repository
      this.postgresRepo = new PostgresUserRepository();
      this.dbPath = ''; // Not used for PostgreSQL
      this.users = new Map(); // Not used for PostgreSQL
    } else {
      // Use JSON file storage
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      this.dbPath = path.join(dataDir, 'users.json');
      this.users = new Map();
    }
  }

  /**
   * Initialize the repository and load existing users
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.dbType === 'postgres' && this.postgresRepo) {
      await this.postgresRepo.initialize();
      this.initialized = true;
      return;
    }

    // JSON file initialization
    if (fs.existsSync(this.dbPath)) {
      try {
        const data = fs.readFileSync(this.dbPath, 'utf-8');
        const usersArray: User[] = JSON.parse(data);
        usersArray.forEach(user => {
          this.users.set(user.id, user);
        });
        console.log(`Loaded ${this.users.size} users from database`);
      } catch (error) {
        console.error('Error loading users database:', error);
        // Initialize with empty database
        await this.save();
      }
    } else {
      // Initialize with default users only if no database exists
      await this.initializeDefaultUsers();
    }

    this.initialized = true;
  }

  /**
   * Initialize default users for development/demo
   * Only called if no database exists
   */
  private async initializeDefaultUsers(): Promise<void> {
    // Only create default users if explicitly enabled
    if (process.env.INIT_DEFAULT_USERS !== 'true') {
      console.log('Default users initialization skipped (set INIT_DEFAULT_USERS=true to enable)');
      await this.save();
      return;
    }

    console.log('Initializing default users for demo/development...');

    const defaultUsers = [
      // LuxeBags (Brand) users
      {
        id: 'admin-luxebags',
        email: 'admin@luxebags.com',
        password: process.env.LUXEBAGS_ADMIN_PASSWORD || 'ChangeMe2024!',
        name: 'Admin User',
        organization: 'luxebags',
        role: 'admin',
        fabricUserId: 'admin'
      },
      {
        id: 'user1-luxebags',
        email: 'manager@luxebags.com',
        password: process.env.LUXEBAGS_MANAGER_PASSWORD || 'ChangeMe2024!',
        name: 'Brand Manager',
        organization: 'luxebags',
        role: 'manager',
        fabricUserId: 'user1'
      },
      // Italian Leather (Supplier) users
      {
        id: 'admin-italianleather',
        email: 'admin@italianleather.com',
        password: process.env.ITALIANLEATHER_ADMIN_PASSWORD || 'ChangeMe2024!',
        name: 'Supplier Admin',
        organization: 'italianleather',
        role: 'admin',
        fabricUserId: 'admin'
      },
      {
        id: 'ops-italianleather',
        email: 'operations@italianleather.com',
        password: process.env.ITALIANLEATHER_OPS_PASSWORD || 'ChangeMe2024!',
        name: 'Operations Manager',
        organization: 'italianleather',
        role: 'user',
        fabricUserId: 'user1'
      },
      // Craft Workshop (Manufacturer) users
      {
        id: 'admin-craftworkshop',
        email: 'admin@craftworkshop.com',
        password: process.env.CRAFTWORKSHOP_ADMIN_PASSWORD || 'ChangeMe2024!',
        name: 'Workshop Admin',
        organization: 'craftworkshop',
        role: 'admin',
        fabricUserId: 'admin'
      },
      {
        id: 'production-craftworkshop',
        email: 'production@craftworkshop.com',
        password: process.env.CRAFTWORKSHOP_PROD_PASSWORD || 'ChangeMe2024!',
        name: 'Production Manager',
        organization: 'craftworkshop',
        role: 'user',
        fabricUserId: 'user1'
      },
      // Luxury Retail (Retailer) users
      {
        id: 'admin-luxuryretail',
        email: 'admin@luxuryretail.com',
        password: process.env.LUXURYRETAIL_ADMIN_PASSWORD || 'ChangeMe2024!',
        name: 'Retail Admin',
        organization: 'luxuryretail',
        role: 'admin',
        fabricUserId: 'admin'
      },
      {
        id: 'store-luxuryretail',
        email: 'store@luxuryretail.com',
        password: process.env.LUXURYRETAIL_STORE_PASSWORD || 'ChangeMe2024!',
        name: 'Store Manager',
        organization: 'luxuryretail',
        role: 'user',
        fabricUserId: 'user1'
      }
    ];

    // Hash passwords and create users
    for (const userData of defaultUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user: User = {
        ...userData,
        password: hashedPassword
      };
      this.users.set(user.id, user);
    }

    await this.save();
    console.log(`Created ${defaultUsers.length} default users`);
  }

  /**
   * Save users to persistent storage
   */
  private async save(): Promise<void> {
    const usersArray = Array.from(this.users.values());
    fs.writeFileSync(this.dbPath, JSON.stringify(usersArray, null, 2));
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    if (this.postgresRepo) {
      return this.postgresRepo.findByEmail(email);
    }
    
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    if (this.postgresRepo) {
      return this.postgresRepo.findById(id);
    }
    return this.users.get(id) || null;
  }

  /**
   * Create a new user
   */
  async create(userData: Omit<User, 'id'>): Promise<User> {
    if (this.postgresRepo) {
      return this.postgresRepo.create(userData);
    }
    
    const id = `${userData.role}-${userData.organization}-${Date.now()}`;
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const user: User = {
      id,
      ...userData,
      password: hashedPassword
    };

    this.users.set(user.id, user);
    await this.save();
    
    return user;
  }

  /**
   * Update user
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    if (this.postgresRepo) {
      return this.postgresRepo.update(id, updates);
    }
    
    const user = this.users.get(id);
    if (!user) return null;

    // If password is being updated, hash it
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const updatedUser = { ...user, ...updates, id: user.id };
    this.users.set(id, updatedUser);
    await this.save();
    
    return updatedUser;
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<boolean> {
    if (this.postgresRepo) {
      return this.postgresRepo.delete(id);
    }
    
    const deleted = this.users.delete(id);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  /**
   * Get all users for an organization
   */
  async findByOrganization(organization: string): Promise<User[]> {
    if (this.postgresRepo) {
      return this.postgresRepo.findByOrganization(organization);
    }
    
    const orgUsers: User[] = [];
    for (const user of this.users.values()) {
      if (user.organization === organization) {
        orgUsers.push(user);
      }
    }
    return orgUsers;
  }

  /**
   * Verify user password
   */
  async verifyPassword(email: string, password: string): Promise<User | null> {
    if (this.postgresRepo) {
      return this.postgresRepo.verifyPassword(email, password);
    }
    
    const user = await this.findByEmail(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : null;
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    if (this.postgresRepo) {
      return this.postgresRepo.changePassword(userId, oldPassword, newPassword);
    }
    
    const user = await this.findById(userId);
    if (!user) return false;

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) return false;

    await this.update(userId, { password: newPassword });
    return true;
  }

  /**
   * Check if database is empty
   */
  async isEmpty(): Promise<boolean> {
    if (this.postgresRepo) {
      return this.postgresRepo.isEmpty();
    }
    return this.users.size === 0;
  }

  /**
   * Get total number of users
   */
  async count(): Promise<number> {
    if (this.postgresRepo) {
      return this.postgresRepo.count();
    }
    return this.users.size;
  }

  /**
   * Get all users (for internal use)
   */
  async getAllUsers(): Promise<User[]> {
    if (this.postgresRepo) {
      return this.postgresRepo.getAllUsers();
    }
    return Array.from(this.users.values());
  }

  /**
   * Get the database connection pool
   */
  getPool() {
    if (this.postgresRepo) {
      return this.postgresRepo.getPool();
    }
    // For JSON storage, return null
    return null;
  }
}