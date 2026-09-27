import { appointmentRepository } from "../repositories/appointmentRepository";
import { doctorRepository } from "../repositories/doctorRepository";
import type { Doctor, WorkingHours } from "../models/doctor";
import type { ResolvedTimeWindow } from "./dateTimeResolver";
import { ValidationError } from "../utils/errors";

export type AvailabilitySlot = {
  date: string;
  time: string;
};

export type CheckAvailabilityInput = {
  doctorId: string;
  /** Resolved window from resolveDateTime (KAN-66). */
  window: ResolvedTimeWindow;
  /** Slot length in minutes (default 30). */
  slotMinutes?: number;
};

export type CheckAvailabilityResult = {
  outcome: "available" | "empty" | "unavailable";
  doctorId: string;
  date: string;
  slots: AvailabilitySlot[];
  /** Suggested real open slots on nearby days when the requested window is empty. */
  alternatives: AvailabilitySlot[];
  message: string;
};

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const SLOT_MINUTES_DEFAULT = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toSeconds(hhmmss: string): number {
  const parts = hhmmss.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h * 3600 + m * 60 + s;
}

function fromSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function normalizeHhmm(value: string): string {
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function weekdayKey(dateYmd: string): (typeof WEEKDAY_KEYS)[number] {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_KEYS[dow];
}

function addCalendarDays(dateYmd: string, days: number): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function hoursForDay(workingHours: WorkingHours, dateYmd: string): { start: string; end: string } | null {
  const key = weekdayKey(dateYmd);
  const entry = workingHours[key];
  if (!entry?.start || !entry?.end) return null;
  return { start: normalizeHhmm(entry.start), end: normalizeHhmm(entry.end) };
}

function buildCandidateSlots(
  dateYmd: string,
  workStart: string,
  workEnd: string,
  windowStart: string,
  windowEnd: string,
  slotMinutes: number,
): AvailabilitySlot[] {
  const start = Math.max(toSeconds(workStart), toSeconds(windowStart));
  const end = Math.min(toSeconds(workEnd), toSeconds(windowEnd));
  const step = slotMinutes * 60;
  const slots: AvailabilitySlot[] = [];
  for (let t = start; t + step <= end; t += step) {
    slots.push({ date: dateYmd, time: fromSeconds(t) });
  }
  return slots;
}

function subtractBooked(slots: AvailabilitySlot[], bookedTimes: Set<string>): AvailabilitySlot[] {
  return slots.filter((slot) => {
    const normalized = normalizeHhmm(slot.time);
    const hhmm = normalized.slice(0, 5);
    return !bookedTimes.has(normalized) && !bookedTimes.has(`${hhmm}:00`) && !bookedTimes.has(hhmm);
  });
}

async function openSlotsForDay(
  doctor: Doctor,
  dateYmd: string,
  windowStart: string,
  windowEnd: string,
  slotMinutes: number,
): Promise<AvailabilitySlot[]> {
  if (doctor.availabilityStatus !== "AVAILABLE") {
    return [];
  }
  const hours = hoursForDay(doctor.workingHours, dateYmd);
  if (!hours) return [];

  const candidates = buildCandidateSlots(
    dateYmd,
    hours.start,
    hours.end,
    windowStart,
    windowEnd,
    slotMinutes,
  );
  const booked = await appointmentRepository.listScheduledByDoctorDate(doctor.id, dateYmd);
  const bookedTimes = new Set(booked.map((a) => normalizeHhmm(a.appointmentTime)));
  return subtractBooked(candidates, bookedTimes);
}

/**
 * Real availability only: working_hours ∩ requested window − SCHEDULED appointments (KAN-67).
 * Never invents slots. Empty windows return alternatives from nearby working days.
 */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<CheckAvailabilityResult> {
  if (!input.doctorId?.trim()) {
    throw new ValidationError("doctorId is required to check availability");
  }
  if (!input.window?.date || !input.window.timeStart || !input.window.timeEnd) {
    throw new ValidationError("A resolved date/time window is required");
  }

  const doctor = await doctorRepository.findById(input.doctorId);
  if (!doctor) {
    throw new ValidationError("Doctor not found");
  }

  const slotMinutes = input.slotMinutes ?? SLOT_MINUTES_DEFAULT;
  const date = input.window.date;

  if (doctor.availabilityStatus !== "AVAILABLE") {
    return {
      outcome: "unavailable",
      doctorId: doctor.id,
      date,
      slots: [],
      alternatives: [],
      message: `Doctor is ${doctor.availabilityStatus.toLowerCase().replace("_", " ")}; no bookable slots`,
    };
  }

  const slots = await openSlotsForDay(
    doctor,
    date,
    normalizeHhmm(input.window.timeStart),
    normalizeHhmm(input.window.timeEnd),
    slotMinutes,
  );

  if (slots.length > 0) {
    return {
      outcome: "available",
      doctorId: doctor.id,
      date,
      slots,
      alternatives: [],
      message: `${slots.length} open slot(s) on ${date}`,
    };
  }

  // Alternatives: same part-of-day window on the next few working days (still real slots only).
  const alternatives: AvailabilitySlot[] = [];
  for (let offset = 1; offset <= 7 && alternatives.length < 6; offset += 1) {
    const altDate = addCalendarDays(date, offset);
    const daySlots = await openSlotsForDay(
      doctor,
      altDate,
      normalizeHhmm(input.window.timeStart),
      normalizeHhmm(input.window.timeEnd),
      slotMinutes,
    );
    for (const slot of daySlots) {
      if (alternatives.length >= 6) break;
      alternatives.push(slot);
    }
  }

  return {
    outcome: "empty",
    doctorId: doctor.id,
    date,
    slots: [],
    alternatives,
    message:
      alternatives.length > 0
        ? `No open slots on ${date}; offering nearby alternatives`
        : `No open slots on ${date} and no nearby alternatives within working hours`,
  };
}
