import { appointmentRepository } from "../repositories/appointmentRepository";
import type { Appointment } from "../models/appointment";
import type { AppointmentStatus } from "../models/enums";
import { ValidationError } from "../utils/errors";

export type GetAppointmentInput = {
  /** Direct id lookup. */
  appointmentId?: string | null;
  /** Required for criteria lookup when appointmentId is omitted. */
  patientId?: string | null;
  doctorId?: string | null;
  appointmentDate?: string | null;
  /**
   * Status filter for criteria lookup. Default: SCHEDULED only (upcoming/active).
   * Pass explicit statuses (e.g. include CANCELLED) when needed.
   */
  statuses?: AppointmentStatus[] | null;
};

export type GetAppointmentResult =
  | {
      outcome: "found";
      appointment: Appointment;
      appointments: Appointment[];
      /** True when the single match is SCHEDULED (usable for cancel/reschedule). */
      isActive: boolean;
      message: string;
    }
  | {
      outcome: "not_found";
      appointment: null;
      appointments: [];
      isActive: false;
      message: string;
    }
  | {
      outcome: "multiple_matches";
      appointment: null;
      appointments: Appointment[];
      isActive: false;
      message: string;
    };

function isActiveStatus(status: AppointmentStatus): boolean {
  return status === "SCHEDULED";
}

/**
 * SRD getAppointment (KAN-68): fetch by id or patient + criteria.
 * Read-only — never changes status. Outcomes: found | not_found | multiple_matches.
 */
export async function getAppointment(input: GetAppointmentInput): Promise<GetAppointmentResult> {
  const appointmentId = input.appointmentId?.trim() || "";
  const patientId = input.patientId?.trim() || "";
  const doctorId = input.doctorId?.trim() || "";
  const appointmentDate = input.appointmentDate?.trim() || "";

  if (appointmentId) {
    const row = await appointmentRepository.findById(appointmentId);
    if (!row) {
      return {
        outcome: "not_found",
        appointment: null,
        appointments: [],
        isActive: false,
        message: "Appointment not found",
      };
    }
    const active = isActiveStatus(row.status);
    return {
      outcome: "found",
      appointment: row,
      appointments: [row],
      isActive: active,
      message: active
        ? "Appointment found"
        : `Appointment found with status ${row.status} (not active)`,
    };
  }

  if (!patientId) {
    throw new ValidationError("Provide appointmentId or patientId to look up appointments");
  }

  const statuses =
    input.statuses && input.statuses.length > 0 ? input.statuses : (["SCHEDULED"] as AppointmentStatus[]);

  const matches = await appointmentRepository.listByCriteria({
    patientId,
    doctorId: doctorId || undefined,
    appointmentDate: appointmentDate || undefined,
    statuses,
  });

  if (matches.length === 0) {
    return {
      outcome: "not_found",
      appointment: null,
      appointments: [],
      isActive: false,
      message: "No appointments match the criteria",
    };
  }

  if (matches.length === 1) {
    const row = matches[0];
    const active = isActiveStatus(row.status);
    return {
      outcome: "found",
      appointment: row,
      appointments: matches,
      isActive: active,
      message: active
        ? "Appointment found"
        : `Appointment found with status ${row.status} (not active)`,
    };
  }

  return {
    outcome: "multiple_matches",
    appointment: null,
    appointments: matches,
    isActive: false,
    message: `${matches.length} appointments match; ask the user to clarify`,
  };
}
