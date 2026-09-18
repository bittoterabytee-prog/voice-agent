import express from "express";
import { loadConfig } from "./config";
import { errorHandler, notFoundHandler, requestLogger } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";

export function createApp() {
  loadConfig();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(requestLogger);
  app.use(healthRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
