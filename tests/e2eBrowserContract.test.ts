import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { resetConfigCache } from "../src/config";

afterEach(() => {
  resetConfigCache();
});

/**
 * Backend contract readiness for KAN-17 browser E2E.
 * Full mic→TTS demo is manual (see docs/testing/E2E_BROWSER_VOICE.md).
 */
describe("KAN-17 browser E2E backend contract", () => {
  it("TC-001 — health allows frontend Origin (CORS)", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5174");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
  });

  it("TC-002 — preflight succeeds for sessions and voice turn", async () => {
    const app = createApp();

    for (const path of ["/api/sessions", "/api/voice/turn"]) {
      const response = await request(app)
        .options(path)
        .set("Origin", "http://localhost:5174")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type");

      expect(response.status).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5174");
      expect(response.headers["access-control-allow-methods"]).toMatch(/POST/i);
    }
  });

  it("TC-003 — voice turn validates missing audio without crashing", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/voice/turn")
      .set("Origin", "http://localhost:5174")
      .send({ mimeType: "audio/webm" });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/sk-/i);
  });
});
