CREATE TYPE appointment_status AS ENUM (
  'SCHEDULED',
  'CANCELLED',
  'COMPLETED',
  'RESCHEDULED'
);

CREATE TYPE call_status AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'TRANSFERRED'
);

CREATE TYPE conversation_state_name AS ENUM (
  'ACTIVE_CONVERSATION',
  'USER_REQUESTED_WAIT',
  'WAITING_FOR_USER',
  'CALLER_RETURNED',
  'HUMAN_HANDOFF',
  'CALL_COMPLETED'
);

CREATE TYPE call_event_type AS ENUM (
  'CALL_STARTED',
  'USER_SPEECH',
  'AGENT_RESPONSE',
  'LANGUAGE_CHANGED',
  'INTERRUPTION',
  'WAIT_STARTED',
  'CALLER_RETURNED',
  'TOOL_CALLED',
  'TOOL_FAILED',
  'HUMAN_HANDOFF',
  'CALL_ENDED'
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patients_phone_unique UNIQUE (phone)
);

CREATE TABLE doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients (id),
  doctor_id UUID NOT NULL REFERENCES doctors (id),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  status appointment_status NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_number TEXT NOT NULL,
  language TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status call_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE conversation_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL UNIQUE REFERENCES calls (id) ON DELETE CASCADE,
  current_state conversation_state_name NOT NULL,
  language TEXT NOT NULL,
  intent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  event_type call_event_type NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_patients_phone ON patients (phone);
CREATE INDEX idx_doctors_specialization ON doctors (specialization);
CREATE INDEX idx_appointments_patient_id ON appointments (patient_id);
CREATE INDEX idx_appointments_doctor_id ON appointments (doctor_id);
CREATE INDEX idx_appointments_doctor_date ON appointments (doctor_id, appointment_date);
CREATE INDEX idx_appointments_status ON appointments (status);
CREATE INDEX idx_calls_caller_number ON calls (caller_number);
CREATE INDEX idx_calls_status ON calls (status);
CREATE INDEX idx_conversation_states_call_id ON conversation_states (call_id);
CREATE INDEX idx_call_events_call_id ON call_events (call_id);
CREATE INDEX idx_call_events_call_timestamp ON call_events (call_id, timestamp);
