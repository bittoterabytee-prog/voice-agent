import express from "express";
import { loadConfig } from "./config";
import { errorHandler, notFoundHandler, requestLogger } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { llmRouter } from "./routes/llm";
import { sttRouter } from "./routes/stt";

export function createApp() {
  loadConfig();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "15mb" }));
  app.use(requestLogger);
  app.use(healthRouter);
  app.use(sttRouter);
  app.use(llmRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
