import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, connectDatabase, getPool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { patientRepository } from "../src/repositories/patientRepository";
import { getPatient } from "../src/services/patientService";
import { getPatientTool } from "../src/tools/appointmentTools";
import { ValidationError } from "../src/utils/errors";
import { ensureTestDatabase, type TestDatabaseHandle } from "./setup/postgres";

let testDatabase: TestDatabaseHandle | undefined;

describe("KAN-64 getPatient lookup", () => {
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

  it("TC-001 returns exactly one patient for a known phone", async () => {
    await patientRepository.create({
      name: "Asha Patel",
      phone: "+15550001001",
      preferredLanguage: "hi",
    });

    const result = await getPatient({ phone: "+15550001001" });
    expect(result.outcome).toBe("found");
    if (result.outcome === "found") {
      expect(result.patient.name).toBe("Asha Patel");
      expect(result.patient.phone).toBe("+15550001001");
      expect(result.patients).toHaveLength(1);
    }
  });

  it("TC-002 returns not_found for unknown phone without creating a row", async () => {
    const before = await getPool().query("SELECT COUNT(*)::int AS n FROM patients");
    const result = await getPatient({ phone: "+15559999999" });
    expect(result.outcome).toBe("not_found");
    expect(result.patient).toBeNull();
    const after = await getPool().query("SELECT COUNT(*)::int AS n FROM patients");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("TC-003 returns multiple_matches when two patients share a name", async () => {
    await patientRepository.create({ name: "Ravi Kumar", phone: "+15550001002" });
    await patientRepository.create({ name: "Ravi Kumar", phone: "+15550001022" });

    const result = await getPatient({ name: "Ravi Kumar" });
    expect(result.outcome).toBe("multiple_matches");
    if (result.outcome === "multiple_matches") {
      expect(result.patients).toHaveLength(2);
      expect(result.patient).toBeNull();
      expect(result.message).toMatch(/clarify/i);
    }
  });

  it("TC-004 validation fails when phone and name are missing", async () => {
    await expect(getPatient({})).rejects.toBeInstanceOf(ValidationError);
    await expect(getPatient({ phone: "  ", name: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("tool wrapper exposes the same contract", async () => {
    await patientRepository.create({ name: "Meera Sharma", phone: "+15550001003" });
    const result = await getPatientTool({ name: "meera sharma" });
    expect(result.outcome).toBe("found");
  });

  it("phone + mismatched name is not_found", async () => {
    await patientRepository.create({ name: "Asha Patel", phone: "+15550001001" });
    const result = await getPatient({ phone: "+15550001001", name: "Someone Else" });
    expect(result.outcome).toBe("not_found");
  });
});
