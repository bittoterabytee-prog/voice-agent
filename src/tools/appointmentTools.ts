import { getPatient, type GetPatientInput, type GetPatientResult } from "../services/patientService";

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

/** SRD tool: getPatient() — phone and/or name; never invents or inserts patients (KAN-64). */
export async function getPatientTool(input: GetPatientInput): Promise<GetPatientResult> {
  return getPatient(input);
}

export type { GetPatientInput, GetPatientResult };
