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
    appointmentDate: String(row.appointment_date).slice(0, 10),
    appointmentTime: String(row.appointment_time).slice(0, 8),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
