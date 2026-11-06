# btc-dao — Bitcoin DAO Specification v0.2

Nov 4, 2026 · Bitcoin-DAO organisation

## Purpose and principles

This software gives one community a SputnikDAO-style experience on Bitcoin alone: members propose and vote, a council of keyholders approves payouts, and anyone can audit the treasury. It is built for one DAO and copied (forked) by each new DAO, never run as a shared platform.

Design principles:

- **Bitcoin only.** The treasury is an on-chain multisig. No tokens, no other chain, no bridge.
- **One DAO per codebase.** Each DAO owns its repo, hosting, relays and keys. Nobody sits in the middle.
- **Keyless software.** The website and any server never hold a key that can move funds. Partial signatures alone cannot spend.
- **Approval is execution.** A payout is a PSBT; council signatures are the binding vote. The transaction becomes valid at the threshold, never before.
- **Separate identity from money.** Keys for logging in and voting are never the keys that sign for the treasury.
- **Standards over invention.** PSBT (BIP-174/370), standard wallet descriptors, Nostr events. Sparrow or any standard wallet can always recover the funds without this software.
- **No tech skills to take part.** Members never see the words PSBT, xpub or descriptor.
- **Public by default.** Members, rules, proposals, votes, balance and payouts are visible to anyone.
- **Static and forkable.** Static files plus one config file. The fork-readiness checklist defines when the code counts as released.

## UNO: the first instance

UNO is the first deployment and the proof of concept: a 3-of-5 council and its founding members, rehearsing on testnet4 in two disposable stages, uno-practice and uno-testnet. The mainnet DAO that follows is named by its council. The code is released only once that DAO runs on mainnet and the fork kit has been proven on a second group.

| Setting | UNO value | Configurable in a fork |
| --- | --- | --- |
| Purpose | Fund a local bitcoin community | Yes |
| Council | 5 keyholders | Yes |
| Signing threshold | 3 of 5 | Yes |
| Treasury type | P2WSH sorted multisig | Fixed in v1 |
| Signing devices | One shared SeedSigner plus a spare; each member has their own SD card and SeedQR card | Yes |
| Voting | One member, one vote | Fixed in v1 |
| Payout cadence | Monthly payout round | Yes |
| Network | Testnet4 for the trial, then mainnet | Yes |
| Interface languages | Italian and English | Yes |

Why 3-of-5: the treasury survives two lost or unavailable keys, and no two people can move funds alone. The five keyholders should not share a household or employer.

## Roles

Four roles; one person can hold several. Only the council holds treasury keys.

| Role | Who | Can do | Needs |
| --- | --- | --- | --- |
| Observer | Anyone | See members, rules, proposals, votes, balance, payouts | A browser |
| Member | Admitted by member vote and council endorsement | Propose, vote, comment | Passkey sign-in (identity key created in the browser) |
| Council member | One of the 5 treasury keyholders, also a member | Endorse roster and rule changes, prepare and sign payout rounds | Own SeedSigner SD card, SeedQR card, steel seed plate at home, recovery sheet |
| Maintainer | Whoever keeps the DAO's fork up to date | Merge upstream releases, edit the config by approved proposal | Repo access; no treasury key |

### Council member duties

1. **Joining (once):** attend the key ceremony, create a seed from dice, stamp it on steel, make a SeedQR card, export the public key (xpub) by QR, load the finished wallet descriptor onto the device, keep the recovery sheet.
2. **Each round:** read the passed proposals, check every output on the device screen, sign or decline with a reason.
3. **On change:** report a lost or exposed seed at once; leaving the council triggers a migration to a new multisig.

Rules: never type a seed into a phone or computer, never photograph it, never sign what the device screen does not confirm, never share a seed with another member, never store SeedQR cards together or with the shared device.

## Architecture

The DAO is a static website, one config file, Nostr relays and a public chain API; there is no backend server and nothing to take down except files anyone can re-host.

![Architecture: no server holds a key; the browser coordinates, the council signs](../design/diagrams/architecture.png)

The browser does all coordination: it rebuilds state from events, tallies votes, builds payout PSBTs and broadcasts once 3 signatures arrive. Only the SeedSigners can sign for the treasury, and they never touch the network.

## Identity and keys

Each person has an identity key for signing in and voting, and each council member also has a separate treasury key on a hardware device. Losing or leaking one never exposes the other.

