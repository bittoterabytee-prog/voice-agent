import type { NextFunction, Request, Response } from "express";
import { getConfig } from "../config";

function resolveAllowOrigin(requestOrigin: string | undefined, allowed: string[]): string | undefined {
  if (allowed.includes("*")) {
    return "*";
  }
  if (!requestOrigin) {
    return undefined;
  }
  if (allowed.includes(requestOrigin)) {
    return requestOrigin;
  }
  return undefined;
}

/**
 * Browser CORS for the separate frontend repo (KAN-16).
 * Origins come from getConfig().app.corsOrigins (CORS_ORIGINS).
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { corsOrigins } = getConfig().app;
  const allowOrigin = resolveAllowOrigin(req.headers.origin, corsOrigins);

  if (allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    if (allowOrigin !== "*") {
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
