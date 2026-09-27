import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";

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

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a free port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

export async function ensureTestDatabase(): Promise<TestDatabaseHandle | undefined> {
  const existingUrl = process.env.DATABASE_URL?.trim();
  if (existingUrl && (await canConnect(existingUrl))) {
    return undefined;
  }

  const port = await freePort();
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

  return {
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
