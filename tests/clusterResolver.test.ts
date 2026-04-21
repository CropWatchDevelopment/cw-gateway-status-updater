import { describe, expect, test } from "bun:test";
import type { ClusterConfig } from "../src/config/AppConfig";
import { ClusterResolver } from "../src/tti/ClusterResolver";
import type { TtiGateway } from "../src/tti/types";

const clusters: readonly ClusterConfig[] = [
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
];

describe("ClusterResolver", () => {
  test("matches a gateway server address to a configured cluster hostname", () => {
    const resolver = new ClusterResolver(clusters);

    expect(resolver.resolve(gateway("gw-1", "tenant.as1.cloud.thethings.industries"))?.id).toBe("as1");
    expect(resolver.resolve(gateway("gw-2", "https://tenant.au1.cloud.thethings.industries"))?.id).toBe("au1");
  });

  test("matches by cluster id when the gateway address omits the tenant prefix", () => {
    const resolver = new ClusterResolver(clusters);

    expect(resolver.resolve(gateway("gw-1", "as1.cloud.thethings.industries"))?.id).toBe("as1");
  });

  test("returns undefined for missing or unsupported cluster addresses", () => {
    const resolver = new ClusterResolver(clusters);

    expect(resolver.resolve(gateway("gw-1"))).toBeUndefined();
    expect(resolver.resolve(gateway("gw-2", "tenant.eu1.cloud.thethings.industries"))).toBeUndefined();
  });
});

function gateway(gatewayId: string, gatewayServerAddress?: string): TtiGateway {
  return {
    ids: {
      gateway_id: gatewayId
    },
    gateway_server_address: gatewayServerAddress
  };
}
