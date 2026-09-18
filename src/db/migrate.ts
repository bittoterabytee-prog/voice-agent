import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closePool, getPool } from "./pool";
import { logger } from "../utils/logger";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

export async function runMigrations(): Promise<string[]> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  const applied = await pool.query<{ id: string }>("SELECT id FROM schema_migrations");
  const appliedIds = new Set(applied.rows.map((row) => row.id));
  const ran: string[] = [];

  for (const file of files) {
    if (appliedIds.has(file)) {
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran.push(file);
      logger.info({ file }, "Applied database migration");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return ran;
}

async function main(): Promise<void> {
  const ran = await runMigrations();
  logger.info({ count: ran.length }, "Database migrations complete");
  await closePool();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error({ err: error }, "Database migration failed");
    process.exit(1);
  });
}
