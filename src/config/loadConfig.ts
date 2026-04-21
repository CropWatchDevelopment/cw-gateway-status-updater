import { z } from "zod";
import type { AppConfig, ClusterConfig, LogLevel } from "./AppConfig";

const MAX_TTI_STATUS_BATCH_SIZE = 100;

const EnvSchema = z.object({
  SUPABASE_URL: z.string().trim().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  TTI_API_KEY: z.string().trim().min(1),
  TTI_GATEWAY_LIST_SCOPE: z.enum(["all_accessible", "organization"]).default("all_accessible"),
  TTI_ORGANIZATION_ID: optionalNonEmptyString(),
  TTI_IDENTITY_BASE_URL: z.string().trim().min(1),
  TTI_CLUSTER_BASE_URLS: z.string().trim().min(1),
  TTI_PAGE_LIMIT: z.coerce.number().int().min(1).max(1000).default(1000),
  TTI_STATUS_BATCH_SIZE: z.coerce.number().int().min(1).max(MAX_TTI_STATUS_BATCH_SIZE).default(100),
  TTI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

type EnvInput = Record<string, string | undefined>;

export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: EnvInput = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration: ${issues}`);
  }

  if (parsed.data.TTI_GATEWAY_LIST_SCOPE === "organization" && !parsed.data.TTI_ORGANIZATION_ID) {
    throw new ConfigError("TTI_ORGANIZATION_ID is required when TTI_GATEWAY_LIST_SCOPE=organization");
  }

  return {
    supabase: {
      url: normalizeUrl(parsed.data.SUPABASE_URL, "SUPABASE_URL"),
      serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY
    },
    tti: {
      apiKey: parsed.data.TTI_API_KEY,
      gatewayListScope: parsed.data.TTI_GATEWAY_LIST_SCOPE,
      organizationId: parsed.data.TTI_ORGANIZATION_ID,
      identityBaseUrl: normalizeUrl(parsed.data.TTI_IDENTITY_BASE_URL, "TTI_IDENTITY_BASE_URL"),
      clusters: parseClusterBaseUrls(parsed.data.TTI_CLUSTER_BASE_URLS),
      pageLimit: parsed.data.TTI_PAGE_LIMIT,
      statusBatchSize: parsed.data.TTI_STATUS_BATCH_SIZE,
      requestTimeoutMs: parsed.data.TTI_REQUEST_TIMEOUT_MS
    },
    logLevel: parsed.data.LOG_LEVEL as LogLevel
  };
}

function optionalNonEmptyString(): z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown> {
  return z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim().length === 0) {
        return undefined;
      }

      return value;
    },
    z.string().trim().min(1).optional()
  );
}

export function parseClusterBaseUrls(rawValue: string): readonly ClusterConfig[] {
  const entries = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new ConfigError("TTI_CLUSTER_BASE_URLS must include at least one cluster URL");
  }

  const seen = new Set<string>();
  const clusters = entries.map((entry) => {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new ConfigError(`Invalid cluster URL entry "${entry}". Expected format id=https://host`);
    }

    const id = entry.slice(0, separatorIndex).trim().toLowerCase();
    const baseUrl = normalizeUrl(entry.slice(separatorIndex + 1).trim(), `TTI_CLUSTER_BASE_URLS.${id}`);
    const hostname = parseHostname(baseUrl, `TTI_CLUSTER_BASE_URLS.${id}`);

    if (!/^[a-z0-9-]+$/.test(id)) {
      throw new ConfigError(`Invalid cluster id "${id}" in TTI_CLUSTER_BASE_URLS`);
    }

    if (seen.has(id)) {
      throw new ConfigError(`Duplicate cluster id "${id}" in TTI_CLUSTER_BASE_URLS`);
    }
    seen.add(id);

    return { id, baseUrl, hostname };
  });

  return clusters;
}

function normalizeUrl(rawValue: string, fieldName: string): string {
  try {
    const url = new URL(rawValue);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ConfigError(`${fieldName} must be a valid HTTP(S) URL`);
  }
}

function parseHostname(rawValue: string, fieldName: string): string {
  try {
    return new URL(rawValue).hostname.toLowerCase();
  } catch {
    throw new ConfigError(`${fieldName} must be a valid HTTP(S) URL`);
  }
}
