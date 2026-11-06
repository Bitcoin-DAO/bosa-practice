# Fork tasks

**Goal:** another group can fork btc-dao and run its own DAO, through all three stages, without asking the author and without hunting through the code for UNO's or the Sandbox DAO's specifics.

**State: Visible.** Public but unlicensed: readable, not yet reusable. Released only when every item below is ticked, the code is field-tested, the licence is added and v1.0 is tagged.

**Status:** reviewed 5 November 2026, at v0.1.1. *In a DAO's copy this file is carried along by updates: it is btc-dao's list, not the DAO's.*

## Summary

- **The rule:** a btc-dao DAO is one that speaks the protocol in `docs/protocol.md` (event kinds 3570–3586 with its `D` tag) over a Bitcoin multisig treasury. Everything else a fork may change.
- **The request:** to be decided by the owner (for example a link back to btc-dao). Not yet stated.
- **The model:** fork and run separately. One DAO per codebase; each DAO owns its hosting, relays and keys. The dashboard only reads.
- **The release condition:** UNO restores and spends its testnet4 treasury without the website, the first mainnet DAO completes three monthly rounds without developer help, and a second group deploys from the kit and runs one testnet4 round.

**What blocks forking today**

1. Updating a DAO's copy is done by hand: there is no tool that brings in a tagged release and leaves the DAO's own files alone.
2. Some instance values still live in shared code: the relay's DAO-id list and Cloudflare settings, and `btcdao.tech` in the identity card texts.
3. There is no fork guide: the steps to create a DAO repo, configure it and publish it exist only as a worked example (the Sandbox DAO).
4. Group-facing texts (join rules, founder guide, about page) exist only as the Sandbox DAO's own, not as templates.
5. No licence (expected until release).

**The fix in one sentence:** keep everything a DAO owns in `config/`, `site/` and one documents folder, bring shared code in only through a sync tool pinned to a tag, and write the fork guide and templates from the Sandbox DAO's worked example.

## Checklist

### 1. Work-in-progress notice
- [ ] One line at the top of `README.md`: not yet licensed for reuse; a forkable release is planned after field testing (UNO and the first mainnet DAO). The licence section at the end says so, but readers stop before it.

### 2. One instance folder per DAO
- [x] `config/` holds the DAO's settings (`dao.json`) and charter (`charter.<lang>.md`); the build reads the charter language from the settings.
- [x] `site/` holds the DAO's own static pages, copied next to the app at build and never touched by updates (v0.1.1). Sandbox DAO's about page lives there.
- [ ] One agreed folder name for a DAO's own documents (the Sandbox DAO uses `sandbox/`; propose `dao/` for every copy).
- [ ] Code and config kept apart, so forks can merge upstream fixes cleanly. Remaining instance values in shared code:
  - [ ] `relay/src/config.ts`: `ALLOWED_DAO_IDS` is edited per deployment. Read it from a Cloudflare variable or a relay config file instead.
  - [ ] `relay/wrangler.toml`: worker `name`, `database_name` (`bosa-dao-relay`) and `database_id` are the organisation's own. Replace with placeholders plus a setup step in `relay/README.md`.
  - [ ] `relay/src/config.ts` `relayInfo`: name and contact point to Bitcoin-DAO. Take them from the same relay config.
  - [ ] `app/src/i18n.ts` `card.fallback` and `restore.only`: `btcdao.tech` is written into the identity card texts. Take it from a config field (for example `directory`), falling back to `btcdao.tech`.
- [ ] Interface languages: the app offers Italian and English only (`Lang` in `app/src/app.ts`), and `languages` in the config is not used to choose them. Either use the config, or say plainly that other languages need a translation file.
- [x] Test fixtures (`app/src/core/*.test.ts`) use UNO and Europe/Rome as sample data. That is fine; keep them marked as samples.

### 3. Secrets
- [x] No secrets in the config: council entries hold only public keys and fingerprints.
- [ ] Config schema, validated on load. Today the app checks only the stage against the network and skips placeholders (`stageError`, `usable` in `app/src/core/config.ts`). Validate every field and refuse to start on an invalid config.
- [ ] The relay deploy refuses to run with the organisation's `database_id` in a fork.

