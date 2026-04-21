import { describe, expect, test } from "bun:test";
import { ThingsStackClient, type FetchLike } from "../src/tti/ThingsStackClient";

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

describe("ThingsStackClient", () => {
  test("lists all accessible gateways from the unscoped identity endpoint", async () => {
    const calls: FetchCall[] = [];
    const fetchFn: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });

      return jsonResponse({
        gateways: [
          {
            ids: { gateway_id: "gw-1" },
            gateway_server_address: "tenant.as1.cloud.thethings.industries"
          }
        ]
      });
    };
    const client = new ThingsStackClient({
      apiKey: "secret-key",
      timeoutMs: 1000,
      fetchFn,
      retryDelayMs: 0
    });

    const gateways = await client.listAllAccessibleGateways("https://tenant.eu1.cloud.thethings.industries", 1000);

    expect(gateways.map((gateway) => gateway.ids.gateway_id)).toEqual(["gw-1"]);
    expect(calls[0]?.url).toContain("https://tenant.eu1.cloud.thethings.industries/api/v3/gateways?");
  });

  test("lists organization gateways from the identity base URL with auth and field mask", async () => {
    const calls: FetchCall[] = [];
    const fetchFn: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });

      if (calls.length === 1) {
        return jsonResponse(
          {
            gateways: [
              {
                ids: { gateway_id: "gw-1" },
                name: "Gateway One",
                status_public: true,
                gateway_server_address: "tenant.as1.cloud.thethings.industries"
              }
            ]
          },
          { "x-total-count": "2" }
        );
      }

      return jsonResponse(
        {
          gateways: [
            {
              ids: { gateway_id: "gw-2" },
              status_public: false,
              gateway_server_address: "tenant.au1.cloud.thethings.industries"
            }
          ]
        },
        { "x-total-count": "2" }
      );
    };
    const client = new ThingsStackClient({
      apiKey: "secret-key",
      timeoutMs: 1000,
      fetchFn,
      retryDelayMs: 0
    });

    const gateways = await client.listOrganizationGateways("https://tenant.eu1.cloud.thethings.industries", "cropwatch", 1);

    expect(gateways.map((gateway) => gateway.ids.gateway_id)).toEqual(["gw-1", "gw-2"]);
    expect(calls).toHaveLength(2);

    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("Expected first fetch call");
    }

    expect(firstCall.url).toContain("https://tenant.eu1.cloud.thethings.industries/api/v3/organizations/cropwatch/gateways");
    expect(firstCall.url).toContain("field_mask=name%2Cstatus_public%2Cgateway_server_address");
    expect(firstCall.url).toContain("limit=1");
    expect(new Headers(firstCall.init?.headers).get("Authorization")).toBe("Bearer secret-key");
    expect(new Headers(firstCall.init?.headers).get("User-Agent")).toBe("cw-gateway-status-updater/0.1.0");
  });

  test("posts gateway connection stats batches and returns online ids from entries", async () => {
    const calls: FetchCall[] = [];
    const fetchFn: FetchLike = async (input, init) => {
      calls.push({ url: String(input), init });

      return jsonResponse({
        entries: {
          "gw-online": {
            connected_at: "2026-04-21T00:00:00Z"
          }
        }
      });
    };
    const client = new ThingsStackClient({
      apiKey: "secret-key",
      timeoutMs: 1000,
      fetchFn,
      retryDelayMs: 0
    });

    const result = await client.batchGetGatewayConnectionStats("https://tenant.as1.cloud.thethings.industries", [
      "gw-online",
      "gw-offline"
    ]);

    expect(result.onlineGatewayIds.has("gw-online")).toBe(true);
    expect(result.onlineGatewayIds.has("gw-offline")).toBe(false);
    expect(calls).toHaveLength(1);

    const call = calls[0];
    if (!call) {
      throw new Error("Expected fetch call");
    }

    expect(call.url).toBe("https://tenant.as1.cloud.thethings.industries/api/v3/gs/gateways/connection/stats");
    expect(call.init?.method).toBe("POST");
    expect(JSON.parse(String(call.init?.body))).toEqual({
      gateway_ids: [{ gateway_id: "gw-online" }, { gateway_id: "gw-offline" }],
      field_mask: {
        paths: ["connected_at"]
      }
    });
    expect(new Headers(call.init?.headers).get("Content-Type")).toBe("application/json");
  });
});

function jsonResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers
  });
}
