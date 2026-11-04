# Decisions and open questions

## Decided (design stage, November 2026)

| Topic | Decision |
| --- | --- |
| Chain | Bitcoin only; no tokens, no token-weighted voting, no function calls |
| Model | One DAO per codebase; each DAO forks this repo. A separate read-only dashboard lists DAOs that opt in |
| Treasury | P2WSH 3-of-5 sorted multisig; payouts are PSBTs; council signatures are the binding approval |
| Lightning | Not in v1. Later: payouts to Lightning by swap, then a capped Lightning "Purse" |
| Roles | Members vote; council members hold treasury keys. Voting and signing rights are separated by keys, not only by policy |
| Member identity | A random Nostr key, encrypted by the member's passkey (PRF) and kept in the browser and on the relays, so a synced passkey opens it on any device |
| Identity cards | Paper backup of the identity key as one QR card each, printed straight from the browser, no passwords, no files. Optional for ordinary members; required for council members before the key ceremony, kept apart from their SeedQR card. Two split cards for the council were considered and dropped: one council identity key is only one of the 3 approvals any change needs |
| Founding | The first members join at a founding meeting: they sign up in setup mode, the council verifies each short code aloud, and they are listed in the genesis config (`council` and `founders`). The council's endorsement of the genesis is their verification. Keys are protected by the passkey and cards printed once the DAO id exists |
| Voting | Every vote runs its full 7 days (no early close). Quorum is one third of eligible voters, rounded up; there is no "inactive member" status. A recipient who is a member may vote on their own payout. A member whose key is replaced mid-vote keeps their vote |
| Proposal numbers | Derived by every client from publication time, then fixed for good by the signed tally; a proposal dated before the last tallied one is rejected |
| Settings | Rules, council keys, threshold and descriptor form one versioned record (`dao.settings`), changed only by a passed proposal and 3 endorsements; a council change also needs its migration's receipt. Two conflicting versions of the roster or settings are disputed until the next version picks one |
| Payout rounds | One open round at a time; a replacement round must spend one of the same coins, so two rounds can never both pay. A passed payout lapses if unpaid by the second round date after its tally |
| Donations and cap | The treasury page shows one donation address until it is paid (wallets always find every coin on restore); no address is shown at the trial cap, and a balance over the cap goes to a members' vote |
| Fees | The fee cap is a fee rate (20 sat/vB in the reference rules); a month whose fees are above it gets no round, and does not count toward lapse |
| Housekeeping | Council apps publish final counts, receipts and timestamps automatically; round dates use the settings' time zone (Europe/Rome); council members export the event history after every round and keep the last two |
| Council change | The old recovery sheet is archived and the old treasury watched, with late arrivals swept across; only the outgoing member's SeedQR card and plate are destroyed, after the new treasury is tested |
| Software updates | Announced as statement proposals before deployment; releases signed and reproducible; the app and the listing show version and build fingerprint, and the dashboard flags mismatches |
| Stages | Every DAO is founded three times, each a separate DAO with its own tested build: **practice** (testnet4, ~10-minute votes, 3–5 people, one sitting), **testnet** (testnet4, real rules, all founders) and **mainnet**. Practice and testnet are thrown away. A btc-dao version moves to the next stage only after passing the previous one. The first DAO's trial stages are called **UNO** (`uno-practice`, `uno-testnet`); the mainnet DAO is named by its council, which chooses the name, and so the domain, before the mainnet founding |
| Test coins | The organisation keeps one testnet4 wallet, the **BTC DAO Testnet Treasury** ([testnet-treasury.md](testnet-treasury.md)). It funds every practice and testnet stage, and each of those stages ends by closing the DAO with the whole balance returned to it |
| Trial to mainnet | Every trial member is listed as a founder of the mainnet DAO, with new keys and cards; no one is voted in twice |
| Closing a DAO | A "Close the DAO" proposal names the destination wallet; two-thirds majority; a final round pays the whole balance there, then the settings are marked closed |
| Trial network | testnet4, not signet: members can receive test payments on their phones with Nunchuk or Mycelium Testnet, and the organisers already hold test coins. Confirmations are less regular than on signet |
| Trial sites | GitHub Pages at `bitcoin-dao.github.io/uno-practice` and `bitcoin-dao.github.io/uno-testnet`; passkeys tied to `bitcoin-dao.github.io`; content security policy set inside the page |
| DAO relay | Nosflare on Cloudflare Workers under the Bitcoin-DAO account; only the DAO's kinds (3570–3586) with its `D` tag; no pay-to-relay. Trial at `btc-dao-relay.btcdao.workers.dev`, the mainnet DAO's own relay on its own domain |
| Wallet for members | BlueWallet for mainnet payouts; Nunchuk or Mycelium Testnet for the trial |
| Moving address | If the domain is lost, the council endorses a new address in a `dao.listing`; members scan their cards there and make a new passkey. Same identities, no re-verification. Members find the new address on btcdao.tech (a separate domain) or from the council; every card carries that fallback line. The DAO relay on the lost domain is replaced, and public relays bridge the gap |
| Votes | Public by name, like everything else in the record: every vote is a signed event, and each proposal's page lists who voted what |
| Round timing | Round dates count for lapse: the 1st of each month (Europe/Rome) by default, or every Monday when a DAO sets `payoutRound` to `weekly` (labels `2026-W45`); the council may prepare a round at any time, so the trial can test payouts without waiting |
| Standing payout addresses | A member may confirm one address for all their payouts, until they replace or withdraw it; a payout output names the member it is for, and the match is checked when the round is published. Ends on leaving, removal or key replacement. Each member chooses; no DAO setting. A standing xpub was dropped: it would reveal the whole wallet branch |
| Trial signing keys | In the testnet4 trial each council phone makes a test treasury key (12 words, shown on the profile), signs rounds in the browser, and can export the PSBT to Sparrow or Nunchuk instead; SeedSigner arrives in phase 2 |
| Signing (first DAO) | One shared SeedSigner plus a spare; each council member has their own verified SD card, a 12-word CompactSeedQR card (21x21) and a steel plate at home. No passphrase in the trial |
| Addresses | Shown as SeedSigner shows them: first 7 and last 7 characters highlighted, middle in full; compared in full |
| Proposals | Short binding summary plus optional link with a fingerprint; wallet address in its own validated field; recipient confirms the address, with no deadline: an unconfirmed passed payout waits and lapses after 2 rounds |
| Vote counting | A council member signs the final tally at close; the tally is anchored with OpenTimestamps |
| Onboarding | Sponsor plus council verification, in person or by video call (two council members for remote); consent to public record and age 18+ |
| Leaving and key loss | Members leave without a vote; lost keys are replaced after re-verification and 3 council endorsements |
| Recovery | Recovery sheet with the descriptor is essential: 3 seeds alone cannot recover a multisig |
| Repo | `btc-dao` under the Bitcoin-DAO organisation; UNO is the first instance. Licence added last |
| Protocol | Defined in `protocol.md`: Nostr events in a provisional kind block 3570–3586, all regular so history is kept; every event tagged with the DAO id |
| Charter | A short core template in English, holding only principles; numbers and procedures stay in the settings. Everything else is an optional module in `docs/charter-modules/`. Each DAO sets its binding charter language in the settings (`charterLanguage`) |
| Funding model | Each DAO chooses a primary funding model (grant, production, mutual or revolving) after reading `funding-models.md` and discussing it at a members' meeting, before drafting its mainnet charter. Recorded in the settings (`fundingModel`), named in charter Article 1, shown on the dashboard as label and colour, beside the DAO's steady I/O (median monthly inflow ÷ median monthly outflow, 12 months), which tests whether the model is working |
| Member assets | A DAO that buys assets for its members works like a buying group (*gruppo di acquisto solidale*): members own the assets, the DAO runs the arrangement. Pledged sats are **held for members**, not DAO funds: they stay in the same treasury, at pledge addresses on its receive branch, and their coins are never spent with the DAO's or for anything but their pledge's asset or refund. No second wallet. The treasury balance shows **DAO funds** and **held for members**; pledges are shown as **pledged**, never as income or capital |
| DAO id | SHA-256 of the canonical (RFC 8785) genesis config; never changes |
| Identity per DAO | The passkey-derived key is salted with the DAO id, so one passkey gives unlinkable identities in different DAOs |
| Domains | `btcdao.tech` for the project (about, guides, fork kit, read-only dashboard); the mainnet DAO gets its own domain, chosen with its name by the council, with the relay on a subdomain; passkeys are tied to that domain so all its subdomains share them |
| Domain care | Several years paid with auto-renew; two council members can reach the registrar account. A lapsed domain locks members out of signing in |

