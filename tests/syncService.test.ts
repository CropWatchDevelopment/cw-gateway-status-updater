import { describe, expect, test } from "bun:test";
import type { AppConfig } from "../src/config/AppConfig";
import type { CwGatewayInsert } from "../src/supabase/database";
import type { GatewayStatusRepository } from "../src/supabase/SupabaseGatewayRepository";
import { GatewayStatusSyncService, type GatewayStatusSyncClient } from "../src/sync/GatewayStatusSyncService";
import type { GatewayStatusBatchResult, TtiGateway } from "../src/tti/types";

describe("GatewayStatusSyncService", () => {
  test("maps resolved cluster status into Supabase rows", async () => {
    const config = testConfig();
    const client = new FakeTtiClient(
      [
        gateway("gw-online", {
          name: "Gateway Online",
          statusPublic: true,
          gatewayServerAddress: "tenant.as1.cloud.thethings.industries"
        }),
        gateway("gw-offline", {
          gatewayServerAddress: "tenant.as1.cloud.thethings.industries"
        }),
        gateway("gw-au", {
          gatewayServerAddress: "tenant.au1.cloud.thethings.industries"
        })
      ],
      new Map([
        ["https://tenant.as1.cloud.thethings.industries", new Set(["gw-online"])],
        ["https://tenant.au1.cloud.thethings.industries", new Set(["gw-au"])]
      ])
    );
    const repository = new FakeRepository();
    const service = new GatewayStatusSyncService(config, client, repository, undefined, fixedNow);

    const result = await service.sync();

    expect(result).toEqual({
      totalGateways: 3,
      onlineGateways: 2,
      offlineGateways: 1,
      unresolvedGateways: 0
    });
    expect(repository.rows).toEqual([
      {
        updated_at: "2026-04-21T00:00:00.000Z",
        gateway_name: "Gateway Online",
        is_online: true,
        gateway_id: "gw-online",
        is_public: true
      },
      {
        updated_at: "2026-04-21T00:00:00.000Z",
        gateway_name: "gw-offline",
        is_online: false,
        gateway_id: "gw-offline",
        is_public: false
      },
      {
        updated_at: "2026-04-21T00:00:00.000Z",
        gateway_name: "gw-au",
        is_online: true,
        gateway_id: "gw-au",
        is_public: false
      }
    ]);
  });

  test("checks unresolved gateways against both configured clusters", async () => {
    const config = testConfig();
    const client = new FakeTtiClient(
      [gateway("gw-unknown")],
      new Map([
        ["https://tenant.as1.cloud.thethings.industries", new Set<string>()],
        ["https://tenant.au1.cloud.thethings.industries", new Set(["gw-unknown"])]
      ])
    );
    const repository = new FakeRepository();
    const service = new GatewayStatusSyncService(config, client, repository, undefined, fixedNow);

    const result = await service.sync();

    expect(result.unresolvedGateways).toBe(1);
    expect(repository.rows[0]?.is_online).toBe(true);
    expect(client.statusCalls).toEqual([
      {
        clusterBaseUrl: "https://tenant.as1.cloud.thethings.industries",
        gatewayIds: ["gw-unknown"]
      },
      {
        clusterBaseUrl: "https://tenant.au1.cloud.thethings.industries",
        gatewayIds: ["gw-unknown"]
      }
    ]);
  });

  test("does not write to Supabase when a TTI status batch fails", async () => {
    const config = testConfig();
    const client = new FakeTtiClient(
      [
        gateway("gw-online", {
          gatewayServerAddress: "tenant.as1.cloud.thethings.industries"
        })
      ],
      new Map([["https://tenant.as1.cloud.thethings.industries", new Error("TTI unavailable")]])
    );
    const repository = new FakeRepository();
    const service = new GatewayStatusSyncService(config, client, repository, undefined, fixedNow);

    await expect(service.sync()).rejects.toThrow("TTI unavailable");
    expect(repository.upsertCalls).toBe(0);
  });
});

class FakeTtiClient implements GatewayStatusSyncClient {
  public readonly statusCalls: Array<{ clusterBaseUrl: string; gatewayIds: string[] }> = [];

  public constructor(
    private readonly gateways: readonly TtiGateway[],
    private readonly statusesByCluster: ReadonlyMap<string, ReadonlySet<string> | Error>
  ) {}

  public async listGateways(): Promise<TtiGateway[]> {
    return [...this.gateways];
  }

  public async batchGetGatewayConnectionStats(
    clusterBaseUrl: string,
    gatewayIds: readonly string[]
  ): Promise<GatewayStatusBatchResult> {
    this.statusCalls.push({ clusterBaseUrl, gatewayIds: [...gatewayIds] });
    const status = this.statusesByCluster.get(clusterBaseUrl);

    if (status instanceof Error) {
      throw status;
    }

    return {
      onlineGatewayIds: new Set(status ?? [])
    };
  }
}

class FakeRepository implements GatewayStatusRepository {
  public rows: CwGatewayInsert[] = [];
  public upsertCalls = 0;

  public async upsertGatewayStatuses(rows: readonly CwGatewayInsert[]): Promise<void> {
    this.upsertCalls += 1;
    this.rows = [...rows];
  }
}

function testConfig(): AppConfig {
  return {
    supabase: {
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role-key"
    },
    tti: {
      apiKey: "tti-api-key",
      gatewayListScope: "all_accessible",
      organizationId: "cropwatch",
      identityBaseUrl: "https://tenant.eu1.cloud.thethings.industries",
      clusters: [
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
      ],
      pageLimit: 1000,
      statusBatchSize: 100,
      requestTimeoutMs: 15000
    },
    logLevel: "error"
  };
}

function gateway(
  gatewayId: string,
  options: {
    readonly name?: string;
    readonly statusPublic?: boolean;
    readonly gatewayServerAddress?: string;
  } = {}
): TtiGateway {
  return {
    ids: {
      gateway_id: gatewayId
    },
    name: options.name,
    status_public: options.statusPublic,
    gateway_server_address: options.gatewayServerAddress
  };
}

function fixedNow(): Date {
  return new Date("2026-04-21T00:00:00.000Z");
}
