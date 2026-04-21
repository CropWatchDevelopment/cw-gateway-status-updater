export type LogLevel = "debug" | "info" | "warn" | "error";
export type GatewayListScope = "all_accessible" | "organization";

export interface ClusterConfig {
  readonly id: string;
  readonly baseUrl: string;
  readonly hostname: string;
}

export interface SupabaseConfig {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export interface TtiConfig {
  readonly apiKey: string;
  readonly gatewayListScope: GatewayListScope;
  readonly organizationId?: string | undefined;
  readonly identityBaseUrl: string;
  readonly clusters: readonly ClusterConfig[];
  readonly pageLimit: number;
  readonly statusBatchSize: number;
  readonly requestTimeoutMs: number;
}

export interface AppConfig {
  readonly supabase: SupabaseConfig;
  readonly tti: TtiConfig;
  readonly logLevel: LogLevel;
}
