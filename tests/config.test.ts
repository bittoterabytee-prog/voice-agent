import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("environment configuration", () => {
  it("TC-003 loads valid configuration from the environment", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      PORT: "4000",
      LOG_LEVEL: "debug",
    });

    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(4000);
    expect(config.LOG_LEVEL).toBe("debug");
  });

  it("TC-004 fails clearly when a required variable is missing", () => {
    expect(() => loadConfig({ PORT: "3000" })).toThrow(/Invalid application configuration/i);
    expect(() => loadConfig({ PORT: "3000" })).toThrow(/NODE_ENV/);
  });
});
