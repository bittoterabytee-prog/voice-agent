import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { patientRepository } from "../src/repositories/patientRepository";
import { identifyPatient } from "../src/services/patientService";
import { getPatientTool } from "../src/tools/appointmentTools";
import { ValidationError } from "../src/utils/errors";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

describe("KAN-64 identifyPatient by phone (POC, no ANI)", () => {
  beforeAll(async () => {
    testDatabase = await ensureTestDatabase();
    await connectDatabase();
    await runMigrations();
  });

  beforeEach(async () => {
    await getPool().query(
      "TRUNCATE call_events, conversation_states, calls, appointments, patients, doctors RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await closePool();
    await testDatabase?.stop();
  });

  it("TC-001 returns found for a single patient on a phone", async () => {
    await patientRepository.create({
      name: "Asha Patel",
      phone: "+15550001001",
      preferredLanguage: "hi",
    });

    const result = await identifyPatient({ phone: "+15550001001" });
    expect(result.outcome).toBe("found");
    if (result.outcome === "found") {
      expect(result.patient.name).toBe("Asha Patel");
    }
  });

  it("TC-002 returns multiple_matches when two patients share a phone", async () => {
    await patientRepository.create({ name: "Asha Patel", phone: "+15550001999" });
    await patientRepository.create({ name: "Ravi Kumar", phone: "+15550001999" });

    const result = await identifyPatient({ phone: "+15550001999" });
    expect(result.outcome).toBe("multiple_matches");
    if (result.outcome === "multiple_matches") {
      expect(result.patients).toHaveLength(2);
      expect(result.message).toMatch(/name/i);
    }
  });

  it("TC-003 registers a new patient when phone is unknown and name is given", async () => {
    const result = await identifyPatient({
      phone: "+15550002000",
      name: "Meera Sharma",
      preferredLanguage: "en",
    });
    expect(result.outcome).toBe("registered");
    if (result.outcome === "registered") {
      expect(result.patient.phone).toBe("+15550002000");
      expect(result.patient.name).toBe("Meera Sharma");
    }
    const rows = await patientRepository.findAllByPhone("+15550002000");
    expect(rows).toHaveLength(1);
  });

  it("TC-004 needs_name when phone is unknown and name is missing (no insert)", async () => {
    const before = await getPool().query("SELECT COUNT(*)::int AS n FROM patients");
    const result = await identifyPatient({ phone: "+15550002001" });
    expect(result.outcome).toBe("needs_name");
    const after = await getPool().query("SELECT COUNT(*)::int AS n FROM patients");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("TC-005 ValidationError when phone is missing", async () => {
    await expect(identifyPatient({ name: "Asha" })).rejects.toBeInstanceOf(ValidationError);
    await expect(identifyPatient({})).rejects.toBeInstanceOf(ValidationError);
  });

  it("disambiguates multi-patient phone by name", async () => {
    await patientRepository.create({ name: "Asha Patel", phone: "+15550001998" });
    await patientRepository.create({ name: "Ravi Kumar", phone: "+15550001998" });
    const result = await identifyPatient({ phone: "+15550001998", name: "Ravi Kumar" });
    expect(result.outcome).toBe("found");
    if (result.outcome === "found") {
      expect(result.patient.name).toBe("Ravi Kumar");
    }
  });

  it("registers another patient on an existing phone with a new name", async () => {
    await patientRepository.create({ name: "Asha Patel", phone: "+15550001997" });
    const result = await identifyPatient({ phone: "+15550001997", name: "Neha Patel" });
    expect(result.outcome).toBe("registered");
    const rows = await patientRepository.findAllByPhone("+15550001997");
    expect(rows).toHaveLength(2);
  });

  it("tool wrapper uses identifyPatient", async () => {
    const result = await getPatientTool({ phone: "+15550002002", name: "Demo User" });
    expect(result.outcome).toBe("registered");
  });
});
