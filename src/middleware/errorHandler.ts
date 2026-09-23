import type { NextFunction, Request, Response } from "express";
import pinoHttp from "pino-http";
import { logger } from "../utils/logger";
import { redactSecrets, redactValue } from "../utils/redact";

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
  customProps: (req) => ({
    requestId: req.id,
  }),
});

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested resource was not found",
    },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode =
    typeof err === "object" && err !== null && "statusCode" in err
      ? Number((err as { statusCode: number }).statusCode)
      : 500;
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: string }).code)
      : "INTERNAL_ERROR";
  const expose =
    typeof err === "object" && err !== null && "expose" in err
      ? Boolean((err as { expose: boolean }).expose)
      : false;
  const rawMessage = expose && err instanceof Error ? err.message : "An unexpected error occurred";
  const message = redactSecrets(rawMessage);

  logger.error(
    {
      err: redactValue(err),
      statusCode,
      code,
      requestId: _req.id,
    },
    "Request failed",
  );

  res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
    error: {
      code,
      message,
    },
  });
}