| Key | Holder | Used for | Lives in | If lost |
| --- | --- | --- | --- | --- |
| Identity key (Nostr) | Every member | Sign-in, proposals, votes, endorsements | Random key, encrypted by the member's passkey; backed up on a printed identity card | A synced passkey or the identity card(s) restore it on any device or address; otherwise key replacement after re-verification |
| Treasury key | Each council member | Signing payout rounds and migrations | SeedQR card carried to signing; steel plate kept at home; loaded into the shared SeedSigner only while signing | Threshold still met; council migrates to a new multisig |

Sign-in for members:

1. A member opens the DAO site and taps **Join** or **Sign in**.
2. The phone creates a passkey (fingerprint or face) and a random identity key. The passkey encrypts the key using the passkey PRF extension; the encrypted copy is kept in the browser and on the DAO's relays, so any device where the member's passkey syncs opens it automatically. Where the phone cannot do this, the key stays in that browser and the identity card is used on other devices.
3. Members who already use Nostr can sign in with their existing key through a browser extension instead.

### Identity cards

Every member can also hold their identity key on paper, so the DAO survives losing its domain or a member losing their passkey. There are no passwords and no files to keep.

| Who | Card | When |
| --- | --- | --- |
| Ordinary member | One card: the identity key as a QR code | Optional |
| Council member | One card: the identity key as a QR code | Required before the key ceremony; kept apart from the SeedQR card |

- **Printing:** from the member's profile page, straight from the browser to the printer. The card is never saved as a file or shared, so no digital copy is left behind. Every card also carries one fixed line: if the DAO's address stops working, find the new address at btcdao.tech or ask a council member. Each card also shows the DAO name, the member's pseudonym and short code.
- **Keeping:** like a house key. Council members keep theirs apart from their SeedQR card, which is the one that can sign for the treasury.
- **Restoring:** on a new phone, after losing a passkey, or at a new web address, the member scans their card, checks the short code shown, and creates a new passkey, which then protects the same key. Identity, roster and votes carry on, with no re-verification.
- **Lost or exposed cards:** an ordinary member's card is their identity, so a finder could vote in their name until a key replacement; it can never move funds. A lost card is followed by a key replacement. A council member's card gives a finder one of the 3 council approvals any change needs, and never funds; the council replaces that key at once.
- **Members who skip the card** recover a lost passkey by key replacement.

### Moving to a new address

Passkeys are tied to the DAO's domain, and the passkey encryption is salted with the DAO id, so one passkey never links a member across DAOs. If the domain is lost, the app goes up at a new address and 3 council members endorse it in a signed `dao.listing` event. Members open the endorsed address, scan their cards and create a new passkey. The restore screen shows the endorsement, and members never scan a card on an address the council has not announced. Members learn the new address in two ways that do not depend on the lost domain: the DAO's entry on btcdao.tech, a separate domain, and an announcement by the council at a meetup or on a call. The DAO relay goes down with the domain, since it sits on a subdomain of it; the public relays still hold every event, and the endorsed listing names the new relays.

A member's identity key never controls money, so a phished member can cast false votes but cannot move funds: the council still has to sign.

## Member onboarding

A new member joins in about two minutes at a meetup and writes nothing down; three people take part, and each step leaves a signed record.

| Step | Candidate | Sponsor (a member) | Council member present |
| --- | --- | --- | --- |
| 1. Start | Opens the site, taps Become a member, picks a pseudonym | — | — |
| 2. Key | Creates a passkey; identity key derived from it | — | — |
| 3. Code | Shows a QR code and a short code | Scans it with Propose this member; both read the short code aloud | Scans the same code |
| 4. Verify | — | — | Signs a `dao.verify` event: verified in person, date |
| 5. Consent | Ticks the charter, privacy notice and age 18+ separately; sends | — | — |
| 6. Proposal | — | Publishes the pre-filled add-member proposal, linked to the verify event | — |
| 7. Admission | Waits; can browse but not vote | — | After the vote passes, 3 council members endorse the new roster |

### Rules for onboarding

