import pino from "pino";
import { getConfig } from "../config";

const config = getConfig();

export const logger = pino({
  level: config.app.logLevel,
  base: { service: config.app.name },
});
