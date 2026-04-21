import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig, parseClusterBaseUrls } from "../src/config/loadConfig";

const validEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TTI_API_KEY: "tti-api-key",
  TTI_GATEWAY_LIST_SCOPE: "all_accessible",
  TTI_ORGANIZATION_ID: "cropwatch",
  TTI_IDENTITY_BASE_URL: "https://tenant.eu1.cloud.thethings.industries/",
  TTI_CLUSTER_BASE_URLS:
    "as1=https://tenant.as1.cloud.thethings.industries/,au1=https://tenant.au1.cloud.thethings.industries",
  TTI_PAGE_LIMIT: "1000",
  TTI_STATUS_BATCH_SIZE: "100",
  TTI_REQUEST_TIMEOUT_MS: "15000",
  LOG_LEVEL: "debug"
};

describe("loadConfig", () => {
  test("parses and normalizes two cluster URLs", () => {
    const config = loadConfig(validEnv);

    expect(config.supabase.url).toBe("https://example.supabase.co");
    expect(config.tti.gatewayListScope).toBe("all_accessible");
    expect(config.tti.identityBaseUrl).toBe("https://tenant.eu1.cloud.thethings.industries");
    expect(config.tti.clusters).toEqual([
      {
        id: "as1",
        baseUrl: "https://tenant.as1.cloud.thethings.industries",
        hostname: "tenant.as1.cloud.thethings.industries"
      },
      {
        id: "au1",
        baseUrl: "https://tenant.au1.cloud.thethings.industries",
        hostname: "tenant.au1.cloud.thethings.industries"
      }
    ]);
    expect(config.logLevel).toBe("debug");
  });

  test("rejects status batch sizes above the TTI maximum", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        TTI_STATUS_BATCH_SIZE: "101"
      })
    ).toThrow(ConfigError);
  });

  test("requires organization id only in organization scope", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        TTI_GATEWAY_LIST_SCOPE: "all_accessible",
        TTI_ORGANIZATION_ID: ""
      })
    ).not.toThrow();

    expect(() =>
      loadConfig({
        ...validEnv,
        TTI_GATEWAY_LIST_SCOPE: "organization",
        TTI_ORGANIZATION_ID: ""
      })
    ).toThrow(ConfigError);
  });

  test("rejects invalid cluster URL config", () => {
    expect(() => parseClusterBaseUrls("as1=https://tenant.as1.cloud.thethings.industries,broken")).toThrow(ConfigError);
  });

  test("rejects duplicate cluster ids", () => {
    expect(() =>
      parseClusterBaseUrls("as1=https://tenant.as1.cloud.thethings.industries,as1=https://other.example.com")
    ).toThrow(ConfigError);
  });
});
