# CropWatch Gateway Status Updater

One-shot Bun CLI that syncs The Things Industries gateway connectivity into `public.cw_gateways`.

The app lists gateways from the organization registry, checks live Gateway Server connection stats in the configured AS1 and AU1 clusters, and upserts each gateway into Supabase.

## Requirements

- Bun 1.3 or newer
- Supabase project with the `public.cw_gateways` table
- TTI API key with rights to list organization gateways and read gateway status across AS1 and AU1

## Setup

Install dependencies:

```bash
bun install
```

Create the runtime env file from the visible sample values:

```bash
cp .env-test .env
```

Set real values in `.env`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

TTI_API_KEY=
TTI_GATEWAY_LIST_SCOPE=all_accessible
TTI_ORGANIZATION_ID=
TTI_IDENTITY_BASE_URL=https://<tenant>.eu1.cloud.thethings.industries
TTI_CLUSTER_BASE_URLS=as1=https://<tenant>.as1.cloud.thethings.industries,au1=https://<tenant>.au1.cloud.thethings.industries
```

`TTI_GATEWAY_LIST_SCOPE=all_accessible` uses `/api/v3/gateways` and lists every gateway the API key can access. This is the recommended mode when your gateways are not all direct collaborators of a single organization.

Set `TTI_GATEWAY_LIST_SCOPE=organization` to use `/api/v3/organizations/{org}/gateways`; in that mode `TTI_ORGANIZATION_ID` is required and only direct organization-collaborator gateways are listed.

`TTI_IDENTITY_BASE_URL` should point to `eu1`, where TTI stores entity registrations. Each URL in `TTI_CLUSTER_BASE_URLS` is used for live connection stats.

## Run

```bash
bun run sync
```

The command exits with a non-zero code if TTI listing, TTI status checks, or Supabase upsert fails. It aborts before writing to Supabase when TTI status is unknown.

## Test

```bash
bun test
bun run typecheck
```

## Standalone Server Scheduling

Cron example (Run every 15 min):

```cron
*/15 * * * * cd "/opt/cw-gateway-status-updater" && /usr/local/bin/bun run sync >> "/var/log/cw-gateway-status-updater.log" 2>&1
```

Systemd timer is also suitable because the app is intentionally one-shot and exits cleanly after each sync.
