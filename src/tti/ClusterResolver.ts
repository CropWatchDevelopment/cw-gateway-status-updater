import type { ClusterConfig } from "../config/AppConfig";
import type { TtiGateway } from "./types";

export class ClusterResolver {
  public constructor(private readonly clusters: readonly ClusterConfig[]) {}

  public resolve(gateway: TtiGateway): ClusterConfig | undefined {
    const hostname = parseGatewayServerHostname(gateway.gateway_server_address);

    if (!hostname) {
      return undefined;
    }

    return this.clusters.find((cluster) => this.matchesCluster(hostname, cluster));
  }

  private matchesCluster(gatewayHostname: string, cluster: ClusterConfig): boolean {
    if (gatewayHostname === cluster.hostname) {
      return true;
    }

    const gatewayLabels = gatewayHostname.split(".");
    return gatewayLabels.includes(cluster.id);
  }
}

function parseGatewayServerHostname(address: string | undefined): string | undefined {
  const trimmed = address?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