- **Nothing to write down**: the passkey protects the key day to day, and the backup is a printed identity card.
- **Privacy consent is its own tick box:** the pseudonym and every vote are public and permanent. Real names are never required.
- **Age:** members must be 18 or over, confirmed by tick box and stated in the charter.
- **While waiting:** the done screen says voting opens after the 7-day vote and 3 council confirmations; the member sees their admission status at each sign-in.
- **Second device:** signing in on another device with the same synced passkey restores the identity; no transfer step.
- **Receiving payouts:** joining needs no wallet. After joining, the member is offered a short guide to set up a bitcoin wallet, needed only to receive payouts.
- **Key replacement:** a member who loses their passkey and has no backup is re-verified in person; the council member signs a `dao.rekey` event linking old and new keys, endorsed by 3 council members. No member vote is needed. Votes cast with the old key before the replacement stay valid; anything signed with the old key after it is ignored.
- **Leaving:** a member can leave at any time from their profile by signing a `dao.leave` event; the next roster version drops them without a vote. Their votes on still-open proposals are withdrawn; closed votes and their pseudonym stay in the public record. Their open proposals stay in voting, and payouts already approved to them stay valid. A council member cannot leave this way: a council-change proposal comes first.

New event types for onboarding: `dao.verify` (council member, verification of a candidate key, marked in person or remote), `dao.rekey` (council member, old and new identity key; valid with 3 council endorsements), `dao.leave` (member, own exit).

### Founding the DAO

The first members join at a founding meeting, because the normal route needs a sponsor, a council member and a vote that do not exist yet. Being listed in the DAO's founding settings, approved by the council, takes their place.

1. **Site in setup mode.** The site goes up at its address (bitcoin-dao.github.io/uno-testnet on GitHub Pages for the trial) before the DAO exists.
2. **Council ceremonies.** The five council members hold the SD card and key ceremonies, giving the treasury keys, the descriptor and the recovery sheet.
3. **Founder sign-up.** Each council member and each founding member taps Founder sign-up, creates a passkey and gets a random identity key, kept only in that browser for now. They show their short code; the setup phone scans it and both read it aloud. Remote founders do this on a video call.
4. **Founding settings.** The setup page builds the genesis config: name, rules, council (identity keys, fingerprints, xpubs), founding members (identity keys and names), descriptor, relays and passkey domain. Its hash is the DAO id.
5. **Publish and endorse.** A council member publishes the genesis config, and at least 3 council members endorse it. Their endorsement stands in for verifying each founder: they saw every short code read aloud and approved the list.
6. **Protect and print.** Each founder's app now knows the DAO id, so the passkey protects the key and the founder prints their identity card. Council members print theirs before signing anything.
7. **Normal joining.** From then on every new member joins by sponsor, verification and vote.

Until step 6 a founder's key lives in one browser only. If it is lost, they sign up again before the genesis config is published; after that, a lost key is an ordinary key replacement.

### Remote members

DAOs built on btc-dao are expected to be both local and spread across countries, so every in-person step has a video-call equivalent. Remote verification is slightly weaker on one point, one person joining once, so it is marked and can be limited by each DAO's rules.

| What in-person proves | Over video | Strength |
| --- | --- | --- |
| The key belongs to this person | Candidate sends their code by message or link; on the call they hold up their phone and read the short code aloud. The short code is derived from the key, so a swapped key shows a different code | Same |
| A real person, joining once | A face on camera, vouched for by a sponsor who knows them | Weaker |
| Someone vouches for them | Sponsor named on the record, as in person | Same |

Rules for remote verification:

- **Two council members on the call**, each signing a `dao.verify` event marked remote. In person, one is enough.
- **The sponsor must know the candidate personally**, not only online.
- **Remote members are marked** "verified remotely" on the members page. A later in-person verification removes the mark.
- **Calls are never recorded.** The signed verify events are the record.
- **Optional limits, set per DAO in the rules:** whether remote-only members may join the council, and a maximum share of remote-only members. UNO default: no limits, remote members may not join the council during the trial.

Remote working for the council:

- **Own signing devices.** A shared SeedSigner only works when the council meets in one place. Any council member not local signs with their own device; a spread-out DAO gives every council member their own.
- **Remote key ceremony.** Each council member creates their seed alone with their own device and dice, then shows their public key fingerprint on a call so the others record it on the recovery sheet.
- **Remote key replacement** follows remote verification: two council members on the call, then the usual 3 endorsements.

## Treasury

The treasury is a standard 3-of-5 P2WSH sorted multisig, chosen over Taproot because SeedSigner and most hardware signers handle it today and every standard wallet can recover it.

