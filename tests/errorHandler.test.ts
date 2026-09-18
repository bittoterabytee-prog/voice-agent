import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler";
import { AppError, ExternalServiceError } from "../src/utils/errors";

function mockResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe("API error handling", () => {
  it("TC-005 returns a consistent error payload for unexpected failures", () => {
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    errorHandler(new Error("secret stack details"), {} as Request, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  it("returns the public message for known application errors", () => {
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    errorHandler(
      new AppError("Route is not implemented", 501, "NOT_IMPLEMENTED", true),
      {} as Request,
      res,
      next,
    );

    expect(res.statusCode).toBe(501);
    expect(res.body).toEqual({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Route is not implemented",
      },
    });
  });

  it("TC-006 hides implementation details when an external service fails", () => {
    const res = mockResponse();
    const next = vi.fn() as unknown as NextFunction;

    errorHandler(
      new ExternalServiceError("llm", "LLM provider is unavailable"),
      {} as Request,
      res,
      next,
    );

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/api[_-]?key/i);
    expect(res.body).toEqual({
      error: {
        code: "EXTERNAL_SERVICE_UNAVAILABLE",
        message: "LLM provider is unavailable",
      },
    });
  });
});
