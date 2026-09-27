import { patientRepository } from "../repositories/patientRepository";
import type { Patient } from "../models/patient";
import { ValidationError } from "../utils/errors";

export type IdentifyPatientInput = {
  /** Required for POC — no real call ANI; agent must ask the user. */
  phone?: string | null;
  /** Used to disambiguate multiple patients on one phone, or to register a new patient. */
  name?: string | null;
  preferredLanguage?: string | null;
};

export type IdentifyPatientResult =
  | {
      outcome: "found";
      patient: Patient;
      patients: Patient[];
      message: string;
    }
  | {
      outcome: "multiple_matches";
      patient: null;
      patients: Patient[];
      message: string;
    }
  | {
      outcome: "needs_name";
      patient: null;
      patients: [];
      message: string;
    }
  | {
      outcome: "registered";
      patient: Patient;
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
 * POC patient identity (KAN-64): ask for phone (no telephony ANI).
 * One phone may have many patients. Unknown phone + name → register.
 */
export async function identifyPatient(
  input: IdentifyPatientInput,
): Promise<IdentifyPatientResult> {
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : "";
  const name = input.name?.trim() ? normalizeName(input.name) : "";
  const preferredLanguage = input.preferredLanguage?.trim() || "en";

  if (!phone) {
    throw new ValidationError("Ask the user for their phone number (POC has no caller-ID)");
  }

  const onPhone = await patientRepository.findAllByPhone(phone);

  if (onPhone.length === 0) {
    if (!name) {
      return {
        outcome: "needs_name",
        patient: null,
        patients: [],
        message: "No patient on that phone yet; ask for the patient name to register",
      };
    }
    const created = await patientRepository.create({
      name,
      phone,
      preferredLanguage,
    });
    return {
      outcome: "registered",
      patient: created,
      patients: [created],
      message: "Registered new patient for that phone",
    };
  }

  if (name) {
    const matched = onPhone.filter((p) => p.name.toLowerCase() === name.toLowerCase());
    if (matched.length === 1) {
      return {
        outcome: "found",
        patient: matched[0],
        patients: matched,
        message: "Patient found",
      };
    }
    if (matched.length > 1) {
      return {
        outcome: "multiple_matches",
        patient: null,
        patients: matched,
        message: "Multiple patients on that phone share this name; ask for another detail",
      };
    }
    // Name not on this phone yet → register another patient on the same number
    const created = await patientRepository.create({
      name,
      phone,
      preferredLanguage,
    });
    return {
      outcome: "registered",
      patient: created,
      patients: [...onPhone, created],
      message: "Registered another patient on this phone",
    };
  }

  if (onPhone.length === 1) {
    return {
      outcome: "found",
      patient: onPhone[0],
      patients: onPhone,
      message: "Patient found",
    };
  }

  return {
    outcome: "multiple_matches",
    patient: null,
    patients: onPhone,
    message: "Multiple patients share this phone; ask which patient name to use",
  };
}

/** @deprecated Prefer identifyPatient — kept as alias for tool naming (getPatient). */
export async function getPatient(input: IdentifyPatientInput): Promise<IdentifyPatientResult> {
  return identifyPatient(input);
}
