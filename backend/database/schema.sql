-- User table schema for production
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    organization VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    fabric_user_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    INDEX idx_email (email),
    INDEX idx_organization (organization)
);

-- Sessions table for JWT token management
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_token (token_hash),
    INDEX idx_expires (expires_at)
);

-- Audit log for security
CREATE TABLE auth_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    event_type VARCHAR(50) NOT NULL, -- login_success, login_failed, logout, password_change
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_event (user_id, event_type),
    INDEX idx_created (created_at)
);

-- Insert default users (passwords are bcrypt hashed)
INSERT INTO users (id, email, password_hash, name, organization, role, fabric_user_id) VALUES
-- LuxeBags
('admin-luxebags', 'admin@luxebags.com', '$2a$10$XK1.PmfTr0YJaZ0G9jXWaOLbE4FCpD0dUhL4SdGsAxAKm8V7jqvzG', 'Admin User', 'luxebags', 'admin', 'admin'),
('manager-luxebags', 'manager@luxebags.com', '$2a$10$XK1.PmfTr0YJaZ0G9jXWaOLbE4FCpD0dUhL4SdGsAxAKm8V7jqvzG', 'Brand Manager', 'luxebags', 'manager', 'user1'),

-- Italian Leather
('admin-italianleather', 'admin@italianleather.com', '$2a$10$YhPxLr.3Cxz/6xUZ6xNKze4fEJDvXjK0EcKhXPO8bQqR5VD5BmVMq', 'Supplier Admin', 'italianleather', 'admin', 'admin'),
('ops-italianleather', 'operations@italianleather.com', '$2a$10$YhPxLr.3Cxz/6xUZ6xNKze4fEJDvXjK0EcKhXPO8bQqR5VD5BmVMq', 'Operations Manager', 'italianleather', 'user', 'user1'),

-- Craft Workshop
('admin-craftworkshop', 'admin@craftworkshop.com', '$2a$10$vCYBhJmG9.OPQGpD7bKFaO/YxF0dH.vLXCQU8N5UXFbJMJHNVGXRa', 'Workshop Admin', 'craftworkshop', 'admin', 'admin'),
('production-craftworkshop', 'production@craftworkshop.com', '$2a$10$vCYBhJmG9.OPQGpD7bKFaO/YxF0dH.vLXCQU8N5UXFbJMJHNVGXRa', 'Production Manager', 'craftworkshop', 'user', 'user1'),

-- Luxury Retail
('admin-luxuryretail', 'admin@luxuryretail.com', '$2a$10$kNX5hQcM3CmY5.xTXNLqeOdOO1gGQHPGnWyGnCEcKUbRGKxT3W3Bq', 'Retail Admin', 'luxuryretail', 'admin', 'admin'),
('store-luxuryretail', 'store@luxuryretail.com', '$2a$10$kNX5hQcM3CmY5.xTXNLqeOdOO1gGQHPGnWyGnCEcKUbRGKxT3W3Bq', 'Store Manager', 'luxuryretail', 'user', 'user1');