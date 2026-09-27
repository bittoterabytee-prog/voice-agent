import { connectDatabase, closePool } from "../src/db/pool";
import { identifyPatient } from "../src/services/patientService";
import { ValidationError } from "../src/utils/errors";

async function main(): Promise<void> {
  await connectDatabase();
  const known = await identifyPatient({ phone: "+15550001001" });
  const needsName = await identifyPatient({ phone: "+15558880001" });
  const registered = await identifyPatient({
    phone: "+15558880002",
    name: "Smoke Test Patient",
  });
  let validation = "ok";
  try {
    await identifyPatient({});
  } catch (error) {
    validation = error instanceof ValidationError ? "VALIDATION_ERROR" : "other";
  }
  console.log(
    JSON.stringify({
      knownPhone: { outcome: known.outcome, name: known.patient?.name ?? null },
      unknownNeedsName: needsName.outcome,
      registerNew: { outcome: registered.outcome, name: registered.patient?.name ?? null },
      missingPhone: validation,
    }),
  );
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
