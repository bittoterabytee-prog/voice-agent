import type { DoctorAvailabilityStatus, WorkingHours } from "../models/doctor";

/**
 * Saket Hospital, Jaipur demo catalog for local seed (KAN-104).
 * Real names from https://www.sakethospital.in/our-doctors/ (medical consultants only).
 * Extra rows fill published Specialities so the POC has ~50 searchable doctors.
 * All phones/emails stay synthetic; these are not live booking credentials.
 */

export type SeedDoctor = {
  name: string;
  specialization: string;
  department: string;
  gender: string | null;
  availabilityStatus?: DoctorAvailabilityStatus;
  workingHours?: WorkingHours;
  /** true = listed on sakethospital.in/our-doctors */
  fromWebsite: boolean;
};

export const WEEKDAY_HOURS: WorkingHours = {
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
  saturday: { start: "09:00", end: "14:00" },
};

export const CARDIOLOGY_HOURS: WorkingHours = {
  monday: { start: "10:00", end: "14:30" },
  tuesday: { start: "10:00", end: "14:30" },
  wednesday: { start: "10:00", end: "14:30" },
  thursday: { start: "10:00", end: "14:30" },
  friday: { start: "10:00", end: "14:30" },
  saturday: { start: "10:00", end: "14:30" },
};

