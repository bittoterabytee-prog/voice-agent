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
import {
  checkAvailability,
  type CheckAvailabilityInput,
  type CheckAvailabilityResult,
} from "../services/availabilityService";

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

/** SRD checkAvailability (KAN-67) — working_hours minus SCHEDULED; never invent slots. */
export async function checkAvailabilityTool(
  input: CheckAvailabilityInput,
): Promise<CheckAvailabilityResult> {
  return checkAvailability(input);
}

export { identifyPatient, getPatient, searchDoctor, resolveDateTime, checkAvailability };
export type {
  IdentifyPatientInput,
  IdentifyPatientResult,
  SearchDoctorInput,
  SearchDoctorResult,
  ResolveDateTimeResult,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
};
