export interface TtiGatewayIdentifiers {
  readonly gateway_id: string;
}

export interface TtiGateway {
  readonly ids: TtiGatewayIdentifiers;
  readonly name?: string | undefined;
  readonly status_public?: boolean | undefined;
  readonly gateway_server_address?: string | undefined;
}

export interface GatewayConnectionStats {
  readonly connected_at?: string;
}

export interface GatewayStatusBatchResult {
  readonly onlineGatewayIds: ReadonlySet<string>;
}
