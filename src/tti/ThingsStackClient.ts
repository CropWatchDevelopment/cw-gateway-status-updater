import { z } from "zod";
import { HttpRequestError } from "../http/HttpRequestError";
import type { Logger } from "../logging/Logger";
import { NullLogger } from "../logging/Logger";
import type { GatewayListScope } from "../config/AppConfig";
import type { GatewayStatusBatchResult, TtiGateway } from "./types";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface JsonResponse<T> {
  readonly data: T;
  readonly headers: Headers;
}

export interface ThingsStackClientOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly fetchFn?: FetchLike;
  readonly logger?: Logger;
  readonly retryCount?: number;
  readonly retryDelayMs?: number;
  readonly userAgent?: string;
}

export interface ListGatewaysOptions {
  readonly identityBaseUrl: string;
  readonly pageLimit: number;
  readonly scope: GatewayListScope;
  readonly organizationId?: string | undefined;
}

const GatewaySchema = z
  .object({
    ids: z.object({
      gateway_id: z.string().min(1)
    }),
    name: z.string().optional(),
    status_public: z.boolean().optional(),
    gateway_server_address: z.string().optional()
  })
  .passthrough();

const GatewaysResponseSchema = z.object({
  gateways: z.array(GatewaySchema).optional().default([])
});

const BatchConnectionStatsResponseSchema = z.object({
  entries: z.record(z.unknown()).optional().default({})
});

export class ThingsStackClient {
  private readonly fetchFn: FetchLike;
  private readonly logger: Logger;
  private readonly retryCount: number;
  private readonly retryDelayMs: number;
  private readonly userAgent: string;

  public constructor(private readonly options: ThingsStackClientOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.logger = options.logger ?? new NullLogger();
    this.retryCount = options.retryCount ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.userAgent = options.userAgent ?? "cw-gateway-status-updater/0.1.0";
  }

  public async listGateways(options: ListGatewaysOptions): Promise<TtiGateway[]> {
    const path =
      options.scope === "organization"
        ? `/api/v3/organizations/${encodeURIComponent(requiredOrganizationId(options.organizationId))}/gateways`
        : "/api/v3/gateways";

    return this.listGatewaysFromPath(options.identityBaseUrl, path, options.pageLimit, options.scope);
  }

  public async listOrganizationGateways(
    identityBaseUrl: string,
    organizationId: string,
    pageLimit: number
  ): Promise<TtiGateway[]> {
    return this.listGateways({
      identityBaseUrl,
      organizationId,
      pageLimit,
      scope: "organization"
    });
  }

  public async listAllAccessibleGateways(identityBaseUrl: string, pageLimit: number): Promise<TtiGateway[]> {
    return this.listGateways({
      identityBaseUrl,
      pageLimit,
      scope: "all_accessible"
    });
  }

  private async listGatewaysFromPath(
    identityBaseUrl: string,
    path: string,
    pageLimit: number,
    scope: GatewayListScope
  ): Promise<TtiGateway[]> {
    const gateways: TtiGateway[] = [];
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        field_mask: "name,status_public,gateway_server_address",
        limit: String(pageLimit),
        page: String(page)
      });

      const response = await this.requestJson<unknown>(
        identityBaseUrl,
        `${path}?${params.toString()}`
      );
      const parsed = GatewaysResponseSchema.parse(response.data);
      const pageGateways = parsed.gateways;

      gateways.push(...pageGateways);

      const totalCountHeader = response.headers.get("x-total-count");
      const totalCount = totalCountHeader ? Number.parseInt(totalCountHeader, 10) : undefined;

      this.logger.debug("Fetched TTI gateway inventory page", {
        scope,
        page,
        pageCount: pageGateways.length,
        totalCount: Number.isInteger(totalCount) ? totalCount : undefined
      });

      if (totalCount !== undefined && Number.isInteger(totalCount) && gateways.length >= totalCount) {
        break;
      }

      if (pageGateways.length < pageLimit || pageGateways.length === 0) {
        break;
      }

      page += 1;
    }

    return gateways;
  }

  public async batchGetGatewayConnectionStats(
    clusterBaseUrl: string,
    gatewayIds: readonly string[]
  ): Promise<GatewayStatusBatchResult> {
    if (gatewayIds.length === 0) {
      return { onlineGatewayIds: new Set<string>() };
    }

    const response = await this.requestJson<unknown>(clusterBaseUrl, "/api/v3/gs/gateways/connection/stats", {
      method: "POST",
      body: JSON.stringify({
        gateway_ids: gatewayIds.map((gatewayId) => ({ gateway_id: gatewayId })),
        field_mask: {
          paths: ["connected_at"]
        }
      })
    });
    const parsed = BatchConnectionStatsResponseSchema.parse(response.data);

    return {
      onlineGatewayIds: new Set(Object.keys(parsed.entries))
    };
  }

  private async requestJson<T>(baseUrl: string, pathAndQuery: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
    const url = new URL(pathAndQuery, `${baseUrl}/`).toString();
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      try {
        return await this.performJsonRequest<T>(url, init);
      } catch (error) {
        lastError = error;

        if (!this.shouldRetry(error) || attempt === this.retryCount) {
          throw error;
        }

        this.logger.warn("Retrying TTI request", { url, attempt: attempt + 1 });
        await delay(this.retryDelayMs * (attempt + 1));
      }
    }

    throw lastError;
  }

  private async performJsonRequest<T>(url: string, init: RequestInit): Promise<JsonResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${this.options.apiKey}`);
      headers.set("User-Agent", this.userAgent);

      if (init.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      const response = await this.fetchFn(url, {
        ...init,
        headers,
        signal: controller.signal
      });

      const body = await response.text();

      if (!response.ok) {
        throw new HttpRequestError(`TTI request failed with HTTP ${response.status}`, response.status, url, body);
      }

      if (body.trim().length === 0) {
        return { data: {} as T, headers: response.headers };
      }

      return { data: JSON.parse(body) as T, headers: response.headers };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`TTI request timed out after ${this.options.timeoutMs}ms: ${url}`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof HttpRequestError) {
      return error.status === 429 || error.status >= 500;
    }

    return error instanceof TypeError;
  }
}

function requiredOrganizationId(organizationId: string | undefined): string {
  if (!organizationId) {
    throw new Error("organizationId is required when listing gateways by organization");
  }

  return organizationId;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}
