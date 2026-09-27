import { connectDatabase, closePool } from "../src/db/pool";
import { searchDoctor } from "../src/services/doctorService";

async function main(): Promise<void> {
  await connectDatabase();
  const cardio = await searchDoctor({ specialization: "Cardiology" });
  const unknown = await searchDoctor({ name: "Dr. Does Not Exist XYZ" });
  const leave = await searchDoctor({ name: "Tarun Kumar Mittal" });
  console.log(
    JSON.stringify({
      cardiology: { outcome: cardio.outcome, count: cardio.doctors.length },
      unknown: unknown.outcome,
      onLeave: { outcome: leave.outcome, status: leave.doctors[0]?.availabilityStatus ?? null },
    }),
  );
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
