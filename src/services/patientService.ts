import { patientRepository } from "../repositories/patientRepository";
import type { Patient } from "../models/patient";
import { ValidationError } from "../utils/errors";

export type GetPatientInput = {
  phone?: string | null;
  name?: string | null;
};

export type GetPatientOutcome = "found" | "not_found" | "multiple_matches";

export type GetPatientResult =
  | {
      outcome: "found";
      patient: Patient;
      patients: Patient[];
      message: string;
    }
  | {
      outcome: "not_found";
      patient: null;
      patients: [];
      message: string;
    }
  | {
      outcome: "multiple_matches";
      patient: null;
      patients: Patient[];
      message: string;
    };

function normalizePhone(phone: string): string {
  return phone.trim();
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Look up a patient by phone and/or name (KAN-64 / SRD getPatient).
 * Never creates rows. Distinct outcomes for not found vs multiple matches.
 */
export async function getPatient(input: GetPatientInput): Promise<GetPatientResult> {
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : "";
  const name = input.name?.trim() ? normalizeName(input.name) : "";

  if (!phone && !name) {
    throw new ValidationError("Provide phone and/or name to look up a patient");
  }

  if (phone) {
    const byPhone = await patientRepository.findByPhone(phone);
    if (byPhone) {
      if (name && byPhone.name.toLowerCase() !== name.toLowerCase()) {
        return {
          outcome: "not_found",
          patient: null,
          patients: [],
          message: "No patient matched both the given phone and name",
        };
      }
      return {
        outcome: "found",
        patient: byPhone,
        patients: [byPhone],
        message: "Patient found",
      };
    }
    if (!name) {
      return {
        outcome: "not_found",
        patient: null,
        patients: [],
        message: "No patient found for that phone",
      };
    }
  }

  const byName = await patientRepository.findByNameExact(name);
  if (byName.length === 0) {
    return {
      outcome: "not_found",
      patient: null,
      patients: [],
      message: phone
        ? "No patient found for that phone or name"
        : "No patient found for that name",
    };
  }
  if (byName.length === 1) {
    return {
      outcome: "found",
      patient: byName[0],
      patients: byName,
      message: "Patient found",
    };
  }
  return {
    outcome: "multiple_matches",
    patient: null,
    patients: byName,
    message: "Multiple patients matched that name; ask the caller to clarify (e.g. phone)",
  };
}
