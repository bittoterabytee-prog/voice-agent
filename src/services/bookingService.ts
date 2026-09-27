import { appointmentRepository } from "../repositories/appointmentRepository";
import { doctorRepository } from "../repositories/doctorRepository";
import { patientRepository } from "../repositories/patientRepository";
import type { Appointment } from "../models/appointment";
import type { Doctor } from "../models/doctor";
import type { Patient } from "../models/patient";
import { checkAvailability } from "./availabilityService";
import {
  InvalidRelationshipError,
  ValidationError,
  isPostgresUniqueError,
} from "../utils/errors";

export type BookAppointmentInput = {
  patientId: string;
  doctorId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM or HH:MM:SS — must be a slot returned by checkAvailability */
  time: string;
  /** Must be true; omitted/false never writes (KAN-69 / SRD §8). */
  confirmed?: boolean | null;
  /** Slot length used when verifying availability (default 30). */
  slotMinutes?: number;
};

export type BookAppointmentConfirmation = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  status: Appointment["status"];
};

export type BookAppointmentResult =
  | {
      outcome: "booked";
      appointment: Appointment;
      patient: Patient;
      doctor: Doctor;
      confirmation: BookAppointmentConfirmation;
      message: string;
    }
  | {
      outcome: "needs_confirmation";
      appointment: null;
      confirmation: null;
      message: string;
    }
  | {
      outcome: "slot_unavailable";
      appointment: null;
      confirmation: null;
      message: string;
    }
  | {
      outcome: "failed";
      appointment: null;
      confirmation: null;
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
 * Optional notification hook after a successful write (KAN-69 stub).
 * Never throws; real SMS/email belongs in a later ticket.
 */
export async function sendConfirmation(
  confirmation: BookAppointmentConfirmation,
): Promise<{ sent: false; stub: true; appointmentId: string }> {
  return { sent: false, stub: true, appointmentId: confirmation.appointmentId };
}

/**
 * Persist appointment only after explicit confirmation + real open slot (KAN-69).
 * Never claims success when the write fails.
 */
export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  const patientId = input.patientId?.trim() || "";
  const doctorId = input.doctorId?.trim() || "";
  const date = input.date?.trim() || "";
  const time = input.time?.trim() ? normalizeHhmmss(input.time) : "";

  if (!patientId || !doctorId || !date || !time) {
    throw new ValidationError("patientId, doctorId, date, and time are required to book");
  }

  if (input.confirmed !== true) {
    return {
      outcome: "needs_confirmation",
      appointment: null,
      confirmation: null,
      message: "Explicit confirmation is required before booking",
    };
  }

  const patient = await patientRepository.findById(patientId);
  if (!patient) {
    throw new ValidationError("Patient not found");
  }
  const doctor = await doctorRepository.findById(doctorId);
  if (!doctor) {
    throw new ValidationError("Doctor not found");
  }

  const slotMinutes = input.slotMinutes ?? 30;
  const availability = await checkAvailability({
    doctorId,
    window: {
      date,
      timeStart: time,
      timeEnd: addMinutesHhmmss(time, slotMinutes),
      partOfDay: "any",
    },
    slotMinutes,
  });

  const open = availability.slots.some(
    (s) => s.date === date && normalizeHhmmss(s.time) === time,
  );
  if (!open) {
    return {
      outcome: "slot_unavailable",
      appointment: null,
      confirmation: null,
      message: "That slot was not returned by checkAvailability; booking rejected",
    };
  }

  try {
    const appointment = await appointmentRepository.create({
      patientId,
      doctorId,
      appointmentDate: date,
      appointmentTime: time,
      status: "SCHEDULED",
    });

    const confirmation: BookAppointmentConfirmation = {
      appointmentId: appointment.id,
      patientId: patient.id,
      doctorId: doctor.id,
      doctorName: doctor.name,
      date: appointment.appointmentDate,
      time: normalizeHhmmss(appointment.appointmentTime),
      status: appointment.status,
    };

    await sendConfirmation(confirmation);

    return {
      outcome: "booked",
      appointment,
      patient,
      doctor,
      confirmation,
      message: "Appointment booked",
    };
  } catch (error) {
    if (error instanceof InvalidRelationshipError) {
      return {
        outcome: "failed",
        appointment: null,
        confirmation: null,
        message: error.message,
      };
    }
    if (isPostgresUniqueError(error)) {
      return {
        outcome: "failed",
        appointment: null,
        confirmation: null,
        message: "Slot was taken before write completed; booking failed",
      };
    }
    throw error;
  }
}
