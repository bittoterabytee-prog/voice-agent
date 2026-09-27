import {
  getPatient,
  identifyPatient,
  type IdentifyPatientInput,
  type IdentifyPatientResult,
} from "../services/patientService";
import { searchDoctor, type SearchDoctorInput, type SearchDoctorResult } from "../services/doctorService";
import {
  resolveDateTime,
  type ResolveDateTimeResult,
} from "../services/dateTimeResolver";

export type AppointmentLookupInput = {
  patientName: string;
  date?: string;
};

export type AppointmentLookupResult = {
  found: boolean;
  message: string;
};

export async function lookupAppointment(
  input: AppointmentLookupInput,
): Promise<AppointmentLookupResult> {
  return {
    found: false,
    message: `Appointment lookup is not connected yet for ${input.patientName}`,
  };
}

/**
 * SRD getPatient for browser POC (KAN-64): ask for phone (no ANI).
 * Multi-patient per phone; register when phone unknown (and name provided).
 */
export async function getPatientTool(input: IdentifyPatientInput): Promise<IdentifyPatientResult> {
  return identifyPatient(input);
}

/** SRD searchDoctor (KAN-65) — PostgreSQL only; never invents doctors. */
export async function searchDoctorTool(input: SearchDoctorInput): Promise<SearchDoctorResult> {
  return searchDoctor(input);
}

/** SRD date/time understanding (KAN-66) — clarify when ambiguous; never invent a slot. */
export function resolveDateTimeTool(
  phrase: string,
  now: Date = new Date(),
): ResolveDateTimeResult {
  return resolveDateTime(phrase, now);
}

export { identifyPatient, getPatient, searchDoctor, resolveDateTime };
export type {
  IdentifyPatientInput,
  IdentifyPatientResult,
  SearchDoctorInput,
  SearchDoctorResult,
  ResolveDateTimeResult,
};
