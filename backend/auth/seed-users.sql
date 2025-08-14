-- Seed default users for development/testing
-- Run this after database initialization

-- Password for all users: LuxeBags2024! (hashed)
-- To generate new hash: SELECT crypt('YourPassword', gen_salt('bf'));

-- Clear existing users (optional - comment out in production)
TRUNCATE TABLE users CASCADE;

-- Insert default users with bcrypt hashed passwords
INSERT INTO users (id, email, password, name, organization, role, fabric_user_id) VALUES
-- LuxeBags (Brand Owner)
('admin-luxebags', 'admin@luxebags.com', 
 '$2a$10$ByGHzi2LqYzjD4x4Q1EBw.QwivKCgu0uSe/ZEBEkmsN73xZe9zr5.', -- LuxeBags2024!
 'Admin User', 'luxebags', 'admin', 'Admin'),
 
('user1-luxebags', 'manager@luxebags.com',
 '$2a$10$ByGHzi2LqYzjD4x4Q1EBw.QwivKCgu0uSe/ZEBEkmsN73xZe9zr5.', -- LuxeBags2024!
 'Brand Manager', 'luxebags', 'manager', 'User1'),

-- Italian Leather (Supplier)
('admin-italianleather', 'admin@italianleather.com',
 '$2a$10$0LfSmC7J8.gfsOvtfY6IMOJUy4tMxMHZwZkxtsJioci2b719AVn62', -- ItalianLeather2024!
 'Supplier Admin', 'italianleather', 'admin', 'Admin'),
 
('ops-italianleather', 'operations@italianleather.com',
 '$2a$10$0LfSmC7J8.gfsOvtfY6IMOJUy4tMxMHZwZkxtsJioci2b719AVn62', -- ItalianLeather2024!
 'Operations Manager', 'italianleather', 'user', 'User1'),

-- Craft Workshop (Manufacturer)
('admin-craftworkshop', 'admin@craftworkshop.com',
 '$2a$10$.BE/HK6YMAjEmYWMs4DIguKNxHfXMiR4sk3rhleUgPOdVAidu.oJK', -- CraftWorkshop2024!
 'Workshop Admin', 'craftworkshop', 'admin', 'Admin'),
 
('production-craftworkshop', 'production@craftworkshop.com',
 '$2a$10$.BE/HK6YMAjEmYWMs4DIguKNxHfXMiR4sk3rhleUgPOdVAidu.oJK', -- CraftWorkshop2024!
 'Production Manager', 'craftworkshop', 'user', 'User1'),

-- Luxury Retail (Retailer)
('admin-luxuryretail', 'admin@luxuryretail.com',
 '$2a$10$ZIy4ywQTKGcQm.KOeVMhTe18TWDqSeOi4n5JCbGRMgF1h4tN4X6hq', -- LuxuryRetail2024!
 'Retail Admin', 'luxuryretail', 'admin', 'Admin'),
 
('store-luxuryretail', 'store@luxuryretail.com',
 '$2a$10$ZIy4ywQTKGcQm.KOeVMhTe18TWDqSeOi4n5JCbGRMgF1h4tN4X6hq', -- LuxuryRetail2024!
 'Store Manager', 'luxuryretail', 'user', 'User1')

ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password = EXCLUDED.password,
  name = EXCLUDED.name,
  organization = EXCLUDED.organization,
  role = EXCLUDED.role,
  fabric_user_id = EXCLUDED.fabric_user_id,
  updated_at = CURRENT_TIMESTAMP;

-- Verify users were created
SELECT id, email, name, organization, role FROM users ORDER BY organization, role;