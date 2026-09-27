import { appointmentRepository } from "../repositories/appointmentRepository";
import { patientRepository } from "../repositories/patientRepository";
import type { Appointment } from "../models/appointment";
import { getAppointment } from "./appointmentLookupService";
import { ValidationError } from "../utils/errors";

export type CancelAppointmentInput = {
  /** Preferred: cancel a single known appointment. */
  appointmentId?: string | null;
  /** Required — must own the appointment (identity check). */
  patientId: string;
  /** Optional criteria when appointmentId omitted (must resolve to one row). */
  doctorId?: string | null;
  appointmentDate?: string | null;
  /** Must be true; omitted/false never mutates (KAN-70 / SRD §8). */
  confirmed?: boolean | null;
};

export type CancelAppointmentResult =
  | {
      outcome: "cancelled";
      appointment: Appointment;
      message: string;
    }
  | {
      outcome: "needs_confirmation";
      appointment: Appointment | null;
      message: string;
    }
  | {
      outcome: "not_found";
      appointment: null;
      message: string;
    }
  | {
      outcome: "multiple_matches";
      appointment: null;
      appointments: Appointment[];
      message: string;
    }
  | {
      outcome: "already_cancelled";
      appointment: Appointment;
      message: string;
    }
  | {
      outcome: "not_permitted";
      appointment: Appointment | null;
      message: string;
    }
  | {
      outcome: "failed";
      appointment: null;
      message: string;
    };

/**
 * POC cancellation policy (KAN-70): only SCHEDULED appointments may be cancelled.
 * COMPLETED / RESCHEDULED → not_permitted. Already CANCELLED → already_cancelled.
 */
export function evaluateCancelPolicy(appointment: Appointment): "ok" | "already_cancelled" | "not_permitted" {
  if (appointment.status === "CANCELLED") return "already_cancelled";
  if (appointment.status === "SCHEDULED") return "ok";
  return "not_permitted";
}

/**
 * Cancel one resolved appointment after identity + policy + confirmation (KAN-70).
 * Reject branches leave the row unchanged. Never claims cancelled on write failure.
 */
export async function cancelAppointment(
  input: CancelAppointmentInput,
): Promise<CancelAppointmentResult> {
  const patientId = input.patientId?.trim() || "";
  if (!patientId) {
    throw new ValidationError("patientId is required to cancel an appointment");
  }

  const patient = await patientRepository.findById(patientId);
  if (!patient) {
    throw new ValidationError("Patient not found");
  }

  const lookup = await getAppointment({
    appointmentId: input.appointmentId,
    patientId: input.appointmentId ? undefined : patientId,
    doctorId: input.doctorId,
    appointmentDate: input.appointmentDate,
    statuses: input.appointmentId ? undefined : ["SCHEDULED", "CANCELLED", "COMPLETED", "RESCHEDULED"],
  });

  if (lookup.outcome === "not_found") {
    return {
      outcome: "not_found",
      appointment: null,
      message: "Appointment not found",
    };
  }

  if (lookup.outcome === "multiple_matches") {
    return {
      outcome: "multiple_matches",
      appointment: null,
      appointments: lookup.appointments,
      message: "Multiple appointments match; clarify which one to cancel",
    };
  }

  const appointment = lookup.appointment;

  if (appointment.patientId !== patientId) {
    return {
      outcome: "not_permitted",
      appointment: null,
      message: "Patient does not own this appointment",
    };
  }

  const policy = evaluateCancelPolicy(appointment);
  if (policy === "already_cancelled") {
    return {
      outcome: "already_cancelled",
      appointment,
      message: "Appointment is already cancelled",
    };
  }
  if (policy === "not_permitted") {
    return {
      outcome: "not_permitted",
      appointment,
      message: `Cancellation not permitted for status ${appointment.status}`,
    };
  }

  if (input.confirmed !== true) {
    return {
      outcome: "needs_confirmation",
      appointment,
      message: "Explicit confirmation is required before cancelling",
    };
  }

  try {
    const updated = await appointmentRepository.updateStatus(appointment.id, "CANCELLED");
    if (!updated || updated.status !== "CANCELLED") {
      return {
        outcome: "failed",
        appointment: null,
        message: "Cancel write did not persist; appointment not cancelled",
      };
    }
    return {
      outcome: "cancelled",
      appointment: updated,
      message: "Appointment cancelled",
    };
  } catch {
    return {
      outcome: "failed",
      appointment: null,
      message: "Database failure during cancel; appointment not cancelled",
    };
  }
}
