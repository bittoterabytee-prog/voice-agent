import { createApp } from "./app";
import { loadConfig } from "./config";
import { closePool, connectDatabase } from "./db/pool";
import { logger } from "./utils/logger";

async function start(): Promise<void> {
  const config = loadConfig();
  if (!config.database.url) {
    throw new Error("Invalid application configuration: DATABASE_URL is required");
  }

  await connectDatabase();
  logger.info("Connected to PostgreSQL");

  const app = createApp();
  const server = app.listen(config.app.port, () => {
    logger.info(
      { port: config.app.port, env: config.app.env, name: config.app.name },
      "Backend started",
    );
  });

  function shutdown(signal: string): void {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error: unknown) => {
  logger.error({ err: error }, "Backend failed to start");
  process.exit(1);
});
