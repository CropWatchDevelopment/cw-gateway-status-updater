import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CwGatewayInsert, Database } from "../src/supabase/database";
import { SupabaseGatewayRepository } from "../src/supabase/SupabaseGatewayRepository";

describe("SupabaseGatewayRepository", () => {
  test("upserts rows with gateway_id as the conflict target", async () => {
    const rows: CwGatewayInsert[] = [
      {
        updated_at: "2026-04-21T00:00:00.000Z",
        gateway_name: "Gateway One",
        is_online: true,
        gateway_id: "gw-1",
        is_public: true
      }
    ];
    const calls: Array<{ table: string; rows: CwGatewayInsert[]; options: { onConflict: string } }> = [];
    const client = {
      from(table: string) {
        return {
          async upsert(upsertRows: CwGatewayInsert[], options: { onConflict: string }) {
            calls.push({ table, rows: upsertRows, options });
            return { error: null };
          }
        };
      }
    } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseGatewayRepository(client);

    await repository.upsertGatewayStatuses(rows);

    expect(calls).toEqual([
      {
        table: "cw_gateways",
        rows,
        options: {
          onConflict: "gateway_id"
        }
      }
    ]);
  });

  test("throws when Supabase returns an error", async () => {
    const client = {
      from() {
        return {
          async upsert() {
            return { error: { message: "database unavailable" } };
          }
        };
      }
    } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseGatewayRepository(client);

    await expect(
      repository.upsertGatewayStatuses([
        {
          updated_at: "2026-04-21T00:00:00.000Z",
          gateway_name: "Gateway One",
          is_online: true,
          gateway_id: "gw-1",
          is_public: true
        }
      ])
    ).rejects.toThrow("database unavailable");
  });
});
