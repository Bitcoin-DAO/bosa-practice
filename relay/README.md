# DAO relay

The DAO relay: [Nosflare](https://github.com/Spl0itable/nosflare) 7.9.45 (MIT, see `LICENSE-nosflare`), set up for the policy in `docs/protocol.md` §7.3. It runs on Cloudflare's free Workers plan, with a D1 database and Durable Objects.

## What was changed from Nosflare

All in `src/config.ts` unless noted:

| Setting | Nosflare default | Here |
| --- | --- | --- |
| Event kinds | all | only 3570–3586 |
| `D` tag | not checked | required on every event (new `hasDaoTag`, checked in `src/durable-object.ts`); any 64-hex value until `ALLOWED_DAO_IDS` has entries, then only those DAO ids |
| Pay to relay | on | off |
| Sign-in to read or write (NIP-42) | required | not required: anyone can read, any key can publish |
| Pruning | deletes old events above 9 GB | off: every event is kept |
| Deletion requests (kind 5) | honoured | rejected, as kind 5 is not allowed |
| Rate limits per connection | 10 events, 50 requests a minute | 60 events (bursts of 120), 120 requests a minute |
| Edge query cache | 5 minutes, not cleared by new events | off (`GLOBAL_QUERY_CACHE`, checked in `src/durable-object.ts`), so clients see new events straight away |
| Relay name, contact | Nosflare's | btc-dao's |
| `wrangler.toml` | `cpu_ms` limit, Nosflare's database | no limit (needed on the free plan); worker named `btc-dao-relay`, database `bosa-dao-relay` (a name from before the project went generic; Cloudflare cannot rename a D1 database, and only its id matters) |

Tested locally with `wrangler dev`: a kind 3572 event with a `D` tag is saved and read back with a `#D` filter; a kind 1 note, an event without a `D` tag, one with a malformed `D` tag, and a kind 5 deletion are all refused.

## Deploying (Cloudflare dashboard, once)

1. **Database.** Storage & databases → D1 → Create database. Name it after the relay (for example `btc-dao-relay-db`), location Western Europe. Copy its **Database ID** into `database_id` in `wrangler.toml` and commit.
2. **Worker from GitHub.** Workers & Pages → Create → Import a repository. Connect GitHub and allow the Cloudflare app on the Bitcoin-DAO organisation, for the `btc-dao` repository only. Choose `btc-dao`, then:
   - Project name: `btc-dao-relay` (must match `name` in `wrangler.toml`)
   - Root directory (under Advanced): `relay`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Build watch paths, include: `relay/*`, so only relay changes redeploy it
3. **Deploy**, then open the `workers.dev` address in a browser once: that creates the database tables. The page shows Nosflare's own landing page; the relay's details, read by Nostr clients, carry the btc-dao relay name.
4. Put the address, as `wss://btc-dao-relay.<account>.workers.dev`, first in `relays` in the DAO config.

### Or deploy from GitHub Actions

If Cloudflare's own builds fail (they timed out while initialising on the organisation's account), deploy with `.github/workflows/deploy-relay.yml` instead:

1. In Cloudflare: My profile → API tokens → Create token → template "Edit Cloudflare Workers". Add the permission Account → D1 → Edit, limit it to the DAO's account, and create it.
2. In GitHub, `btc-dao` → Settings → Secrets and variables → Actions, add two repository secrets: `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (the long id after `dash.cloudflare.com/` in the dashboard address).
3. In Cloudflare, disconnect the worker's Git repository (Settings → Build), so the two don't both deploy.
4. In GitHub, Actions → Deploy relay → Run workflow.

## After founding

After each founding, add that DAO's id to `ALLOWED_DAO_IDS` in `src/config.ts`, run `npm run build` and commit. Cloudflare redeploys by itself. This relay serves UNO's practice and testnet stages; a mainnet DAO gets its own relay on its own domain.

## To do: a database with a generic name

The relay's D1 database is still called `bosa-dao-relay`, a name from before the project went generic. Cloudflare cannot rename a D1 database, so it stays as it is while UNO's practice and testnet stages run. After the testnet stage is closed, and before any mainnet DAO uses this relay:

1. In Cloudflare, create a new D1 database (for example `btc-dao-relay-db`, Western Europe).
2. Put its id in `database_id` and its name in `database_name` in `wrangler.toml`, and commit; the relay redeploys.
3. Open the relay's `workers.dev` address once to create the tables, then check a client can publish and read an event.
4. Delete the old `bosa-dao-relay` database.

The new database starts empty. That is fine once UNO's stages are closed; the public relays still hold their events.

## Mainnet

A mainnet DAO deploys its own copy of this relay, adds `relay.<its domain>` under the worker's Settings → Domains & Routes once the domain is on Cloudflare, and lists it in its config.
