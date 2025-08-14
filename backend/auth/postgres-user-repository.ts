// backend/auth/postgres-user-repository.ts
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { User } from './auth-service';
import { getPool } from './database';

/**
 * PostgreSQL User Repository
 */
export class PostgresUserRepository {
  private pool: Pool;
  private initialized: boolean = false;

  constructor() {
    this.pool = getPool();
  }

  /**
   * Initialize the repository
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Check if we have any users
      const result = await this.pool.query('SELECT COUNT(*) FROM users');
      const count = parseInt(result.rows[0].count);
      
      if (count === 0 && process.env.INIT_DEFAULT_USERS === 'true') {
        await this.initializeDefaultUsers();
      } else {
        console.log(`PostgreSQL: Loaded ${count} users from database`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing PostgreSQL repository:', error);
      throw error;
    }
  }

  /**
   * Initialize default users
   */
  private async initializeDefaultUsers(): Promise<void> {
    console.log('Initializing default users in PostgreSQL...');

    const defaultUsers = [
      {
        id: 'admin-luxebags',
        email: 'admin@luxebags.com',
        password: process.env.LUXEBAGS_ADMIN_PASSWORD || 'LuxeBags2024!',
        name: 'Admin User',
        organization: 'luxebags',
        role: 'admin',
        fabric_user_id: 'admin'
      },
      {
        id: 'user1-luxebags',
        email: 'manager@luxebags.com',
        password: process.env.LUXEBAGS_MANAGER_PASSWORD || 'LuxeBags2024!',
        name: 'Brand Manager',
        organization: 'luxebags',
        role: 'manager',
        fabric_user_id: 'user1'
      },
      {
        id: 'admin-italianleather',
        email: 'admin@italianleather.com',
        password: process.env.ITALIANLEATHER_ADMIN_PASSWORD || 'ItalianLeather2024!',
        name: 'Supplier Admin',
        organization: 'italianleather',
        role: 'admin',
        fabric_user_id: 'admin'
      },
      {
        id: 'ops-italianleather',
        email: 'operations@italianleather.com',
        password: process.env.ITALIANLEATHER_OPS_PASSWORD || 'ItalianLeather2024!',
        name: 'Operations Manager',
        organization: 'italianleather',
        role: 'user',
        fabric_user_id: 'user1'
      },
      {
        id: 'admin-craftworkshop',
        email: 'admin@craftworkshop.com',
        password: process.env.CRAFTWORKSHOP_ADMIN_PASSWORD || 'CraftWorkshop2024!',
        name: 'Workshop Admin',
        organization: 'craftworkshop',
        role: 'admin',
        fabric_user_id: 'admin'
      },
      {
        id: 'production-craftworkshop',
        email: 'production@craftworkshop.com',
        password: process.env.CRAFTWORKSHOP_PROD_PASSWORD || 'CraftWorkshop2024!',
        name: 'Production Manager',
        organization: 'craftworkshop',
        role: 'user',
        fabric_user_id: 'user1'
      },
      {
        id: 'admin-luxuryretail',
        email: 'admin@luxuryretail.com',
        password: process.env.LUXURYRETAIL_ADMIN_PASSWORD || 'LuxuryRetail2024!',
        name: 'Retail Admin',
        organization: 'luxuryretail',
        role: 'admin',
        fabric_user_id: 'admin'
      },
      {
        id: 'store-luxuryretail',
        email: 'store@luxuryretail.com',
        password: process.env.LUXURYRETAIL_STORE_PASSWORD || 'LuxuryRetail2024!',
        name: 'Store Manager',
        organization: 'luxuryretail',
        role: 'user',
        fabric_user_id: 'user1'
      }
    ];

    // Use transaction for atomic operation
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const userData of defaultUsers) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        
        await client.query(
          `INSERT INTO users (id, email, password, name, organization, role, fabric_user_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           ON CONFLICT (id) DO NOTHING`,
          [
            userData.id,
            userData.email,
            hashedPassword,
            userData.name,
            userData.organization,
            userData.role,
            userData.fabric_user_id
          ]
        );
      }
      
      await client.query('COMMIT');
      console.log(`Created ${defaultUsers.length} default users in PostgreSQL`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      organization: row.organization,
      role: row.role,
      fabricUserId: row.fabric_user_id
    };
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      organization: row.organization,
      role: row.role,
      fabricUserId: row.fabric_user_id
    };
  }

  /**
   * Create a new user
   */
  async create(userData: Omit<User, 'id'>): Promise<User> {
    const id = `${userData.role}-${userData.organization}-${Date.now()}`;
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const result = await this.pool.query(
      `INSERT INTO users (id, email, password, name, organization, role, fabric_user_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        id,
        userData.email,
        hashedPassword,
        userData.name,
        userData.organization,
        userData.role,
        userData.fabricUserId || null
      ]
    );
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      organization: row.organization,
      role: row.role,
      fabricUserId: row.fabric_user_id
    };
  }

  /**
   * Update user
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    if (updates.email) {
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }
    if (updates.password) {
      fields.push(`password = $${paramCount++}`);
      values.push(await bcrypt.hash(updates.password, 10));
    }
    if (updates.name) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.role) {
      fields.push(`role = $${paramCount++}`);
      values.push(updates.role);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
      UPDATE users 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      organization: row.organization,
      role: row.role,
      fabricUserId: row.fabric_user_id
    };
  }

  /**
   * Delete user (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all users for an organization
   */
  async findByOrganization(organization: string): Promise<User[]> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE organization = $1 AND is_active = true ORDER BY name',
      [organization]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      organization: row.organization,
      role: row.role,
      fabricUserId: row.fabric_user_id
    }));
  }

  /**
   * Verify user password
   */
  async verifyPassword(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password);
    
    if (isValid) {
      // Update last login
      await this.pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      // Log authentication
      await this.pool.query(
        'INSERT INTO audit_log (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)',
        [user.id, 'LOGIN', 'authentication', JSON.stringify({ email })]
      );
    }
    
    return isValid ? user : null;
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) return false;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await this.pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, userId]
    );

    // Log password change
    await this.pool.query(
      'INSERT INTO audit_log (user_id, action, entity_type) VALUES ($1, $2, $3)',
      [userId, 'PASSWORD_CHANGE', 'authentication']
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Check if database is empty
   */
  async isEmpty(): Promise<boolean> {
    const result = await this.pool.query('SELECT COUNT(*) FROM users');
    return parseInt(result.rows[0].count) === 0;
  }

  /**
   * Get total number of users
   */
  async count(): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*) FROM users WHERE is_active = true');
    return parseInt(result.rows[0].count);
  }

  /**
   * Get all users (for internal use)
   */
  async getAllUsers(): Promise<User[]> {
    const result = await this.pool.query('SELECT * FROM users WHERE is_active = true ORDER BY organization, name');
    return result.rows.map(row => ({
      id: row.id,
      email: row.email,
      password: row.password,
      name: row.name,
      organization: row.organization,
      role: row.role,
      fabricUserId: row.fabric_user_id
    }));
  }

  /**
   * Get the database connection pool
   */
  getPool() {
    return this.pool;
  }
}