- **Derivation:** each council key exported at the BIP-48 multisig path `m/48'/0'/0'/2'` (testnet4: `m/48'/1'/0'/2'`).
- **Descriptor:** `wsh(sortedmulti(3, [fp1/48'/0'/0'/2']xpub1/<0;1>/*, … five keys …))` with its checksum. Receive addresses use branch 0, change uses branch 1.
- **Watch-only:** the website holds the descriptor only. It derives addresses, shows balance and history, and builds PSBTs, but cannot sign.
- **Device check:** each SeedSigner has the descriptor loaded by QR, so it can confirm that change returns to the treasury.
- **Donation address:** the treasury page shows one donation address and keeps showing it until it receives a payment, then moves to the next. Unused addresses never pile up, so a standard wallet restoring from the recovery sheet always finds every coin. Once the balance reaches the trial cap, the page stops showing a donation address; a balance that goes over the cap anyway is put to the members, who vote to raise the cap or pay out the excess.

### Recovery sheet

A one-page printout produced at setup, held by every council member and published in the repo:

- DAO name, network, threshold (3 of 5) and creation date
- The full descriptor with checksum, as text and QR
- The five key fingerprints, each labelled with its holder's role
- Plain steps to restore in Sparrow: import the descriptor, gather any 3 seeds, sign, broadcast

The sheet cannot spend anything on its own. With any 3 seeds it recovers the whole treasury without this software, its relays or its website.

**Seeds alone are not enough.** In a multisig, recovering the funds needs all five public keys as well as 3 seeds, and only the recovery sheet holds all five. Losing every copy of the sheet is as serious as losing 3 seeds. So the sheet is kept in several places: one printed copy per council member, stored away from their seed; a copy in the public btc-dao repository; and a new version issued after every council change. The warning is printed at the top of the sheet itself.

### Signing setup for the trial

The first mainnet DAO uses one shared SeedSigner, and no single item a council member carries can move funds: each SeedQR card is one full key, and 3 are needed.

| Item | Held by | Contains | Kept |
| --- | --- | --- | --- |
| SeedSigner device, plus a spare | The council, shared | No keys or software | Anywhere; it is stateless |
| SD card | Each member, their own | Official SeedSigner image, verified at the SD card ceremony; no seed | With the member |
| SeedQR card | Each member | Their seed as a QR code: one full key | Carried to signing, taken home after; never stored with other cards or the device |
| Steel plate | Each member | Their seed words: the backup | At home, never carried |
| Recovery sheet | Every member, public in repo | Descriptor and fingerprints; no keys | Anywhere |

Signing: insert your own SD card, boot, scan your SeedQR card, check the fingerprint shown matches your line on the recovery sheet, scan the payout QR, check outputs on screen, show the signed QR.

No passphrase in the trial. Adding one later changes each public key, so it is done as a council-change migration to a new multisig. After any council change the old recovery sheet is archived, not destroyed: continuing members' keys can still spend anything sent to the old treasury, so clients keep watching it and sweep any late arrival into the new one. Only the outgoing member's SeedQR card and steel plate are destroyed, in front of another council member, once the new treasury has been tested in Sparrow. Members may also use their own SeedSigner, which forks spread over distance will need.

## Governance rules

Members decide by vote; the council makes money decisions binding by signing and makes membership and rule changes binding by endorsing. Every rule below is a value in the config file; UNO's defaults are shown.

### Proposal types

| Type | What it does | Pass rule (UNO default) | Made binding by |
| --- | --- | --- | --- |
| Payout | Pays one or more recipients from the treasury | Simple majority, quorum met | 3 council signatures in a payout round |
| Statement | Adopts a text: a decision, manifesto or policy | Simple majority, quorum met | The passed vote itself |
| Add member | Admits a person by their identity key | Simple majority, quorum met | 3 council endorsements of the new roster |
| Remove member | Removes a person from the roster | Two-thirds majority, quorum met | 3 council endorsements of the new roster |
| Change rules | Edits governance values (periods, quorum, cadence) | Two-thirds majority, quorum met | 3 council endorsements of the new rules |
| Change council | Replaces a keyholder or the threshold | Two-thirds majority, quorum met | 3 council signatures on the migration transaction, then 3 endorsements of the new settings |
| Close the DAO | Ends the DAO: pays the whole balance to the wallet named in the proposal; no proposals are accepted afterwards | Two-thirds majority, quorum met | 3 council signatures on the closing transaction, then 3 endorsements of the final settings |

