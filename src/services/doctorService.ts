import { doctorRepository } from "../repositories/doctorRepository";
import type { Doctor } from "../models/doctor";
import { ValidationError } from "../utils/errors";

export type SearchDoctorInput = {
  name?: string | null;
  specialization?: string | null;
  specialty?: string | null;
  department?: string | null;
  gender?: string | null;
};

export type SearchDoctorResult =
  | {
      outcome: "found";
      doctor: Doctor;
      doctors: Doctor[];
      message: string;
    }
  | {
      outcome: "multiple_matches";
      doctor: null;
      doctors: Doctor[];
      message: string;
    }
  | {
      outcome: "not_found";
      doctor: null;
      doctors: [];
      message: string;
    }
  | {
      outcome: "unavailable";
      doctor: null;
      doctors: Doctor[];
      message: string;
    };

function isBookable(doctor: Doctor): boolean {
  return doctor.availabilityStatus === "AVAILABLE";
}

/**
 * Search real doctors from PostgreSQL (KAN-65 / SRD searchDoctor).
 * Never invents names. Distinguishes found / multiple / not_found / unavailable.
 */
export async function searchDoctor(input: SearchDoctorInput): Promise<SearchDoctorResult> {
  const name = input.name?.trim() || "";
  const specialization = (input.specialization ?? input.specialty)?.trim() || "";
  const department = input.department?.trim() || "";
  const gender = input.gender?.trim() || "";

  if (!name && !specialization && !department && !gender) {
    throw new ValidationError(
      "Provide name, specialization/specialty, department, and/or gender to search doctors",
    );
  }

  const matches = await doctorRepository.search({
    name: name || undefined,
    specialization: specialization || undefined,
    department: department || undefined,
    gender: gender || undefined,
  });

  const bookable = matches.filter(isBookable);
  const unavailable = matches.filter((d) => !isBookable(d));

  if (bookable.length === 1) {
    return {
      outcome: "found",
      doctor: bookable[0],
      doctors: bookable,
      message: "Doctor found",
    };
  }
  if (bookable.length > 1) {
    return {
      outcome: "multiple_matches",
      doctor: null,
      doctors: bookable,
      message: "Multiple doctors matched; ask the caller to pick one",
    };
  }
  if (unavailable.length > 0) {
    return {
      outcome: "unavailable",
      doctor: null,
      doctors: unavailable,
      message: "Matching doctors are on leave or unavailable; offer another specialty or date",
    };
  }
  return {
    outcome: "not_found",
    doctor: null,
    doctors: [],
    message: "No doctor matched that search",
  };
}
