import type { Appointment } from "../models/appointment";
import type { Call } from "../models/call";
import type { CallEvent } from "../models/callEvent";
import type { ConversationStateRecord } from "../models/conversationState";
import type { Doctor, WorkingHours } from "../models/doctor";
import type { Patient } from "../models/patient";

type PatientRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  preferred_language: string;
  created_at: Date;
  updated_at: Date;
};

type DoctorRow = {
  id: string;
  name: string;
  specialization: string;
  department: string;
  gender: string | null;
  availability_status: Doctor["availabilityStatus"];
  working_hours: WorkingHours;
  created_at: Date;
  updated_at: Date;
};

type AppointmentRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  status: Appointment["status"];
  created_at: Date;
  updated_at: Date;
};

type CallRow = {
  id: string;
  caller_number: string;
  language: string;
  start_time: Date;
  end_time: Date | null;
  status: Call["status"];
  created_at: Date;
};

type ConversationStateRow = {
  id: string;
  call_id: string;
  current_state: ConversationStateRecord["currentState"];
  language: string;
  intent: string | null;
  timestamp: Date;
};

type CallEventRow = {
  id: string;
  call_id: string;
  event_type: CallEvent["eventType"];
  timestamp: Date;
  metadata: Record<string, unknown>;
};

export function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    preferredLanguage: row.preferred_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDoctor(row: DoctorRow): Doctor {
  return {
    id: row.id,
    name: row.name,
    specialization: row.specialization,
    department: row.department,
    gender: row.gender,
    availabilityStatus: row.availability_status,
    workingHours: row.working_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    appointmentDate: formatPgDate(row.appointment_date),
    appointmentTime: formatPgTime(row.appointment_time),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatPgDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return String(value).slice(0, 10);
}

function formatPgTime(value: string | Date): string {
  if (value instanceof Date) {
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    const s = String(value.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  const raw = String(value);
  if (/^\d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 8);
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw.slice(0, 8);
}

export function toCall(row: CallRow): Call {
  return {
    id: row.id,
    callerNumber: row.caller_number,
    language: row.language,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function toConversationState(row: ConversationStateRow): ConversationStateRecord {
  return {
    id: row.id,
    callId: row.call_id,
    currentState: row.current_state,
    language: row.language,
    intent: row.intent,
    timestamp: row.timestamp,
  };
}

export function toCallEvent(row: CallEventRow): CallEvent {
  return {
    id: row.id,
    callId: row.call_id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    metadata: row.metadata,
  };
}