### Voting

- **Who votes:** every member on the roster when the proposal was published, one vote each: yes, no or abstain. A member who leaves or is removed before the close loses their vote. A member whose key is replaced during the vote keeps it, and votes with the new key.
- **Voting period:** 7 days from publication. Every vote runs its full period; there is no early close, because votes can change until the end.
- **Quorum:** at least one third of eligible voters, rounded up, cast a vote. Abstain counts toward quorum.
- **Votes are public** and signed; a member may change their vote until the period ends.
- **Final tally:** at the close a council member signs the list of votes that counted (S3), with the proposal's number. Every council member's app publishes it automatically the first time it opens after the close, unless a valid tally is already there; identical tallies from different council members are one tally, not a dispute. Clients use it instead of recounting. Two conflicting tallies leave the proposal disputed until 3 council members endorse one.

### Lifecycle

1. **Draft:** any member writes a proposal; payouts carry amount, recipient address and purpose.
2. **Voting:** open for the voting period.
3. **Passed** or **Rejected:** fixed by the signed final tally when the voting period ends.
4. **Binding step:** passed payouts join the next payout round; roster and rule changes await council endorsement.
5. **Done** with a receipt, **Declined** by the council with a public reason, or **Lapsed** if not made binding within 2 payout rounds.

Past proposals of every status stay visible forever. The council may decline a passed payout, but must publish why; that refusal is itself part of the public record.

Proposal numbers (UNO-0007) are not stored in events. Every client numbers valid proposals by publication time, then event id, so all clients show the same numbers without a coordinator. The signed final tally records the number for good, and a proposal dated before the most recently tallied one is rejected, so a backdated proposal cannot renumber closed ones.

## Proposal fields

Every proposal has a short binding summary plus an optional link to the full text; discussion happens outside the app, as in Sputnik DAO. Wallet details always go in their own validated field, never in free text.

### Fields on every proposal

| Field | Filled by | Notes |
| --- | --- | --- |
| Proposal ID | Automatic | e.g. UNO-0007 |
| Type | Proposer | Payout, Statement, Add member, Remove member, Change rules, Change council, Close the DAO |
| Title | Proposer | Up to 80 characters |
| Summary | Proposer | Up to 500 characters; the binding text members vote on |
| Full proposal link | Proposer | Optional URL for detail, budgets, images |
| Link fingerprint | Automatic | Hash of the linked page at submission, so later edits are detectable |
| Language | Proposer | Italian or English |
| Proposer | Automatic | Display name, from the signed identity key |
| Created, voting closes | Automatic | Close date from the rules |
| Status | Automatic | Voting, Passed, Rejected, In round, Done, Declined, Lapsed |

### Extra fields by type

| Type | Field | Notes |
| --- | --- | --- |
| Payout | Recipient name | Display name; may be a non-member |
| Payout | Recipient bitcoin address | Own box; paste or scan QR; checked for format and network; treasury's own addresses rejected |
| Payout | Amount (sats) | Fixed in sats; euro estimate shown |
| Payout | Recipient confirmation | Recipient confirms the address; required when proposer and recipient differ |
| Add member | Candidate display name | Pseudonym allowed |
| Add member | Candidate identity key | Created at in-person sign-up |
| Add member | Sponsor | Automatic: the proposer |
| Add member | Verified in person by | Council member present at sign-up |
| Remove member | Member, reason | — |
| Change rules | Setting, current value, proposed value | Current value filled automatically |
| Change council | Outgoing and incoming member | Incoming must already be a member |
| Change council | Incoming public key and fingerprint | From their key ceremony |
| Change council | New threshold | 3 unless changed |
| Change council | New treasury address | Automatic, from the new multisig |
| Close the DAO | Destination wallet address | Where the whole balance goes; checked and confirmed like a payout address |

Statements use the common fields only.

### Recipient address flow

1. The recipient shows a fresh receive address from their own wallet as a QR code.
2. The proposer scans it into the address box, or the recipient enters it if they are a member.
3. If proposer and recipient differ, the recipient confirms the address on the proposal page. Confirming is the recipient's responsibility and can happen at any time; a passed payout joins a payout round only once it is confirmed, and lapses like any other if it is not made binding within 2 rounds.
4. At signing, each council member checks the address on the SeedSigner screen against the proposal page.