/** Every medical consultant from Our Doctors, plus fillers to ~50. */
export const SAKET_SEED_DOCTORS: SeedDoctor[] = [
  // —— From https://www.sakethospital.in/our-doctors/ ——
  {
    name: "Dr. Praveen Manglunia",
    specialization: "Family Medicine",
    department: "Internal Medicine",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Ankit Manglunia",
    specialization: "Endocrinology",
    department: "Endocrinology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Anuj Yadav",
    specialization: "Neonatology",
    department: "Paediatrics & Neonatology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Anurita Saigal",
    specialization: "Pathology",
    department: "Laboratory Services",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Arun Kumar Mathur",
    specialization: "Plastic Surgery",
    department: "General & Laparoscopic Surgery",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Ashish Airen",
    specialization: "Peripheral Vascular and Endovascular Surgery",
    department: "Cardiology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Chetan Swaroop Sharma",
    specialization: "Pediatric Surgery",
    department: "Paediatrics & Neonatology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Dilip Dubey",
    specialization: "General & Laparoscopic Surgery",
    department: "General & Laparoscopic Surgery",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Hariram Maharia",
    specialization: "Cardiology",
    department: "Cardiology",
    gender: "male",
    workingHours: CARDIOLOGY_HOURS,
    fromWebsite: true,
  },
  {
    name: "Dr. Kapil Sharma",
    specialization: "Pediatrics",
    department: "Paediatrics & Neonatology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Manish Gupta",
    specialization: "Anesthesiology & Critical Care Medicine",
    department: "Anesthesiology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Naresh Middha",
    specialization: "Radio Diagnosis",
    department: "Radiology & Imaging",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Naresh Soni",
    specialization: "Surgical Oncology",
    department: "General & Laparoscopic Surgery",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Neelam Bapna",
    specialization: "Obstetrics & Gynaecology (IVF)",
    department: "Shivani Fertility & IVF",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Neeraj Garg",
    specialization: "Anaesthesia",
    department: "Anesthesiology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Piyush Arvind",
    specialization: "Emergency Medicine",
    department: "Trauma Care",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Praveen Gupta",
    specialization: "Critical Care Medicine",
    department: "Anesthesiology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Preeti Mittal",
    specialization: "Dentistry",
    department: "Dental",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Priyanka Singh",
    specialization: "ENT",
    department: "ENT",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Rahul Singh",
    specialization: "Urology",
    department: "Nephrology & Urology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Raj Kumar Makkar",
    specialization: "Neurology",
    department: "Neuro Sciences",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Rohit Yogendra Goyal",
    specialization: "Orthopedics",
    department: "Orthopedics",
    gender: "male",
    workingHours: {
      monday: { start: "10:00", end: "16:00" },
      wednesday: { start: "10:00", end: "16:00" },
      friday: { start: "10:00", end: "16:00" },
    },
    fromWebsite: true,
  },
  {
    name: "Dr. Tanu Agarwal",
    specialization: "Oral & Maxillofacial Surgery",
    department: "Dental",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Sanjay Gupta",
    specialization: "Pediatrics",
    department: "Paediatrics & Neonatology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Sanjeev Sharma",
    specialization: "Neurosurgery",
    department: "Neuro Sciences",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Sharad Chandra",
    specialization: "Pediatric Surgery",
    department: "Paediatrics & Neonatology",
    gender: "male",
    fromWebsite: true,
  },
  {
    name: "Dr. Sonal Gaur",
    specialization: "Sonology / Fetal Medicine",
    department: "Radiology & Imaging",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Sweety Soni",
    specialization: "Obstetrics & Gynaecology",
    department: "Obstetrics & Gynecology",
    gender: "female",
    fromWebsite: true,
  },
  {
    name: "Dr. Tarun Kumar Mittal",
    specialization: "Pediatrics",
    department: "Paediatrics & Neonatology",
    gender: "male",
    availabilityStatus: "ON_LEAVE",
    fromWebsite: true,
  },
  {
    name: "Dr. Vivek Jain",
    specialization: "Critical Care",
    department: "Anesthesiology",
    gender: "male",
    fromWebsite: true,
  },

  // —— Fillers across Saket Specialities to reach ~50 (demo-only names) ——
  {
    name: "Dr. Anita Verma",
    specialization: "Dermatology",
    department: "Dermatology",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Suresh Agarwal",
    specialization: "Dermatology",
    department: "Dermatology",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Kavita Joshi",
    specialization: "Ophthalmology",
    department: "Ophthalmology",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Mohan Lal Sharma",
    specialization: "Ophthalmology",
    department: "Ophthalmology",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Rekha Malhotra",
    specialization: "Gastroenterology",
    department: "Gastroentrology / Gastro Surgeries",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Amitabh Saxena",
    specialization: "Gastroenterology",
    department: "Gastroentrology / Gastro Surgeries",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Sunita Rao",
    specialization: "Nephrology",
    department: "Nephrology & Urology",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Deepak Chauhan",
    specialization: "Physiotherapy",
    department: "Physiotherapy",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Nisha Bhatia",
    specialization: "Dietetics & Nutrition",
    department: "Dietetics & Nutrition",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Vikram Singh Rathore",
    specialization: "Orthopedics",
    department: "Orthopedics",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Pooja Mehta",
    specialization: "Cardiology",
    department: "Cardiology",
    gender: "female",
    workingHours: CARDIOLOGY_HOURS,
    fromWebsite: false,
  },
  {
    name: "Dr. Rajesh Khanna",
    specialization: "Internal Medicine",
    department: "Internal Medicine",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Shalini Gupta",
    specialization: "Obstetrics & Gynaecology",
    department: "Obstetrics & Gynecology",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Arvind Kumar",
    specialization: "ENT",
    department: "ENT",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Meenakshi Iyer",
    specialization: "Pediatrics",
    department: "Paediatrics & Neonatology",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Harsh Vardhan",
    specialization: "Neurology",
    department: "Neuro Sciences",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Latika Jain",
    specialization: "Radiology",
    department: "Radiology & Imaging",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Yogesh Tripathi",
    specialization: "General & Laparoscopic Surgery",
    department: "General & Laparoscopic Surgery",
    gender: "male",
    fromWebsite: false,
  },
  {
    name: "Dr. Farah Qureshi",
    specialization: "Anesthesiology",
    department: "Anesthesiology",
    gender: "female",
    fromWebsite: false,
  },
  {
    name: "Dr. Gaurav Bansal",
    specialization: "Emergency Medicine",
    department: "Trauma Care",
    gender: "male",
    fromWebsite: false,
  },
];
