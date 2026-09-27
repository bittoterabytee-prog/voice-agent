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
import {
  getAppointment,
  type GetAppointmentInput,
  type GetAppointmentResult,
} from "../services/appointmentLookupService";
import {
  bookAppointment,
  sendConfirmation,
  type BookAppointmentInput,
  type BookAppointmentResult,
} from "../services/bookingService";
import {
  cancelAppointment,
  type CancelAppointmentInput,
  type CancelAppointmentResult,
} from "../services/cancelService";
import {
  rescheduleAppointment,
  type RescheduleAppointmentInput,
  type RescheduleAppointmentResult,
} from "../services/rescheduleService";
import {
  runLoggedAppointmentTool,
  type AppointmentToolContext,
} from "../services/appointmentToolLogger";

export type AppointmentLookupInput = {
  patientName: string;
  date?: string;
};

export type AppointmentLookupResult = {
  found: boolean;
  message: string;
};

/** @deprecated Prefer getAppointmentTool (KAN-68). */
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

/** SRD checkAvailability (KAN-67) — logs TOOL_CALLED when ctx.callId set (KAN-73). */
export async function checkAvailabilityTool(
  input: CheckAvailabilityInput,
  ctx?: AppointmentToolContext,
): Promise<CheckAvailabilityResult> {
  return runLoggedAppointmentTool({ tool: "checkAvailability", callId: ctx?.callId }, () =>
    checkAvailability(input),
  );
}

/** SRD getAppointment (KAN-68) — read-only lookup; never changes status. */
export async function getAppointmentTool(
  input: GetAppointmentInput,
): Promise<GetAppointmentResult> {
  return getAppointment(input);
}

/** SRD bookAppointment (KAN-69) — logs success/failure call_events when ctx.callId set (KAN-73). */
export async function bookAppointmentTool(
  input: BookAppointmentInput,
  ctx?: AppointmentToolContext,
): Promise<BookAppointmentResult> {
  return runLoggedAppointmentTool({ tool: "bookAppointment", callId: ctx?.callId }, () =>
    bookAppointment(input),
  );
}

/** SRD cancelAppointment (KAN-70) — logs success/failure call_events when ctx.callId set (KAN-73). */
export async function cancelAppointmentTool(
  input: CancelAppointmentInput,
  ctx?: AppointmentToolContext,
): Promise<CancelAppointmentResult> {
  return runLoggedAppointmentTool({ tool: "cancelAppointment", callId: ctx?.callId }, () =>
    cancelAppointment(input),
  );
}

/** SRD rescheduleAppointment (KAN-71) — logs success/failure call_events when ctx.callId set (KAN-73). */
export async function rescheduleAppointmentTool(
  input: RescheduleAppointmentInput,
  ctx?: AppointmentToolContext,
): Promise<RescheduleAppointmentResult> {
  return runLoggedAppointmentTool({ tool: "rescheduleAppointment", callId: ctx?.callId }, () =>
    rescheduleAppointment(input),
  );
}

export {
  identifyPatient,
  getPatient,
  searchDoctor,
  resolveDateTime,
  checkAvailability,
  getAppointment,
  bookAppointment,
  sendConfirmation,
  cancelAppointment,
  rescheduleAppointment,
  runLoggedAppointmentTool,
};
export type {
  IdentifyPatientInput,
  IdentifyPatientResult,
  SearchDoctorInput,
  SearchDoctorResult,
  ResolveDateTimeResult,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  GetAppointmentInput,
  GetAppointmentResult,
  BookAppointmentInput,
  BookAppointmentResult,
  CancelAppointmentInput,
  CancelAppointmentResult,
  RescheduleAppointmentInput,
  RescheduleAppointmentResult,
  AppointmentToolContext,
};
