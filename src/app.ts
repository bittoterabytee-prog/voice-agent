import express from "express";
import { loadConfig } from "./config";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler, notFoundHandler, requestLogger } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { llmRouter } from "./routes/llm";
import { sessionRouter } from "./routes/session";
import { sttRouter } from "./routes/stt";
import { ttsRouter } from "./routes/tts";
import { voiceRouter } from "./routes/voice";

export function createApp() {
  loadConfig();

  const app = express();
  app.disable("x-powered-by");
  app.use(corsMiddleware);
  app.use(express.json({ limit: "15mb" }));
  app.use(requestLogger);
  app.use(healthRouter);
  app.use(sessionRouter);
  app.use(sttRouter);
  app.use(llmRouter);
  app.use(ttsRouter);
  app.use(voiceRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
