export type WorkingHours = Record<string, { start: string; end: string }>;

export type DoctorAvailabilityStatus = "AVAILABLE" | "ON_LEAVE" | "UNAVAILABLE";

export type Doctor = {
  id: string;
  name: string;
  specialization: string;
  department: string;
  gender: string | null;
  availabilityStatus: DoctorAvailabilityStatus;
  workingHours: WorkingHours;
  createdAt: Date;
  updatedAt: Date;
};
