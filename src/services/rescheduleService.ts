import { appointmentRepository } from "../repositories/appointmentRepository";
import { patientRepository } from "../repositories/patientRepository";
import type { Appointment } from "../models/appointment";
import { getAppointment } from "./appointmentLookupService";
import { checkAvailability } from "./availabilityService";
import { ValidationError, isPostgresUniqueError } from "../utils/errors";

export type RescheduleAppointmentInput = {
  appointmentId: string;
  patientId: string;
  /** New slot to write (must be open via checkAvailability). */
  date: string;
  time: string;
  /** Must be true; omitted/false never mutates. */
  confirmed?: boolean | null;
  /**
   * Latest slot the user asked for in this turn.
   * If set and it differs from date/time, the candidate is stale (mid-flow change) — do not write.
   */
  latestRequestedDate?: string | null;
  latestRequestedTime?: string | null;
  slotMinutes?: number;
};

export type RescheduleAppointmentResult =
  | {
      outcome: "rescheduled";
      appointment: Appointment;
      previous: { date: string; time: string };
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
      outcome: "not_permitted";
      appointment: Appointment | null;
      message: string;
    }
  | {
      outcome: "slot_unavailable";
      appointment: Appointment;
      message: string;
    }
  | {
      outcome: "stale_candidate";
      appointment: Appointment;
      message: string;
    }
  | {
      outcome: "failed";
      appointment: Appointment | null;
      message: string;
    };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeHhmmss(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function addMinutesHhmmss(hhmmss: string, minutes: number): string {
  const parts = normalizeHhmmss(hhmmss).split(":").map(Number);
  const total = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0) + minutes * 60;
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/**
 * Move an existing SCHEDULED appointment to a new real slot (KAN-71).
 * Same row id; confirmation + checkAvailability required; stale candidates rejected.
 */
export async function rescheduleAppointment(
  input: RescheduleAppointmentInput,
): Promise<RescheduleAppointmentResult> {
  const appointmentId = input.appointmentId?.trim() || "";
  const patientId = input.patientId?.trim() || "";
  const date = input.date?.trim() || "";
  const time = input.time?.trim() ? normalizeHhmmss(input.time) : "";

  if (!appointmentId || !patientId || !date || !time) {
    throw new ValidationError(
      "appointmentId, patientId, date, and time are required to reschedule",
    );
  }

  const patient = await patientRepository.findById(patientId);
  if (!patient) {
    throw new ValidationError("Patient not found");
  }

  const lookup = await getAppointment({ appointmentId });
  if (lookup.outcome !== "found") {
    return {
      outcome: "not_found",
      appointment: null,
      message: "Appointment not found",
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
  if (appointment.status !== "SCHEDULED") {
    return {
      outcome: "not_permitted",
      appointment,
      message: `Reschedule not permitted for status ${appointment.status}`,
    };
  }

  const latestDate = input.latestRequestedDate?.trim() || "";
  const latestTime = input.latestRequestedTime?.trim()
    ? normalizeHhmmss(input.latestRequestedTime)
    : "";
  if (latestDate && latestTime && (latestDate !== date || latestTime !== time)) {
    return {
      outcome: "stale_candidate",
      appointment,
      message: "Requested time changed; discarded candidate was not written — re-check availability",
    };
  }

  if (input.confirmed !== true) {
    return {
      outcome: "needs_confirmation",
      appointment,
      message: "Explicit confirmation is required before rescheduling",
    };
  }

  const slotMinutes = input.slotMinutes ?? 30;
  const availability = await checkAvailability({
    doctorId: appointment.doctorId,
    window: {
      date,
      timeStart: time,
      timeEnd: addMinutesHhmmss(time, slotMinutes),
      partOfDay: "any",
    },
    slotMinutes,
    excludeAppointmentId: appointment.id,
  });

  const open = availability.slots.some(
    (s) => s.date === date && normalizeHhmmss(s.time) === time,
  );
  if (!open) {
    return {
      outcome: "slot_unavailable",
      appointment,
      message: "That slot was not returned by checkAvailability; original time unchanged",
    };
  }

  const previous = {
    date: appointment.appointmentDate,
    time: normalizeHhmmss(appointment.appointmentTime),
  };

  try {
    const updated = await appointmentRepository.updateSchedule(appointment.id, date, time);
    if (!updated) {
      return {
        outcome: "failed",
        appointment,
        message: "Reschedule write did not persist; original slot remains",
      };
    }
    return {
      outcome: "rescheduled",
      appointment: updated,
      previous,
      message: "Appointment rescheduled",
    };
  } catch (error) {
    if (isPostgresUniqueError(error)) {
      return {
        outcome: "failed",
        appointment,
        message: "Slot conflict during write; original slot remains",
      };
    }
    return {
      outcome: "failed",
      appointment,
      message: "Database failure during reschedule; original slot remains",
    };
  }
}
