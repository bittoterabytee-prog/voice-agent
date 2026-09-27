-- KAN-64: one phone number may belong to multiple patients (POC asks for phone; no ANI).
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_phone_unique;
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients (phone);