Proposals are public forever, so recipients should use an address not reused elsewhere. A Lightning address option follows once payouts by swap arrive.

## Payout rounds and signing

All payouts passed since the last round go out together in one monthly transaction, so the council signs once a month and fees are shared.

![Payout round: a payout moves only when the third council device signs](../design/diagrams/payout-round.png)

- **Prepare:** any council member presses Prepare round. The browser builds one PSBT paying every passed proposal, with change back to the treasury and a fee rate from the chain API, at most the fee-rate cap. If fees are above the cap, no round is built that month: payouts wait, and a month skipped for fees does not count toward their lapse, and publishes it as a `dao.round` event.
- **Verify:** every other browser rebuilds the expected outputs from the passed proposals and refuses to show Sign if they differ by a single sat.
- **Sign:** members sign in any order, alone or at a council meeting. Each partial signature is published; on its own it can spend nothing.
- **Broadcast:** the browser that sees the third valid signature combines them and broadcasts; any other browser can rebroadcast.
- **Decline:** a council member may refuse with a public reason; a round that never reaches 3 signatures lapses after 2 rounds. Only one round is open at a time: a replacement round spends at least one of the same coins, so the two can never both be paid.

## Event formats

All DAO activity is signed Nostr events, published to the DAO's own relay plus at least two public relays. The DAO relay runs Nosflare on Cloudflare, set to accept only the DAO's event kinds (3570–3586) carrying its D tag, with paid access turned off. Every client rebuilds the DAO's state from these events and the chain; nothing is trusted because a server said so.

Every event carries a `D` tag holding the DAO id and a `v` tag with the protocol version. The DAO id is the SHA-256 of the canonical genesis config, so it never changes. Kinds 3570–3586 are a provisional block of regular events, so relays keep the full history.

The events, their fields and validity rules are defined in one place only: [`protocol.md`](protocol.md), section 2 lists them all. Another team can write a compatible client from it alone.

## Public record and anchoring

Anyone can open the DAO site without signing in and check every figure against the chain and the signed events.

The public pages:

- **Treasury:** balance in sats (euro estimate beside it), the receive address with QR, every incoming and outgoing transaction, each payout linked to its proposal and round.
- **Proposals:** open, passed, rejected, declined and lapsed, with vote tallies and each member's vote.
- **Members:** the current roster, its version history, and the council with each member's key fingerprint.
- **Rules:** the governance values in force and when each last changed.
- **Recovery:** the recovery sheet, downloadable as PDF.

### Anchoring

When a proposal closes, any member's browser computes a digest of the proposal, its votes, its address confirmations and its signed tally and timestamps it with OpenTimestamps, which batches many hashes into one Bitcoin transaction at no cost to the DAO. The proof is published as a `dao.anchor` event. Anchoring proves the record existed unchanged at that block; it does not keep the record available, so each council member exports the DAO's full event history (one button on the site) after every payout round and keeps the last two exports.

## Fork kit, config and dashboard

A new DAO is a fork of the repo plus its own `dao.config.json`; everything that makes a DAO itself lives in that one file, and it holds no secrets. Keeping code and config apart lets forks merge upstream security fixes cleanly.

### Config file

| Field | Holds | Example (UNO) |
| --- | --- | --- |
| `name`, `description`, `languages` | Identity and interface languages | UNO; it, en |
| `network` | testnet4 or mainnet | testnet4, then mainnet |
| `site` | The DAO's web address | https://bitcoin-dao.github.io/uno-testnet; on mainnet, the domain the council chooses |
| `passkeyDomain` | The domain passkeys are tied to; never changes within a DAO (trial: bitcoin-dao.github.io) | chosen by the council with the mainnet name |
| `council` | 5 entries: role label, identity key, key fingerprint, xpub | — |
| `founders` | Founding members who are not on the council: name and identity key | Listed at the founding meeting |
| `threshold` | Signatures needed | 3 |
| `descriptor` | Treasury descriptor with checksum | `wsh(sortedmulti(3, …))#…` |
| `relays` | DAO relay first, then public relays | trial: a Nosflare relay on Cloudflare plus 2 public relays; mainnet: wss://relay.\<the DAO's domain> plus 2 public relays |
| `chainApi` | Chain sources, in order of preference: Esplora APIs (mempool.space style) and Blockbook servers, written `blockbook:<address>`. A source that fails is asked last for five minutes. The site's current list is used first, then the one recorded at founding: a source can show data but never move coins | public explorers, own node later |
| `rules` | Voting period, quorum, majorities, payout cadence and time zone, lapse limit, fee-rate cap, treasury cap | 7 days; 1/3; simple and 2/3; monthly, Europe/Rome; 2 rounds; 20 sat/vB; 5,000,000 sats |
| `branding` | Logo, colours | — |

