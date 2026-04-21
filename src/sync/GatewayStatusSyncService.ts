import type { AppConfig, ClusterConfig } from "../config/AppConfig";
import type { Logger } from "../logging/Logger";
import { NullLogger } from "../logging/Logger";
import type { CwGatewayInsert } from "../supabase/database";
import type { GatewayStatusRepository } from "../supabase/SupabaseGatewayRepository";
import { ClusterResolver } from "../tti/ClusterResolver";
import type { GatewayStatusBatchResult, TtiGateway } from "../tti/types";
import { chunkArray } from "../utils/chunk";

export interface GatewayRegistryClient {
  listGateways(options: {
    readonly identityBaseUrl: string;
    readonly pageLimit: number;
    readonly scope: AppConfig["tti"]["gatewayListScope"];
    readonly organizationId?: string | undefined;
  }): Promise<TtiGateway[]>;
}

export interface GatewayConnectionStatsClient {
  batchGetGatewayConnectionStats(clusterBaseUrl: string, gatewayIds: readonly string[]): Promise<GatewayStatusBatchResult>;
}

export interface GatewayStatusSyncClient extends GatewayRegistryClient, GatewayConnectionStatsClient {}

export interface GatewayStatusSyncResult {
  readonly totalGateways: number;
  readonly onlineGateways: number;
  readonly offlineGateways: number;
  readonly unresolvedGateways: number;
}

export class GatewayStatusSyncService {
  private readonly logger: Logger;
  private readonly clusterResolver: ClusterResolver;

  public constructor(
    private readonly config: AppConfig,
    private readonly ttiClient: GatewayStatusSyncClient,
    private readonly repository: GatewayStatusRepository,
    logger?: Logger,
    private readonly now: () => Date = () => new Date()
  ) {
    this.logger = logger ?? new NullLogger();
    this.clusterResolver = new ClusterResolver(config.tti.clusters);
  }

  public async sync(): Promise<GatewayStatusSyncResult> {
    const gateways = dedupeGateways(
      await this.ttiClient.listGateways({
        identityBaseUrl: this.config.tti.identityBaseUrl,
        organizationId: this.config.tti.organizationId,
        pageLimit: this.config.tti.pageLimit,
        scope: this.config.tti.gatewayListScope
      })
    );

    this.logger.info("Fetched gateways from TTI", {
      count: gateways.length,
      scope: this.config.tti.gatewayListScope
    });

    const statuses = await this.fetchOnlineStatuses(gateways);
    const updatedAt = this.now().toISOString();
    const rows = gateways.map((gateway) => toCwGatewayInsert(gateway, statuses.get(gateway.ids.gateway_id) ?? false, updatedAt));

    await this.repository.upsertGatewayStatuses(rows);

    const onlineGateways = rows.filter((row) => row.is_online).length;

    return {
      totalGateways: rows.length,
      onlineGateways,
      offlineGateways: rows.length - onlineGateways,
      unresolvedGateways: gateways.filter((gateway) => !this.clusterResolver.resolve(gateway)).length
    };
  }

  private async fetchOnlineStatuses(gateways: readonly TtiGateway[]): Promise<Map<string, boolean>> {
    const statuses = new Map<string, boolean>();
    const byCluster = new Map<string, TtiGateway[]>();
    const unresolvedGateways: TtiGateway[] = [];

    for (const gateway of gateways) {
      const cluster = this.clusterResolver.resolve(gateway);

      if (!cluster) {
        unresolvedGateways.push(gateway);
        continue;
      }

      const clusterGateways = byCluster.get(cluster.id) ?? [];
      clusterGateways.push(gateway);
      byCluster.set(cluster.id, clusterGateways);
    }

    for (const cluster of this.config.tti.clusters) {
      const clusterGateways = byCluster.get(cluster.id) ?? [];
      await this.applyClusterStatuses(cluster, clusterGateways, statuses);
    }

    if (unresolvedGateways.length > 0) {
      await this.applyUnresolvedGatewayStatuses(unresolvedGateways, statuses);
    }

    return statuses;
  }

  private async applyClusterStatuses(
    cluster: ClusterConfig,
    gateways: readonly TtiGateway[],
    statuses: Map<string, boolean>
  ): Promise<void> {
    if (gateways.length === 0) {
      return;
    }

    this.logger.info("Checking gateway statuses for cluster", { cluster: cluster.id, count: gateways.length });

    for (const chunk of chunkArray(gateways, this.config.tti.statusBatchSize)) {
      const gatewayIds = chunk.map((gateway) => gateway.ids.gateway_id);
      const result = await this.ttiClient.batchGetGatewayConnectionStats(cluster.baseUrl, gatewayIds);

      for (const gatewayId of gatewayIds) {
        statuses.set(gatewayId, result.onlineGatewayIds.has(gatewayId));
      }
    }
  }

  private async applyUnresolvedGatewayStatuses(
    gateways: readonly TtiGateway[],
    statuses: Map<string, boolean>
  ): Promise<void> {
    const unresolvedIds = gateways.map((gateway) => gateway.ids.gateway_id);

    this.logger.warn("Checking unresolved gateways against every configured cluster", {
      count: unresolvedIds.length,
      clusters: this.config.tti.clusters.map((cluster) => cluster.id)
    });

    for (const gatewayId of unresolvedIds) {
      statuses.set(gatewayId, false);
    }

    for (const cluster of this.config.tti.clusters) {
      for (const chunk of chunkArray(unresolvedIds, this.config.tti.statusBatchSize)) {
        const result = await this.ttiClient.batchGetGatewayConnectionStats(cluster.baseUrl, chunk);

        for (const gatewayId of chunk) {
          statuses.set(gatewayId, statuses.get(gatewayId) === true || result.onlineGatewayIds.has(gatewayId));
        }
      }
    }
  }
}

function toCwGatewayInsert(gateway: TtiGateway, isOnline: boolean, updatedAt: string): CwGatewayInsert {
  const gatewayId = gateway.ids.gateway_id;
  const name = gateway.name?.trim();

  return {
    updated_at: updatedAt,
    gateway_name: name && name.length > 0 ? name : gatewayId,
    is_online: isOnline,
    gateway_id: gatewayId
  };
}

function dedupeGateways(gateways: readonly TtiGateway[]): TtiGateway[] {
  return [...new Map(gateways.map((gateway) => [gateway.ids.gateway_id, gateway])).values()];
}
