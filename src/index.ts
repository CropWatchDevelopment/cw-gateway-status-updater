import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config/loadConfig";
import { ConsoleLogger } from "./logging/Logger";
import type { Database } from "./supabase/database";
import { SupabaseGatewayRepository } from "./supabase/SupabaseGatewayRepository";
import { GatewayStatusSyncService } from "./sync/GatewayStatusSyncService";
import { ThingsStackClient } from "./tti/ThingsStackClient";
import { errorToMessage } from "./utils/errorToMessage";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new ConsoleLogger(config.logLevel);

  const ttiClient = new ThingsStackClient({
    apiKey: config.tti.apiKey,
    timeoutMs: config.tti.requestTimeoutMs,
    logger
  });

  const supabaseClient = createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const repository = new SupabaseGatewayRepository(supabaseClient);
  const syncService = new GatewayStatusSyncService(config, ttiClient, repository, logger);
  const result = await syncService.sync();

  logger.info("Gateway status sync complete", result);
}

main().catch((error: unknown) => {
  console.error(`Gateway status sync failed: ${errorToMessage(error)}`);
  process.exit(1);
});
