-- =============================================
-- V4 SCHEMA MIGRATION
-- Adds payment_link, payment_instructions, and timezone to property_configurations
-- =============================================

-- Add payment_link field (optional - owner's payment URL/instructions)
ALTER TABLE property_configurations
ADD COLUMN IF NOT EXISTS payment_link TEXT;

-- Add payment_instructions field (for bank transfer details, etc.)
ALTER TABLE property_configurations
ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

-- Add timezone field if not exists (IANA timezone format, e.g., 'Asia/Manila')
ALTER TABLE property_configurations
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Manila';

-- Add weekend_price if not exists (for proper pricing calculation)
ALTER TABLE property_configurations
ADD COLUMN IF NOT EXISTS weekend_price DECIMAL(10,2);

-- Update existing rows to have default timezone if null
UPDATE property_configurations
SET timezone = 'Asia/Manila'
WHERE timezone IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN property_configurations.payment_link IS 'Owner payment link (GCash, Maya, PayPal, etc.) - optional';
COMMENT ON COLUMN property_configurations.payment_instructions IS 'Payment instructions text for guests when no link available';
COMMENT ON COLUMN property_configurations.timezone IS 'Property timezone in IANA format (e.g., Asia/Manila, America/New_York)';