### 4. Reproducible build and releases
- [x] Release tags: `v0.1.0` (4241ae1) and `v0.1.1` (27e39e2), with `CHANGELOG.md`.
- [x] A DAO's copy records the release it runs, in its README (uno-practice and uno-testnet: 0.1.0; sandbox-dao: v0.1.1).
- [x] The promotion rule is written down: a release moves to a DAO's next stage only after passing the one before (`docs/guide.md`, section 8).
- [ ] Sync tool (`tools/sync-from-btc-dao.sh` or a workflow): brings a DAO's copy to a given tag, replaces only shared folders (`app/`, `relay/`, `docs/`, `design/`, `tools/`, `showcase/`, `.github/`, `CHANGELOG.md`, `FORK-TASKS.md`), never touches `config/`, `site/` or the DAO's documents folder, keeps the README header, and records the tag.
- [ ] Bundled, pinned dependencies; no third-party scripts at runtime (S2). The app is bundled; check `package-lock.json` pinning and the relay's `relayInfo.icon` (a third-party URL).
- [ ] Signed releases with published hashes; reproducible build (S2).
- [ ] End-to-end runs (`app/e2e/run.sh`) in CI on every release. Today `pages.yml` runs only the unit tests.

### 5. Deployment
- [x] The site builds from `config/dao.json` by `.github/workflows/pages.yml`, with the DAO's charter and `site/`.
- [ ] Document the one-time GitHub Pages setting (Source: GitHub Actions). The first deploy fails without it, as it did for sandbox-dao.
- [ ] Relay deploys only through the "Deploy relay" workflow, never by hand, so the live relay matches the code. Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the repo.
- [ ] Dashboard listing via `dao.listing`.

### 6. The guide and templates
- [x] Charter template and optional modules (`docs/charter-template.en.md`, `docs/charter-modules/`).
- [x] Founding and running guide (`docs/guide.md`), wallet guide and testnet treasury guide.
- [ ] Fork guide (`docs/fork-guide.md`), in the order an adopter works: create the repo, sync from a tag, write `config/dao.json` from the example, fill in the charter, add `site/` pages, set Pages to GitHub Actions, run the Site workflow, add the DAO id to the relay, fund from the BTC DAO Testnet Treasury. The Sandbox DAO is the worked example.
- [ ] Charter module: remote founding (seats from a group, reserve list, short codes posted in the group, deadline, Confirm), taken from the Sandbox DAO's charter Article 4.
- [ ] Templates for the group: join rules and founder guide, from `sandbox/` in sandbox-dao.
- [ ] Homepage template (btc-dao-homepage): Story, Onboarding and live State, built from the config. The Sandbox DAO's `site/about.html` is the first example.
- [ ] Three-stage template: practice, testnet and mainnet configs from one set of answers (practice with short votes).
- [ ] Setup wizard produces the config and the recovery sheet.
- [ ] Template repo and one-click deploy to free static hosting.

### 7. Checking it works
- [ ] CI check that fails if instance values (DAO names, sites, relay ids, treasury addresses) appear outside `config/`, `site/`, the documents folder and test fixtures.
- [ ] Fork rehearsal: the Sandbox DAO is the first (different name, English charter, UTC, all remote, no hardware). Tick when it is founded, funded and closed on v0.1.1.
- [ ] A second group deploys its own DAO from the kit and runs one testnet4 round.

### 8. Code, protocol and security
- [ ] `docs/protocol.md`: every event format as exact JSON, with kind numbers and versioning. Kinds 3570–3586 are still provisional.
- [ ] State rules written down, with test cases for edge cases (S4).
- [ ] S1 to S6 met and tested on testnet4 (phase 1).
- [ ] S7: change verified against the loaded descriptor on SeedSigner (phase 2, hard gate).
- [ ] Independent code review before mainnet funds.
- [ ] S8 and S9 in place for the first mainnet DAO.

### 9. Field test
- [ ] v0.1.1 passes a full run in the Sandbox DAO (it is running v0.1.1 first, before any practice stage has proved it).
- [ ] Decide whether uno-practice and uno-testnet move to v0.1.1 before UNO's practice.
- [ ] UNO restores and spends its testnet4 treasury in Sparrow without the website.
- [ ] The first mainnet DAO completes three monthly rounds without developer help.

### 10. Release (last)
- [ ] Licences: one for code, one for texts and images. Permissive defaults: MIT for code, CC BY 4.0 for texts. Copyleft (GPL, CC BY-SA) if improvements must be shared back.
- [ ] `ACKNOWLEDGEMENT.md` with the requested link, if there is a request.
- [ ] README: replace the work-in-progress notice with the licences and the rule, and say the repo is forkable.
- [ ] Tag v1.0, the field-tested version.

## Order of work

| Step | Work | Disturbs a running DAO? |
| --- | --- | --- |
| 1 | Work-in-progress notice | No |
| 2 | Instance values out of shared code (relay, card texts); documents folder name | No, until a DAO syncs |
| 3 | Sync tool, then re-sync each DAO copy with it | Only at a sync, by choice |
| 4 | Config validation, relay deploy guard | No |
| 5 | Fork guide, remote-founding module, group templates | No |
| 6 | CI: end-to-end runs and the instance-values check | No |
| 7 | Field test: Sandbox DAO, then UNO, then the first mainnet DAO | It is the DAOs |
| 8 | Licences, acknowledgement, v1.0 | No |
