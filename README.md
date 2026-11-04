# BOSA DAO · practice

**This is BOSA DAO's practice copy of [btc-dao](https://github.com/Bitcoin-DAO/btc-dao)** (stage 1 of 3: practice, testnet, mainnet). It runs btc-dao 0.1.0 on testnet4 with votes of about ten minutes, so a few people can rehearse the whole life of the DAO in one sitting: founding, joining, voting, a lost key, restoring from a card and a payout round. Everything here is thrown away afterwards; the testnet stage is [`bosa-dao`](https://github.com/Bitcoin-DAO/bosa-dao).

The site is at **https://bitcoin-dao.github.io/bosa-practice**, built from `config/dao.json` by `.github/workflows/pages.yml`. After the rehearsal, everyone deletes their practice passkey ("… (prova generale)") and this repository is archived.

---

# btc-dao

A SputnikDAO-style DAO on Bitcoin alone: members propose and vote, a council of keyholders signs payouts from a multisig treasury, and anyone can audit everything.

- **Bitcoin only.** The treasury is an on-chain 3-of-5 multisig. No tokens, no other chain.
- **Approval is execution.** A payout is a PSBT; council signatures are the binding vote.
- **Keyless software.** The website never holds a key that can move funds.
- **Voters and keyholders are separate.** Members vote with a passkey on their phone; only the council's hardware keys can sign for the treasury.
- **One DAO per codebase.** Each DAO forks this repo and owns its hosting, relays and keys. There is no shared platform.
- **Always recoverable.** With the recovery sheet and 3 council seeds, any standard wallet (e.g. Sparrow) can recover the funds without this software.

## Status

**Testnet4 prototype, stages 1–3 built.** The app (`app/`) covers founding, passkey sign-in, identity cards, the treasury page, proposals and votes, new members, leaving, key replacement, and payout rounds signed by the council and broadcast on testnet4. Next: the phase 1 gate, a real testnet4 payout run by five testers. The DAO relay runs on Cloudflare. The first instance is **UNO**, the trial DAO that runs the practice and testnet stages; the mainnet DAO that follows is named by its council.

Every DAO goes through three stages, each a separate DAO with its own tested build: a **practice** run on testnet4 with ten-minute votes, the **testnet** DAO with the real rules, and the **mainnet** DAO. The first two run on coins from the BTC DAO Testnet Treasury, end by closing the DAO and returning them, and are thrown away. See [`docs/guide.md`](docs/guide.md#8-the-three-stages-practice-testnet-mainnet).

Nothing here is ready for real funds.

| Home and treasury | Proposals | Council signing |
| --- | --- | --- |
| ![Home](design/screens/Main.png) | ![Proposals](design/screens/Proposals.png) | ![Signing](design/screens/Signing.png) |

All 19 screens are in [`design/`](design/README.md).

## Contents

| Path | What it holds |
| --- | --- |
| `docs/what-is-a-bitcoin-dao.md`, `docs/what-is-a-bitcoin-dao.it.md` | A plain-language introduction, in English and Italian: what a Bitcoin DAO is, how it works, what it can be used for |
| `docs/wallet-guide.it.md`, `docs/wallet-guide.en.md` | "Your first bitcoin wallet in 5 minutes" for members, in Italian and English |
| `docs/testnet-treasury.md` | The BTC DAO Testnet Treasury: the organisation's testnet4 wallet that funds every practice and testnet stage and gets the coins back when each one closes |
| `docs/charter-template.it.md`, `docs/charter-template.en.md` | The founding charter template, Italian (binding) and English: each DAO fills in its name and purpose and keeps its copy in `config/` |
| `docs/guide.md` | The step-by-step guide to founding and running a DAO, from preparation to closing, with a register of the gaps still open |
| `docs/spec.md` | The full specification v0.2: roles, keys, onboarding (in person and remote), treasury, governance, proposal fields, payout rounds, event formats, threat model, security requirements, build plan |
| `docs/protocol.md` | The protocol draft v1: every event's exact format, its validity rules, PSBT requirements and how a client rebuilds the DAO's state |
| `docs/test-cases.md` | Test cases every client must pass, test vectors, and the protocol gaps they exposed |
| `docs/decisions.md` | Decisions taken so far and open questions |
| `design/` | The mock-up screens (Italian) as source and PNG, plus the spec's diagrams |
| `app/` | The DAO's website: founding, sign-in, identity cards, treasury, proposals and votes, membership, payout rounds (the phase 1 prototype), with unit and end-to-end tests |
| `relay/` | The DAO's own Nostr relay: Nosflare set up to keep only the DAO's events, with deployment steps for Cloudflare |
| `tools/render-mockups/` | Regenerates the screen PNGs from the source files |
| `config/example.testnet4.json` | Example config, for UNO's testnet stage, with placeholders |
| `config/example.charter.it.md`, `config/example.charter.en.md` | UNO's charter, filled in from the template |
| `FORK-TASKS.md` | What must be true before this repo counts as released |

## Build plan

1. **Testnet4 prototype**: passkey sign-in, proposals and votes as Nostr events, 3-of-5 testnet4 treasury, payout round end to end; site on GitHub Pages, relay on Nosflare.
2. **Hardware signing on testnet4**: SeedSigner QR signing, recovery sheet, restore tested in Sparrow.
3. **The first DAO on mainnet**: key ceremony, capped treasury, three monthly rounds without developer help.
4. **Fork kit**: setup wizard, template repo, one-click deploy, dashboard listing.

## Licence

Not yet chosen. The licence is added last, once the fork tasks are done and the code is field-tested.
