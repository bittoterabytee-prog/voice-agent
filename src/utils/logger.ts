import pino from "pino";
import { loadConfig } from "../config";

const config = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: "voice-agent-backend" },
});
