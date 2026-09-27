import { connectDatabase, closePool } from "../src/db/pool";
import { getPatient } from "../src/services/patientService";
import { ValidationError } from "../src/utils/errors";

async function main(): Promise<void> {
  await connectDatabase();
  const known = await getPatient({ phone: "+15550001001" });
  const unknown = await getPatient({ phone: "+15559999999" });
  let validation = "ok";
  try {
    await getPatient({});
  } catch (error) {
    validation = error instanceof ValidationError ? "VALIDATION_ERROR" : "other";
  }
  console.log(
    JSON.stringify({
      knownPhone: { outcome: known.outcome, name: known.patient?.name ?? null },
      unknownPhone: unknown.outcome,
      missingInput: validation,
    }),
  );
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
