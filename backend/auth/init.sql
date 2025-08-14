-- Luxury Supply Chain Database Schema
-- Authentication and User Management

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    organization VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    fabric_user_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- Create sessions table for JWT token management
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  message TEXT,
  data JSONB,
  priority VARCHAR(20) DEFAULT 'medium',
  channels TEXT[], -- Array of channels (email, sms, webhook, in_app)
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Create file storage metadata table
CREATE TABLE IF NOT EXISTS file_storage (
  id SERIAL PRIMARY KEY,
  file_id VARCHAR(255) UNIQUE NOT NULL,
  original_name VARCHAR(255),
  filename VARCHAR(255),
  mime_type VARCHAR(100),
  size INTEGER,
  path VARCHAR(500),
  url VARCHAR(500),
  entity_type VARCHAR(50),
  entity_id VARCHAR(255),
  uploaded_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for file storage
CREATE INDEX IF NOT EXISTS idx_file_storage_entity ON file_storage(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_storage_uploaded_by ON file_storage(uploaded_by);

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    msp_id VARCHAR(100),
    api_endpoint VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default organizations
INSERT INTO organizations (id, name, type, msp_id, api_endpoint) VALUES
    ('luxebags', 'LuxeBags', 'brand_owner', 'LuxeBagsMSP', 'http://localhost:4001'),
    ('italianleather', 'Italian Leather Co', 'supplier', 'ItalianLeatherMSP', 'http://localhost:4002'),
    ('craftworkshop', 'Master Craft Workshop', 'manufacturer', 'CraftWorkshopMSP', 'http://localhost:4003'),
    ('luxuryretail', 'Luxury Retail Boutique', 'retailer', 'LuxuryRetailMSP', 'http://localhost:4004')
ON CONFLICT (id) DO NOTHING;

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    UNIQUE(role, resource, action)
);

-- Insert default permissions
INSERT INTO permissions (role, resource, action) VALUES
    ('admin', 'users', 'create'),
    ('admin', 'users', 'read'),
    ('admin', 'users', 'update'),
    ('admin', 'users', 'delete'),
    ('admin', 'transactions', 'create'),
    ('admin', 'transactions', 'read'),
    ('admin', 'transactions', 'update'),
    ('admin', 'transactions', 'approve'),
    ('admin', 'disputes', 'create'),
    ('admin', 'disputes', 'resolve'),
    ('manager', 'transactions', 'create'),
    ('manager', 'transactions', 'read'),
    ('manager', 'transactions', 'update'),
    ('manager', 'disputes', 'create'),
    ('user', 'transactions', 'create'),
    ('user', 'transactions', 'read')
ON CONFLICT (role, resource, action) DO NOTHING;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log user actions
CREATE OR REPLACE FUNCTION log_user_action()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
    VALUES (
        COALESCE(current_setting('app.current_user_id', true), 'system'),
        TG_OP,
        TG_TABLE_NAME,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id::text
            ELSE NEW.id::text
        END,
        CASE 
            WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
            WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
            ELSE row_to_json(NEW)::jsonb
        END
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers
CREATE TRIGGER audit_users_changes
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_user_action();

-- Grant permissions to the application user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dbadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dbadmin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dbadmin;

-- Insert default users for development
-- Passwords: LuxeBags2024!, ItalianLeather2024!, CraftWorkshop2024!, LuxuryRetail2024!
INSERT INTO users (id, email, password, name, organization, role, fabric_user_id) VALUES
('admin-luxebags', 'admin@luxebags.com', 
 '$2a$10$ByGHzi2LqYzjD4x4Q1EBw.QwivKCgu0uSe/ZEBEkmsN73xZe9zr5.',
 'Admin User', 'luxebags', 'admin', 'Admin'),
('user1-luxebags', 'manager@luxebags.com',
 '$2a$10$ByGHzi2LqYzjD4x4Q1EBw.QwivKCgu0uSe/ZEBEkmsN73xZe9zr5.',
 'Brand Manager', 'luxebags', 'manager', 'User1'),
('admin-italianleather', 'admin@italianleather.com',
 '$2a$10$0LfSmC7J8.gfsOvtfY6IMOJUy4tMxMHZwZkxtsJioci2b719AVn62',
 'Supplier Admin', 'italianleather', 'admin', 'Admin'),
('ops-italianleather', 'operations@italianleather.com',
 '$2a$10$0LfSmC7J8.gfsOvtfY6IMOJUy4tMxMHZwZkxtsJioci2b719AVn62',
 'Operations Manager', 'italianleather', 'user', 'User1'),
('admin-craftworkshop', 'admin@craftworkshop.com',
 '$2a$10$.BE/HK6YMAjEmYWMs4DIguKNxHfXMiR4sk3rhleUgPOdVAidu.oJK',
 'Workshop Admin', 'craftworkshop', 'admin', 'Admin'),
('production-craftworkshop', 'production@craftworkshop.com',
 '$2a$10$.BE/HK6YMAjEmYWMs4DIguKNxHfXMiR4sk3rhleUgPOdVAidu.oJK',
 'Production Manager', 'craftworkshop', 'user', 'User1'),
('admin-luxuryretail', 'admin@luxuryretail.com',
 '$2a$10$ZIy4ywQTKGcQm.KOeVMhTe18TWDqSeOi4n5JCbGRMgF1h4tN4X6hq',
 'Retail Admin', 'luxuryretail', 'admin', 'Admin'),
('store-luxuryretail', 'store@luxuryretail.com',
 '$2a$10$ZIy4ywQTKGcQm.KOeVMhTe18TWDqSeOi4n5JCbGRMgF1h4tN4X6hq',
 'Store Manager', 'luxuryretail', 'user', 'User1')
ON CONFLICT (id) DO NOTHING;