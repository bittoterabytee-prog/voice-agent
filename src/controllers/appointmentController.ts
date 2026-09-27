import type { Request, Response, NextFunction } from "express";
import {
  getPatientTool,
  searchDoctorTool,
  resolveDateTimeTool,
  checkAvailabilityTool,
  getAppointmentTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
} from "../tools/appointmentTools";
import { ValidationError } from "../utils/errors";

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`);
  }
  return value.trim();
}

function optionalCallId(body: Record<string, unknown>): string | undefined {
  return optionalString(body.callId, "callId");
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body === null || body === undefined) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("JSON body must be an object");
  }
  return body as Record<string, unknown>;
}

/** POST /api/appointments/patients/identify */
export async function identifyPatientHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const result = await getPatientTool({
      phone: optionalString(body.phone, "phone"),
      name: optionalString(body.name, "name"),
      preferredLanguage: optionalString(body.preferredLanguage, "preferredLanguage"),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/doctors/search */
export async function searchDoctorHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const result = await searchDoctorTool({
      name: optionalString(body.name, "name"),
      specialization: optionalString(body.specialization, "specialization"),
      specialty: optionalString(body.specialty, "specialty"),
      department: optionalString(body.department, "department"),
      gender: optionalString(body.gender, "gender"),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/datetime/resolve */
export async function resolveDateTimeHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const phrase = optionalString(body.phrase, "phrase");
    if (!phrase) {
      throw new ValidationError("phrase is required");
    }
    const result = resolveDateTimeTool(phrase);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/availability */
export async function checkAvailabilityHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const doctorId = optionalString(body.doctorId, "doctorId");
    if (!doctorId) {
      throw new ValidationError("doctorId is required");
    }
    const windowRaw = body.window;
    if (!windowRaw || typeof windowRaw !== "object" || Array.isArray(windowRaw)) {
      throw new ValidationError("window object is required");
    }
    const window = windowRaw as Record<string, unknown>;
    const date = optionalString(window.date, "window.date");
    const timeStart = optionalString(window.timeStart, "window.timeStart");
    const timeEnd = optionalString(window.timeEnd, "window.timeEnd");
    if (!date || !timeStart || !timeEnd) {
      throw new ValidationError("window.date, window.timeStart, and window.timeEnd are required");
    }
    const partOfDayRaw = optionalString(window.partOfDay, "window.partOfDay") ?? "any";
    const partOfDay =
      partOfDayRaw === "morning" ||
      partOfDayRaw === "afternoon" ||
      partOfDayRaw === "evening" ||
      partOfDayRaw === "any"
        ? partOfDayRaw
        : "any";

    const result = await checkAvailabilityTool(
      {
        doctorId,
        window: { date, timeStart, timeEnd, partOfDay },
        slotMinutes:
          typeof body.slotMinutes === "number" && Number.isFinite(body.slotMinutes)
            ? body.slotMinutes
            : undefined,
      },
      { callId: optionalCallId(body) },
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/lookup */
export async function getAppointmentHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const result = await getAppointmentTool({
      appointmentId: optionalString(body.appointmentId, "appointmentId"),
      patientId: optionalString(body.patientId, "patientId"),
      doctorId: optionalString(body.doctorId, "doctorId"),
      appointmentDate: optionalString(body.appointmentDate, "appointmentDate"),
      statuses: Array.isArray(body.statuses)
        ? (body.statuses.filter((s) => typeof s === "string") as never[])
        : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/book */
export async function bookAppointmentHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const patientId = optionalString(body.patientId, "patientId");
    const doctorId = optionalString(body.doctorId, "doctorId");
    const date = optionalString(body.date, "date");
    const time = optionalString(body.time, "time");
    if (!patientId || !doctorId || !date || !time) {
      throw new ValidationError("patientId, doctorId, date, and time are required");
    }
    const result = await bookAppointmentTool(
      {
        patientId,
        doctorId,
        date,
        time,
        confirmed: body.confirmed === true,
        slotMinutes:
          typeof body.slotMinutes === "number" && Number.isFinite(body.slotMinutes)
            ? body.slotMinutes
            : undefined,
      },
      { callId: optionalCallId(body) },
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/cancel */
export async function cancelAppointmentHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const patientId = optionalString(body.patientId, "patientId");
    if (!patientId) {
      throw new ValidationError("patientId is required");
    }
    const result = await cancelAppointmentTool(
      {
        appointmentId: optionalString(body.appointmentId, "appointmentId"),
        patientId,
        doctorId: optionalString(body.doctorId, "doctorId"),
        appointmentDate: optionalString(body.appointmentDate, "appointmentDate"),
        confirmed: body.confirmed === true,
      },
      { callId: optionalCallId(body) },
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/appointments/reschedule */
export async function rescheduleAppointmentHttp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = asRecord(req.body);
    const appointmentId = optionalString(body.appointmentId, "appointmentId");
    const patientId = optionalString(body.patientId, "patientId");
    const date = optionalString(body.date, "date");
    const time = optionalString(body.time, "time");
    if (!appointmentId || !patientId || !date || !time) {
      throw new ValidationError("appointmentId, patientId, date, and time are required");
    }
    const result = await rescheduleAppointmentTool(
      {
        appointmentId,
        patientId,
        date,
        time,
        confirmed: body.confirmed === true,
        latestRequestedDate: optionalString(body.latestRequestedDate, "latestRequestedDate"),
        latestRequestedTime: optionalString(body.latestRequestedTime, "latestRequestedTime"),
        slotMinutes:
          typeof body.slotMinutes === "number" && Number.isFinite(body.slotMinutes)
            ? body.slotMinutes
            : undefined,
      },
      { callId: optionalCallId(body) },
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
