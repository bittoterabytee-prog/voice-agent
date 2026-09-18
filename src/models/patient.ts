export type Patient = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  preferredLanguage: string;
  createdAt: Date;
  updatedAt: Date;
};
