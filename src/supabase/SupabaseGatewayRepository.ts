import type { SupabaseClient } from "@supabase/supabase-js";
import type { CwGatewayInsert, Database } from "./database";

export interface GatewayStatusRepository {
  upsertGatewayStatuses(rows: readonly CwGatewayInsert[]): Promise<void>;
}

export class SupabaseGatewayRepository implements GatewayStatusRepository {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async upsertGatewayStatuses(rows: readonly CwGatewayInsert[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const { error } = await this.client.from("cw_gateways").upsert([...rows], {
      onConflict: "gateway_id"
    });

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }
  }
}
