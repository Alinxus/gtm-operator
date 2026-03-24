import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("config validation", () => {
  it("requires a real database and RetainDB key by default", () => {
    expect(() =>
      loadConfig({
        PORT: "8788",
        RETAINDB_BASE_URL: "https://api.retaindb.com",
        RETAINDB_PROJECT: "retaindb-marketing",
        DEFAULT_BRAND_SLUG: "retaindb",
        DEFAULT_MEMORY_PROVIDER: "retaindb-http",
        SEED_ON_BOOT: "true",
      }),
    ).toThrow(/DATABASE_URL is required/i);
  });

  it("allows explicit local escape hatches for tests and offline work", () => {
    const config = loadConfig({
      PORT: "8788",
      DEFAULT_MEMORY_PROVIDER: "mock",
      ALLOW_IN_MEMORY_STORE: "true",
      ALLOW_MOCK_MEMORY_PROVIDER: "true",
      SEED_ON_BOOT: "false",
    });

    expect(config.allowInMemoryStore).toBe(true);
    expect(config.allowMockMemoryProvider).toBe(true);
    expect(config.defaultMemoryProvider).toBe("mock");
    expect(config.corsAllowedOrigins).toEqual(["*"]);
  });

  it("accepts RetainDB base URL aliases from production-style envs", () => {
    const config = loadConfig({
      PORT: "8788",
      DATABASE_URL: "postgres://db.example/test",
      DEFAULT_MEMORY_PROVIDER: "retaindb-http",
      RETAINDB_API_KEY: "test-key",
      RETAINDB_API_BASE_URL: "https://context.retaindb.com",
      SEED_ON_BOOT: "false",
    });

    expect(config.retainedbBaseUrl).toBe("https://context.retaindb.com");
  });

  it("normalizes multiline GitHub App private keys from env files", () => {
    const config = loadConfig({
      PORT: "8788",
      DATABASE_URL: "postgres://db.example/test",
      DEFAULT_MEMORY_PROVIDER: "retaindb-http",
      RETAINDB_API_KEY: "test-key",
      GITHUB_APP_ID: "12345",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nabc\\ndef\\n-----END RSA PRIVATE KEY-----",
      SEED_ON_BOOT: "false",
    });

    expect(config.githubAppId).toBe("12345");
    expect(config.githubAppPrivateKey).toContain("\nabc\n");
  });

  it("splits allowed frontend origins for Vercel and local apps", () => {
    const config = loadConfig({
      PORT: "8788",
      DATABASE_URL: "postgres://db.example/test",
      DEFAULT_MEMORY_PROVIDER: "retaindb-http",
      RETAINDB_API_KEY: "test-key",
      CORS_ALLOWED_ORIGINS: "https://probe.vercel.app, http://localhost:3000",
      CLOUDFLARE_ACCOUNT_ID: "account_123",
      CLOUDFLARE_API_TOKEN: "cf_token",
      SEED_ON_BOOT: "false",
    });

    expect(config.corsAllowedOrigins).toEqual(["https://probe.vercel.app", "http://localhost:3000"]);
    expect(config.cloudflareAccountId).toBe("account_123");
    expect(config.cloudflareApiToken).toBe("cf_token");
  });
});
