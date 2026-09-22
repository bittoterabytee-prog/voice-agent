import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const collectionPath = path.join(root, "postman", "Voice-Agent-API.postman_collection.json");
const routesDir = path.join(root, "src", "routes");

type PostmanItem = {
  name?: string;
  request?: { method?: string; url?: string | { raw?: string } };
  item?: PostmanItem[];
  response?: Array<{ name?: string; code?: number; body?: string }>;
};

function walkItems(items: PostmanItem[] | undefined, out: PostmanItem[]): void {
  if (!items) return;
  for (const item of items) {
    if (item.request) out.push(item);
    if (item.item) walkItems(item.item, out);
  }
}

function requestPath(url: string | { raw?: string } | undefined): string | null {
  if (!url) return null;
  const raw = typeof url === "string" ? url : url.raw;
  if (!raw) return null;
  const withoutVars = raw.replace(/\{\{[^}]+\}\}/g, "");
  try {
    if (withoutVars.startsWith("http")) {
      return new URL(withoutVars).pathname;
    }
  } catch {
    /* fall through */
  }
  const pathOnly = withoutVars.replace(/^https?:\/\/[^/]+/, "");
  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}

function extractRoutePathsFromSource(): string[] {
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
  const paths = new Set<string>();
  const re =
    /\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi;

  for (const file of files) {
    const source = readFileSync(path.join(routesDir, file), "utf8");
    for (const match of source.matchAll(re)) {
      paths.add(match[2]);
    }
  }
  return [...paths].sort();
}

describe("KAN-21 Postman collection sync", () => {
  it("TC-007 covers every registered route path with Success and Fail examples where required", () => {
    const collection = JSON.parse(readFileSync(collectionPath, "utf8")) as {
      item?: PostmanItem[];
    };
    const requests: PostmanItem[] = [];
    walkItems(collection.item, requests);

    const collectionPaths = new Set(
      requests
        .map((r) => requestPath(r.request?.url))
        .filter((p): p is string => Boolean(p) && p !== "/does-not-exist"),
    );

    const routePaths = extractRoutePathsFromSource();
    expect(routePaths.length).toBeGreaterThan(0);

    for (const routePath of routePaths) {
      expect(
        collectionPaths.has(routePath),
        `Missing Postman request for route ${routePath}. Update postman/Voice-Agent-API.postman_collection.json (see docs/process/POSTMAN.md).`,
      ).toBe(true);
    }

    for (const routePath of routePaths) {
      const item = requests.find((r) => requestPath(r.request?.url) === routePath);
      expect(item, `Request item for ${routePath}`).toBeTruthy();
      const responses = item?.response ?? [];
      const names = responses.map((r) => (r.name ?? "").toLowerCase());
      const hasSuccess = names.some((n) => n.includes("success"));
      expect(hasSuccess, `${routePath} needs a Success example`).toBe(true);

      if (routePath === "/health") {
        continue;
      }
      const hasFail = names.some((n) => n.includes("fail"));
      expect(hasFail, `${routePath} needs a Fail example`).toBe(true);
    }

    const notFound = requests.find((r) => requestPath(r.request?.url) === "/does-not-exist");
    expect(notFound?.response?.some((r) => r.code === 404)).toBe(true);
  });
});