## Open questions

- [ ] Sun to Sats showcase (`showcase-sun-to-sats.md`): distribution rule and reserve share. Weekly rounds with `lapseAfterRounds` 4, and standing payout addresses, are decided and in the protocol
- [ ] Sun to Sats sunblocks (Layer 01, `showcase-sun-to-sats.md` section 6): distribution weights for base and panel shares, price risk on instalments, whether non-members can pledge, how a pledge address goes on the public record, and deferred payouts: members opting in to have their weekly share paid into their own pledge (section 6, decision 5)
- [ ] Legal check: does holding pledges for members count as holding client money (Italy, UK)? Add to the custody question below
- [ ] Which funding model for UNO's mainnet DAO? Members to read `funding-models.md` and decide before the mainnet charter is drafted
- [ ] Who are UNO's five council members, and who are the founding members?
- [ ] What is the mainnet DAO called? The council decides, before the mainnet founding; the domain follows the name
- [ ] Is a quorum of one third right for a small founding group?
- [ ] Which host for the mainnet site?
- [ ] Who registers the mainnet DAO's domain? The DAO has no legal entity, so the registrant must be a person or organisation that qualifies; record who, and plan how it passes on
- [ ] Can OpenTimestamps calendars be reached from the browser, or is a small helper needed?
- [ ] Does SeedSigner's current firmware verify change against a loaded P2WSH multisig descriptor? Test before phase 2
- [ ] Is passkey PRF supported on every member's phone? (Confirmed on the first Android phone tested)
- [ ] Are kinds 3570–3586 free? Registry and GitHub checked on 4 November 2026: no NIP defines any kind from 3500 to 3699 (nostr-protocol/nips at commit 400d157), and GitHub code search found no Nostr use of these kinds. Still to do: query a few large relays for kinds 3570–3586 (for example `nak req -k 3570 -k 3585 wss://relay.damus.io`)
- [ ] Keep the `D` tag or change it before v1? NIP-CC (Geocaching) already uses `D` for cache difficulty (values 1–5, kind 37516). No clash in practice, since btc-dao always filters `#D` together with kinds 3570–3586 and a DAO id is 64 hex characters; but the letter is shared, so either note that in the NIP draft or pick a letter no NIP uses
- [ ] Should testnet stages publish their events to relays, or keep all data local to the DAO, with only mainnet publishing? See `dashboard-spec.md` section 9
- [ ] After UNO's testnet stage closes, replace the relay's D1 database with one under a generic name (`relay/README.md`, "To do"). Left as is until then
- [ ] Legal check (Italy, UK): confirm keyless coordination software is not custody
- [ ] Legal review of the core charter (`charter-template.en.md`), the personal data module, UNO's charter and the wallet guide
- [ ] Rebuild UNO's charter from the core template plus the modules it needs (likely council handbook, use of funds, conduct, language, personal data, trial phase), with Italian as its binding language
