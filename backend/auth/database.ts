// backend/auth/database.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database connection pool
 */
let pool: Pool | null = null;

/**
 * Get database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    const dbType = process.env.DB_TYPE || 'json';
    
    if (dbType === 'postgres') {
      // PostgreSQL configuration
      pool = new Pool({
        host: process.env.POSTGRES_HOST || 'postgres',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'luxury_supply_chain',
        user: process.env.POSTGRES_USER || 'dbadmin',
        password: process.env.POSTGRES_PASSWORD || 'SecureDBPassword2024!',
        max: 20, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      pool.connect((err, client, release) => {
        if (err) {
          console.error('Error connecting to PostgreSQL:', err.stack);
        } else {
          console.log('✅ Connected to PostgreSQL database');
          release();
        }
      });

      // Handle pool errors
      pool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client', err);
      });
    }
  }
  
  return pool!;
}

/**
 * Initialize database (create tables if needed)
 */
export async function initializeDatabase(): Promise<void> {
  const dbType = process.env.DB_TYPE || 'json';
  
  if (dbType !== 'postgres') {
    console.log('Using JSON file storage (no database initialization needed)');
    return;
  }

  const pool = getPool();
  
  try {
    // Check if users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Database tables not found, running initialization...');
      // Tables will be created by init.sql when container starts
      console.log('Tables should be created by init.sql in Docker');
    } else {
      const userCount = await pool.query('SELECT COUNT(*) FROM users');
      console.log(`Database initialized with ${userCount.rows[0].count} users`);
    }
  } catch (error) {
    console.error('Error initializing database:', error);
    // Don't throw - allow app to continue with JSON fallback
  }
}

/**
 * Close database connections
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('Database connections closed');
  }
}