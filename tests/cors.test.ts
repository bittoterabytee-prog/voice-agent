import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { resetConfigCache } from "../src/config";

afterEach(() => {
  resetConfigCache();
  delete process.env.CORS_ORIGINS;
});

describe("CORS for frontend (KAN-16)", () => {
  it("TC-001 — allows localhost:5174 Origin on GET /health", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5174");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
  });

  it("TC-002 — answers OPTIONS preflight for /api/sessions", async () => {
    const app = createApp();
    const response = await request(app)
      .options("/api/sessions")
      .set("Origin", "http://localhost:5174")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
    expect(response.headers["access-control-allow-methods"]).toMatch(/POST/i);
    expect(response.headers["access-control-allow-headers"]).toMatch(/content-type/i);
  });

  it("TC-003 — rejects unknown Origin (no Allow-Origin header)", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://evil.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("TC-004 — honors CORS_ORIGINS=* ", async () => {
    process.env.CORS_ORIGINS = "*";
    resetConfigCache();
    const app = createApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:9999");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
  });
});
