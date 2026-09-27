/**
 * Maps LLM tool calls to appointmentTools (KAN-111).
 * Fail-closed: unknown tools and thrown errors return error payloads — never invent success.
 */
import {
  bookAppointmentTool,
  cancelAppointmentTool,
  checkAvailabilityTool,
  getAppointmentTool,
  getPatientTool,
  resolveDateTimeTool,
  rescheduleAppointmentTool,
  searchDoctorTool,
} from "../tools/appointmentTools";
import type { PartOfDay } from "../services/dateTimeResolver";

export type AppointmentToolCallInput = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AppointmentToolExecution = {
  name: string;
  result: unknown;
  ok: boolean;
};

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function asPartOfDay(value: unknown): PartOfDay {
  if (value === "morning" || value === "afternoon" || value === "evening" || value === "any") {
    return value;
  }
  return "any";
}

function windowFromArgs(raw: unknown): {
  date: string;
  timeStart: string;
  timeEnd: string;
  partOfDay: PartOfDay;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  const date = asString(w.date);
  const timeStart = asString(w.timeStart);
  const timeEnd = asString(w.timeEnd);
  if (!date || !timeStart || !timeEnd) return null;
  return {
    date,
    timeStart,
    timeEnd,
    partOfDay: asPartOfDay(w.partOfDay),
  };
}

export async function executeAppointmentToolCall(
  call: AppointmentToolCallInput,
  options: { callId?: string | null } = {},
): Promise<AppointmentToolExecution> {
  const name = call.name.trim();
  const args = call.arguments ?? {};
  const callId = options.callId;

  try {
    switch (name) {
      case "identify_patient":
      case "get_patient": {
        const result = await getPatientTool({
          phone: asString(args.phone),
          name: asString(args.name),
          preferredLanguage: asString(args.preferredLanguage),
        });
        return { name, result, ok: true };
      }
      case "search_doctor": {
        const result = await searchDoctorTool({
          name: asString(args.name),
          specialization: asString(args.specialization),
          specialty: asString(args.specialty),
          department: asString(args.department),
          gender: asString(args.gender),
        });
        return { name, result, ok: true };
      }
      case "resolve_datetime": {
        const phrase = asString(args.phrase);
        if (!phrase) {
          return {
            name,
            ok: false,
            result: { error: { code: "VALIDATION_ERROR", message: "phrase is required" } },
          };
        }
        const result = resolveDateTimeTool(phrase);
        return { name, result, ok: true };
      }
      case "check_availability": {
        const doctorId = asString(args.doctorId);
        const window = windowFromArgs(args.window);
        if (!doctorId || !window) {
          return {
            name,
            ok: false,
            result: {
              error: {
                code: "VALIDATION_ERROR",
                message: "doctorId and window.date/timeStart/timeEnd are required",
              },
            },
          };
        }
        const result = await checkAvailabilityTool(
          {
            doctorId,
            window,
            slotMinutes: asNumber(args.slotMinutes),
            excludeAppointmentId: asString(args.excludeAppointmentId),
          },
          { callId },
        );
        return { name, result, ok: true };
      }
      case "get_appointment":
      case "lookup_appointment": {
        const result = await getAppointmentTool({
          appointmentId: asString(args.appointmentId),
          patientId: asString(args.patientId),
          doctorId: asString(args.doctorId),
          appointmentDate: asString(args.appointmentDate),
        });
        return { name, result, ok: true };
      }
      case "book_appointment": {
        const patientId = asString(args.patientId);
        const doctorId = asString(args.doctorId);
        const date = asString(args.date);
        const time = asString(args.time);
        if (!patientId || !doctorId || !date || !time) {
          return {
            name,
            ok: false,
            result: {
              error: {
                code: "VALIDATION_ERROR",
                message: "patientId, doctorId, date, and time are required",
              },
            },
          };
        }
        const result = await bookAppointmentTool(
          {
            patientId,
            doctorId,
            date,
            time,
            confirmed: asBoolean(args.confirmed) === true,
            slotMinutes: asNumber(args.slotMinutes),
          },
          { callId },
        );
        return { name, result, ok: true };
      }
      case "cancel_appointment": {
        const patientId = asString(args.patientId);
        if (!patientId) {
          return {
            name,
            ok: false,
            result: { error: { code: "VALIDATION_ERROR", message: "patientId is required" } },
          };
        }
        const result = await cancelAppointmentTool(
          {
            patientId,
            appointmentId: asString(args.appointmentId),
            doctorId: asString(args.doctorId),
            appointmentDate: asString(args.appointmentDate),
            confirmed: asBoolean(args.confirmed) === true,
          },
          { callId },
        );
        return { name, result, ok: true };
      }
      case "reschedule_appointment": {
        const appointmentId = asString(args.appointmentId);
        const patientId = asString(args.patientId);
        const date = asString(args.date);
        const time = asString(args.time);
        if (!appointmentId || !patientId || !date || !time) {
          return {
            name,
            ok: false,
            result: {
              error: {
                code: "VALIDATION_ERROR",
                message: "appointmentId, patientId, date, and time are required",
              },
            },
          };
        }
        const result = await rescheduleAppointmentTool(
          {
            appointmentId,
            patientId,
            date,
            time,
            confirmed: asBoolean(args.confirmed) === true,
            slotMinutes: asNumber(args.slotMinutes),
          },
          { callId },
        );
        return { name, result, ok: true };
      }
      default:
        return {
          name,
          ok: false,
          result: {
            error: {
              code: "UNKNOWN_TOOL",
              message: `Unknown tool "${name}". Do not invent results.`,
            },
          },
        };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Appointment tool failed before completion";
    return {
      name,
      ok: false,
      result: {
        error: {
          code:
            typeof error === "object" && error !== null && "code" in error
              ? String((error as { code: unknown }).code)
              : "TOOL_FAILED",
          message,
        },
      },
    };
  }
}
