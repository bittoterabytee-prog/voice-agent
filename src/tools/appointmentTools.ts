import {
  getPatient,
  identifyPatient,
  type IdentifyPatientInput,
  type IdentifyPatientResult,
} from "../services/patientService";

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

export { identifyPatient, getPatient };
export type { IdentifyPatientInput, IdentifyPatientResult };
