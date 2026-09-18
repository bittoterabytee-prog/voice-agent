import type { AppointmentStatus } from "./enums";

export type Appointment = {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  status: AppointmentStatus;
  createdAt: Date;
  updatedAt: Date;
};
