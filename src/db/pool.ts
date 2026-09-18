import { Pool } from "pg";
import { loadConfig } from "../config";

let pool: Pool | undefined;

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const config = loadConfig(env);
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }
  return config.DATABASE_URL;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = undefined;
}

export async function connectDatabase(): Promise<void> {
  await getPool().query("SELECT 1");
}
