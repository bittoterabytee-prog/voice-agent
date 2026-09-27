-- Sprint 4 (KAN-104): appointment-tool readiness gaps on top of 001_init.sql.
-- Prefer additive changes; do not edit 001_init.sql for databases that already applied it.
-- Statements are idempotent so parallel test workers / re-runs stay safe.

DO $$
BEGIN
  CREATE TYPE doctor_availability_status AS ENUM (
    'AVAILABLE',
    'ON_LEAVE',
    'UNAVAILABLE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS availability_status doctor_availability_status;

UPDATE doctors
SET availability_status = 'AVAILABLE'
WHERE availability_status IS NULL;

ALTER TABLE doctors
  ALTER COLUMN availability_status SET DEFAULT 'AVAILABLE';

UPDATE doctors
SET department = specialization
WHERE department IS NULL;

DO $$
BEGIN
  ALTER TABLE doctors ALTER COLUMN department SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE doctors ALTER COLUMN availability_status SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (name);
CREATE INDEX IF NOT EXISTS idx_doctors_department ON doctors (department);
CREATE INDEX IF NOT EXISTS idx_doctors_availability_status ON doctors (availability_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_doctor_slot_scheduled
  ON appointments (doctor_id, appointment_date, appointment_time)
  WHERE status = 'SCHEDULED';
