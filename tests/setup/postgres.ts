import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";

const PGLITE_PORT = 55432;

export type TestDatabaseHandle = {
  stop: () => Promise<void>;
};

async function canConnect(databaseUrl: string): Promise<boolean> {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
  });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function ensureTestDatabase(): Promise<TestDatabaseHandle | undefined> {
  if (process.env.DATABASE_URL && (await canConnect(process.env.DATABASE_URL))) {
    return undefined;
  }

  const db = await PGlite.create();
  const server = new PGLiteSocketServer({
    db,
    port: PGLITE_PORT,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PGLITE_PORT}/postgres`;

  return {
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
