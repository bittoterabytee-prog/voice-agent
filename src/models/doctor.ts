export type WorkingHours = Record<string, { start: string; end: string }>;

export type Doctor = {
  id: string;
  name: string;
  specialization: string;
  workingHours: WorkingHours;
  createdAt: Date;
  updatedAt: Date;
};
