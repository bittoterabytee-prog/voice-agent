import { Router } from "express";
import {
  identifyPatientHttp,
  searchDoctorHttp,
  resolveDateTimeHttp,
  checkAvailabilityHttp,
  getAppointmentHttp,
  bookAppointmentHttp,
  cancelAppointmentHttp,
  rescheduleAppointmentHttp,
} from "../controllers/appointmentController";

export const appointmentRouter = Router();

appointmentRouter.post("/api/appointments/patients/identify", identifyPatientHttp);
appointmentRouter.post("/api/appointments/doctors/search", searchDoctorHttp);
appointmentRouter.post("/api/appointments/datetime/resolve", resolveDateTimeHttp);
appointmentRouter.post("/api/appointments/availability", checkAvailabilityHttp);
appointmentRouter.post("/api/appointments/lookup", getAppointmentHttp);
appointmentRouter.post("/api/appointments/book", bookAppointmentHttp);
appointmentRouter.post("/api/appointments/cancel", cancelAppointmentHttp);
appointmentRouter.post("/api/appointments/reschedule", rescheduleAppointmentHttp);