The config is the genesis state only. Later roster and rule changes live in endorsed events; the maintainer folds them back into the config at each release. A new software version is announced to members as a statement proposal before it is deployed; releases are signed, the app shows its version and build fingerprint on the Rules page, and the dashboard flags DAOs running outdated versions.

### Fork kit

For a group without a developer:

1. A setup wizard on the site asks plain questions (name, languages, council size, threshold, rules) and collects each council member's xpub by QR at the key ceremony.
2. It produces the config file and the recovery sheet.
3. One-click deploy to free static hosting from a template repo.
4. A checklist walks the group through testing on testnet4 before mainnet.

### Read-only dashboard

A separate static site shows DAOs that switch on listing, with their reconciled treasury, proposals and software version. It holds no keys and changes nothing; anyone can run their own copy, and DAOs work normally if it goes down. Defined in [`dashboard-spec.md`](dashboard-spec.md).

## Threat model

The signing device's screen is the final authority: no attack on the website, relays or member accounts can move funds without 3 council members approving outputs on their own devices.

| Threat | Effect | Safeguard |
| --- | --- | --- |
| Website code tampered with | Shows false proposals or builds a PSBT paying an attacker | Device screen check; descriptor on device verifies change; pinned, bundled dependencies; signed releases; reproducible build |
| Relay censors or drops events | Proposals or votes missing | Events on 3+ relays; council keeps event exports; anchors prove what existed |
| Member identity key phished | False votes or proposals in that member's name | Council review before signing; remove-member vote; votes visible to all |
| Council member's seed lost | One key gone | Threshold still met; council-change migration |
| Council member's SeedQR card or seed lost or exposed | Attacker holds 1 of 3 needed keys | Report at once; migrate before any further loss; cards never stored together |
| Three council members collude | Funds moved against the member vote | Public record of every payout and vote; members choose keyholders; council-change by members' 2/3 vote |
| Software or site disappears | No interface | Recovery sheet plus 3 seeds restore in Sparrow |
| Domain lost or not renewed | Members' passkeys stop working; the site has to move | Several years paid with auto-renew; two council members can reach the registrar account; members restore from identity cards at a council-endorsed new address; the recovery sheet still recovers funds |
| Device vendor bug | Faulty signing on one brand | Mixed devices: no single brand holds 3 keys |

The software never holds a key that can move funds, so it is coordination software, not a custodian. That position should be confirmed with an adviser in Italy and the UK before mainnet, given MiCA.

## Security requirements

The design review found the treasury safe for a capped trial, provided the requirements below are met; each is tied to the phase gate it must pass.

| ID | Requirement | Why | Gate |
| --- | --- | --- | --- |
| S1 | Show every address in full, laid out as SeedSigner shows it: first 7 and last 7 characters highlighted, the middle in full between them. Council members compare the whole address on the device, middle included, never just the highlighted ends | Look-alike addresses matching the ends are cheap to generate | Phase 1 |
| S2 | Strict content security policy, no third-party scripts, pinned and bundled libraries, signed releases with a published hash, and a mirror of the site on a second host. On GitHub Pages, used for the trial, the policy is set inside the page, because custom headers are not possible | A tampered website could show correct payouts while building different ones | Phase 1 |
| S3 | At voting close, a council member publishes a signed final tally listing exactly which votes counted; the tally is what gets anchored, and late events are ignored | Nostr timestamps are set by the signer, so votes can be backdated | Phase 1 |
| S4 | Written state rules plus test cases for edge cases: duplicate votes, a member removed mid-vote, out-of-order events, events from other DAOs | Bugs in rebuilding state from events could allow forged roster or rule changes | Phase 1 |
| S5 | A fee-rate ceiling in the rules; the app refuses to show Sign above it, and the round waits instead | A malicious or mistaken round could burn funds in fees | Phase 1 |
| S6 | Identity keys encrypted by the passkey in the browser; identity cards printed straight from the browser, never saved as files; S2 measures protect them | Stolen identity keys allow false votes, never fund movement | Phase 1 |
| S7 | The wallet descriptor is loaded on the SeedSigner at every signing and change shows as verified; skipping verification is not allowed. SeedSigner shows change addresses on one line only, so this check is what protects the change | Otherwise a round could quietly redirect the change | Phase 2 (hard gate) |
| S8 | Main and spare SeedSigner bought from different sources, sealed between rounds; signing times not announced | Hardware tampering, and three SeedQR cards in one room | Phase 3 |
| S9 | Treasury capped during the trial at an amount the community can afford to lose; the cap is a rule changed only by a two-thirds vote, and the donation address is hidden once it is reached | Limits the cost of any flaw not yet found | Phase 3 |

Audit timing: this design review now; an independent code review by a bitcoin-experienced developer at the end of phase 2, before mainnet funds; a sats bug bounty once the fork kit is public.

## Out of scope for v1

Version 1 is an on-chain treasury with member governance; everything below is deliberately left out.

Not planned:

- Governance tokens or voting weighted by holdings
- Arbitrary actions (Sputnik-style function calls)
- A shared multi-DAO platform

Later additions, in likely order:

1. **Lightning payouts by swap:** council signs an on-chain PSBT to a non-custodial swap service that pays the recipient's Lightning invoice. No Lightning funds held.
2. **The Purse:** a small Lightning balance for instant payouts and incoming tips, with a spending cap, topped up from the treasury by payout round.
3. **Proposal deposit:** a small refundable payment to curb spam, if membership alone proves insufficient.
4. **Veto window:** payouts held in a timelocked output for about a day, during which a recovery path can return funds. Needs pre-signed transactions; revisit if covenant upgrades activate on Bitcoin.

## Build plan and fork-readiness

Four phases, each closed by a gate; the repo counts as released only after phase 4, with the licence added last.

1. **Testnet4 prototype.** Passkey sign-in, a basic founding setup page, roster, proposals and votes as events, a 3-of-5 treasury on testnet4 with browser test keys, the site on GitHub Pages and a Nosflare relay, payout round flow end to end.
   - Gate: a testnet4 payout round passes from proposal to confirmed receipt, run by five testers.
2. **Hardware signing on testnet4.** SeedSigner QR signing, descriptor loaded on devices, recovery sheet, restore tested in Sparrow.
   - Gate: the treasury is restored and spent in Sparrow without the website.
3. **The mainnet DAO.** The council chooses its name and domain; a new mainnet key ceremony for the five council members, a mainnet founding meeting listing every trial member as a founder, small treasury, first real monthly rounds, anchoring, public pages.
   - Gate: three monthly rounds completed without developer help.
4. **Fork kit.** Setup wizard, template repo, one-click deploy, dashboard listing, FORK-TASKS.md complete.
   - Gate: a second group deploys its own DAO from the kit and runs one round on testnet4.

Repo: btc-dao. Stack: static site, bundled and pinned libraries (`@scure/btc-signer` or BDK for transactions, `nostr-tools` for events, WebAuthn for passkeys), an Esplora-compatible API for chain data, and the DAO's own relay.

## Open questions

- [ ] Who are UNO's five council members, and who are the founding members?
- [ ] What is the mainnet DAO called? The council decides before the mainnet founding; the domain follows the name.
- [ ] Is a quorum of one third right for a small founding group, or should it start higher?
- [ ] Should member votes on payouts be public by name, or tallies only?
- [ ] Decided: the DAO relay runs Nosflare on Cloudflare, under the Bitcoin-DAO organisation's account.
- [ ] Which host for the mainnet site? The trial runs on GitHub Pages at bitcoin-dao.github.io/uno-practice and /uno-testnet. Domains decided: btcdao.tech for the project; the mainnet DAO's domain follows the name its council chooses.
- [ ] Can OpenTimestamps calendars be reached from the browser, or is a small helper needed?
- [ ] Does SeedSigner's current firmware verify change against a loaded P2WSH multisig descriptor? Test before phase 2.
- [ ] Are kinds 3570–3586 and the D tag free in the Nostr kind registry?
- [ ] Legal check (Italy, UK): confirm keyless coordination software is not custody.
- [ ] Decided: the software repo is named btc-dao; UNO is its first instance.
