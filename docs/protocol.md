# btc-dao protocol v1 (draft)

This document defines the data a btc-dao DAO publishes and how any client rebuilds the DAO's state from it. A second, independent client written from this document alone should reach the same state as the reference app. Where this draft and `spec.md` differ, this document is the more precise and the spec will be brought in line.

**Status: draft.** Kind numbers are provisional (see [Kinds](#kinds)). Nothing here is final until phase 1 test cases (requirement S4) pass.

## 1. Building blocks

### 1.1 Nostr events

Every DAO action is a signed Nostr event as defined in NIP-01: `id`, `pubkey`, `created_at`, `kind`, `tags`, `content`, `sig`. The `content` field holds a JSON object serialised as a string. Events are published to every relay listed in the DAO's config; clients query all of them and de-duplicate by `id`.

### 1.2 Common tags

Every event carries:

| Tag | Value | Purpose |
| --- | --- | --- |
| `["D", <dao_id>]` | 64-char hex | Which DAO. Single-letter tags are indexed by relays, so clients can filter `{"#D": [dao_id]}` |
| `["v", "1"]` | protocol version | Clients ignore events with a version they don't support, and say so |

Events that refer to another event add `["e", <event id>]`. Events about a person's key add `["p", <hex pubkey>]`.

### 1.3 Hashing and the DAO id

- **Canonical JSON:** objects are hashed after canonicalisation with RFC 8785 (JSON Canonicalization Scheme).
- **Hash:** SHA-256, lower-case hex.
- **DAO id:** `dao_id = sha256(JCS(genesis config))`, where the genesis config is the content of `dao.config.json` at creation. It never changes, even when later rosters or rules do.

### 1.4 Keys

| Key | Curve and form | Used for |
| --- | --- | --- |
| Identity key | secp256k1, x-only public key (hex) as in Nostr | Signing every event below |
| Treasury key | BIP-32 xpub at `m/48'/0'/0'/2'` (mainnet) or `m/48'/1'/0'/2'` (testnet4), with its 4-byte fingerprint | Signing PSBTs only |

A council member has both. The config maps each council member's identity key to their xpub and fingerprint, so a client can check that a `dao.sign` event's PSBT signature comes from the treasury key of the person who signed the event.

### 1.5 Identity key and passkey

The identity key is a random secp256k1 secret generated in the browser when the member joins. The member's passkey protects it but does not create it, so a new passkey on any device or domain can take on the same key.

1. `salt = sha256("btc-dao/identity/v1/" || dao_id)`, so one passkey's outputs cannot be linked across DAOs.
2. `prf = WebAuthn PRF output(salt)` (32 bytes) for the member's credential.
3. `wrap_key = HKDF-SHA256(ikm = prf, salt = "", info = "btc-dao identity wrap v1", length = 32)`.
4. `ciphertext = XChaCha20-Poly1305(wrap_key, nonce, secret)`, with a random 24-byte nonce.

The ciphertext is kept in the browser and published as a `dao.keywrap` event (section 5.4), so a synced passkey on another device can fetch and open it. A member may register several passkeys; each has its own `dao.keywrap`.

Where the phone has no PRF support, the secret stays in that browser's storage and the member uses their identity card (section 1.7) on other devices. Nostr users may instead sign with their existing key through a NIP-07 browser extension and back it up their own way.

The WebAuthn relying-party id is the config's `passkeyDomain`. It is the DAO's registrable domain (for a DAO at `dao.example`, `dao.example`), not the full host, so pages on any of its subdomains share passkeys. On a host whose parent domain is a public suffix, such as GitHub Pages, it is the full host instead: `bitcoin-dao.github.io` for UNO's stages at `bitcoin-dao.github.io/uno-practice` and `/uno-testnet`. Every DAO published under that GitHub account then shares one passkey domain, which is harmless because the PRF salt includes each DAO's id. The trial and mainnet DAOs have different DAO ids and different passkey domains, so each member has a separate identity in each.

A passkey only works on its own domain. If the DAO moves to a new address (section 7.2), members restore from their identity cards there and register new passkeys. Their identity keys, and so the roster and history, are unchanged.

### 1.6 Short code

The code read aloud at onboarding is derived from the candidate's public key:

`short_code = Crockford-base32(first 40 bits of sha256(pubkey bytes))` → 8 characters, shown as `XXXX · XXXX`.

A key swapped in transit gives a different short code, which is the whole point of reading it aloud.

### 1.7 Identity cards

An identity card is a member's paper backup of their identity key: one card each, optional for ordinary members and required for council members before the key ceremony. There are no passwords. Cards are printed straight from the browser and never saved as files.

- QR payload: `BTCDAO:1:<dao8>:<secret>`, where `dao8` is the first 8 hex characters of the DAO id and `secret` is the 64-character key. All hex is upper case, so the payload fits QR alphanumeric mode (version 4 or smaller, about 3 cm square in print).
- The printed text beside the QR (never inside it) gives the DAO name, the member's pseudonym, their short code, "Council" for a council member, the print date, and a fixed fallback line naming where to find the DAO if its site stops working: the project dashboard and the council (for example: "If dao.example stops working, find the new address at btcdao.tech or ask a council member").
- Council members keep the card apart from their SeedQR card. A council identity key gives one of the `threshold` endorsements any change needs and can never move funds, so one lost card is handled by a key replacement.

Scanning accepts the payload in any letter case and ignores spaces and line breaks; printing always uses upper case.

Restoring: the app scans the card, checks the `dao8` prefix matches this DAO, checks the secret is between 1 and n−1, derives the public key and shows its short code. It continues only if that key is on the current roster, or has a valid `dao.verify` for a candidate. It then registers a new passkey and publishes a `dao.keywrap` for it.

## 2. Kinds

All DAO events are **regular** events (kinds 1000–9999), so relays keep every one and the full history stays auditable. The numbers below are a provisional block (3570–3586) and must be checked against the Nostr kind registry before v1.

| Kind | Name | Signed by | Section |
| --- | --- | --- | --- |
| 3570 | `dao.genesis` | Founding council member | 3.1 |
| 3571 | `dao.endorse` | Council member | 3.2 |
| 3572 | `dao.roster` | Council member | 3.3 |
| 3573 | `dao.settings` | Council member | 3.4 |
| 3574 | `dao.proposal` | Member | 4.1 |
| 3575 | `dao.confirm` | Payout recipient | 4.2 |
| 3576 | `dao.vote` | Member | 4.3 |
| 3577 | `dao.tally` | Council member | 4.4 |
| 3578 | `dao.verify` | Council member | 5.1 |
| 3579 | `dao.rekey` | Council member | 5.2 |
| 3580 | `dao.leave` | Member | 5.3 |
| 3581 | `dao.round` | Council member | 6.1 |
| 3582 | `dao.sign` | Council member | 6.2 |
| 3583 | `dao.receipt` | Council member | 6.3 |
| 3584 | `dao.anchor` | Any member | 7.1 |
| 3585 | `dao.listing` | Council member | 7.2 |
| 3586 | `dao.keywrap` | Member | 5.4 |

Compared with the spec v0.1 event table, this adds `dao.settings` (versions of the rules, council and descriptor get their own event, like rosters), `dao.confirm` (recipient address confirmation), `dao.tally` (requirement S3), the three onboarding events and `dao.keywrap` (passkey-protected identity keys).

## 3. Foundation: genesis, endorsements, rosters, rules

### 3.1 `dao.genesis`

```json
{
  "kind": 3570,
  "tags": [["D", "<dao_id>"], ["v", "1"]],
  "content": "<the genesis config, as in config/example.testnet4.json>"
}
```

Valid when it is signed by a key listed in its own `council`, `sha256(JCS(content)) == dao_id`, and it is endorsed (`dao.endorse`, object `genesis`) by at least `threshold` of the council identity keys listed in the config itself.

### 3.2 `dao.endorse`

```json
{
  "kind": 3571,
  "tags": [["D", "<dao_id>"], ["v", "1"], ["e", "<endorsed event id>"]],
  "content": "{\"object\":\"roster\",\"hash\":\"<sha256 of the endorsed content>\",\"version\":6}"
}
```

`object` is one of `genesis`, `roster`, `settings`, `rekey`, `tally`, `listing`. `hash` is `sha256(JCS(content))` of the endorsed event's content (for the genesis, that is the DAO id). Valid when the signer is on the council in effect when the endorsed object was published, and `hash` matches the endorsed event's content. An object takes effect once it has `threshold` valid endorsements from distinct council members; its effective time is the `created_at` of the endorsement that completed the threshold.

### 3.3 `dao.roster`

```json
{
  "version": 6,
  "prev": "<sha256 of roster version 5 content>",
  "basis": ["<id of the dao.proposal or dao.leave or dao.rekey that caused this version>"],
  "members": [
    {"key": "<hex pubkey>", "name": "@anna", "since": "2026-09-01", "verified": "in_person", "council": true},
    {"key": "<hex pubkey>", "name": "@nina", "since": "2026-10-20", "verified": "remote", "council": false}
  ]
}
```

Rosters form a chain: each `prev` is the hash of the previous version, and version numbers increase by one. Version 1 is implied by the genesis config: its `council` plus its `founders`, all verified at the founding meeting (section 3.5). Its content, and so the `prev` of version 2, is exactly `{"version": 1, "members": [...]}`: council members first, in config order, as `{key, name: label, since, verified: "in_person", council: true}`, then founders as `{key, name, since, verified, council: false}`, with `since` the UTC date (YYYY-MM-DD) of the genesis's effective time. The hash of any version is `sha256(JCS(content))`. A roster version is valid only if every change from the previous version is justified by an item in `basis`: a passed and tallied add, remove or change-council proposal (a council change only once its migration round has a receipt), a valid `dao.leave`, or an endorsed `dao.rekey`. Clients reject a roster that adds or drops anyone without a basis.

If two different versions with the same number each reach `threshold` endorsements (possible only if a council member endorses both), both are disputed: no change in either takes effect until the council endorses a next version whose `prev` names one of them. Clients flag every council member who endorsed both. The same rule applies to settings.

### 3.4 `dao.settings`

```json
{
  "version": 2,
  "prev": "<sha256 of settings version 1 content>",
  "basis": ["<id of the passed change_rules or change_council proposal>", "<id of the migration's dao.receipt, for a council change>"],
  "rules": { "votingPeriodDays": 7, "quorum": "1/3", "timezone": "Europe/Rome", "payoutRound": "monthly", "lapseAfterRounds": 2, "maxFeeRateSatVb": 20, "fundingModel": "production", "charterLanguage": "it", "charterSha256": "<sha256 of the binding charter text>", "treasuryCapSats": 5000000, "...": "..." },
  "closed": false,
  "council": [{"label": "Council 1", "identityKey": "<hex>", "fingerprint": "<8 hex>", "xpub": "<xpub>"}],
  "threshold": 3,
  "descriptor": "<treasury descriptor with checksum>"
}
```

Settings hold everything about the DAO that can change by vote: the rules, the council's keys, the threshold and the treasury descriptor. Version 1 is implied by the genesis: `{"version": 1, "rules", "closed": false, "council", "threshold", "descriptor"}`, taken from the genesis config. `rules.fundingModel` states how the DAO intends to fund itself: one of `grant`, `production`, `mutual`, `revolving` ([funding models](funding-models.md)). It is informational: clients enforce nothing from it, and dashboards display it. `rules.charterLanguage` names the language of the binding charter text, as a language code (`en`, `it`; English if unset). `rules.charterSha256` fixes which charter text is in force: the SHA-256 of the binding text, in that language, as UTF-8. Translations may exist; where they differ, the binding text applies. Changing the binding language is a rules change, like changing the text. The app shows the charter and checks it against this hash; a charter change is a `change_rules` proposal that changes the hash. Version 1 is taken from the genesis config. Same chain, basis and conflict rules as rosters. A rules change needs a passed and tallied `change_rules` proposal. A council change needs a passed and tallied `change_council` proposal plus the `dao.receipt` of its migration round; the new version names the new council, threshold and descriptor, and from its effective time payout rounds spend from the new descriptor.

### 3.5 Founding

The first members cannot join the normal way, because no sponsor, council or vote exists yet. They are listed in the genesis config instead, and the council's endorsement of the genesis stands in for verifying each of them.

The genesis config holds `council` (label, identity key, fingerprint, xpub for each) and `founders`: the founding members who are not on the council, each with `name`, `identityKey` and `verified` (`in_person` or `remote`).

1. The site runs in setup mode at its address before any genesis exists.
2. Each founder, council members included, creates a passkey and a random identity key in Founder sign-up. The secret stays in that browser only. The setup device scans each founder's key and both read the short code aloud; remote founders do this on a video call.
3. The setup page builds the genesis config, which fixes `dao_id`.
4. A council member publishes `dao.genesis`; at least `threshold` council members endorse it. There are no `dao.verify` events for founders.
5. Once a founder's browser sees an endorsed genesis listing its key, it wraps the secret with the passkey (section 1.5), publishes `dao.keywrap` and offers the identity card (section 1.7), which needs `dao8`. Council members print their cards before signing any event other than their genesis endorsement.

A DAO that replaces an earlier one, such as a mainnet DAO after its trial (UNO) on testnet4, lists the earlier DAO's members as founders. They sign up afresh, because identity keys are separate per DAO, but no one has to be voted in again.

A founder's key lost before the genesis is published is simply replaced by signing up again. After publication, a lost key goes through `dao.rekey` like any other.

## 4. Governance

### 4.1 `dao.proposal`

```json
{
  "type": "payout",
  "title": "Stampa dei volantini per il meetup di dicembre",
  "summary": "500 volantini A5 per invitare commercianti e residenti al meetup del 14 dicembre.",
  "link": {"url": "https://example.org/volantini", "sha256": "<hash of the page at submission>"},
  "lang": "it",
  "payload": {
    "recipient": "Tipografia locale",
    "outputs": [{"address": "tb1q4f8kw3zr7c9mpdl0h5x2nt6yegsva8u3jq2xmp", "amount_sat": 120000}]
  }
}
```

Common fields: `type`, `title` (≤ 80 characters), `summary` (≤ 500 characters; the binding text), `link` (optional; its `sha256` is optional too, because a browser cannot fetch arbitrary pages to hash them, and the summary is what binds), `lang`. `payload` depends on `type`:

| `type` | `payload` |
| --- | --- |
| `payout` | `recipient` (display name), `outputs`: 1 to 10 `{address, amount_sat, member?}`, each address once; `member`, optional, is the identity key of the member an output pays (section 4.2) |
| `statement` | `{}` |
| `add_member` | `candidate_key`, `name`, `verify`: ids of the `dao.verify` events |
| `remove_member` | `member_key`, `reason` |
| `change_rules` | `changes`: list of `{path, from, to}`, where `path` is `rules.<name>` for a top-level rule and `from` must equal the value in force when the change is applied |
| `change_council` | `out_key`, `in_key`, `in_xpub`, `in_fingerprint`, `threshold`, `new_descriptor` |
| `close` | `destination`: the address that receives the whole balance |

The human-readable number (`UNO-0007`) is not in the proposal event. Clients derive it by sorting all valid proposals by `created_at`, then by `id`, and numbering from 1, so every client shows the same numbers without a coordinator. The proposal's tally records the number (section 4.4), and from then on it never changes. A proposal dated before the most recently tallied proposal is rejected, so a backdated proposal can never renumber a closed one; one dated before an open proposal it arrived after is accepted and flagged as backdated.

Valid when:
- the signer is on the roster in effect at `created_at`;
- its `created_at` is not earlier than that of the most recently tallied proposal;
- the content matches the schema for its type;
- for payouts, every address is valid for the DAO's network, is not a treasury address (the first 40 receive and change addresses of every descriptor so far), and every amount is above the dust limit of 546 sats; the same address checks apply to a `close` destination;
- for `add_member`, every listed `dao.verify` is valid: one in-person verification, or two remote verifications by distinct council members, with the same `candidate_key`.

### 4.2 `dao.confirm`

**For one proposal.** Tags: `["e", <proposal id>]`. Content: `{"address": "<address being confirmed>"}`, optionally with `"bip322": "<signature>"` when the recipient's wallet can sign a message with that address.

Valid when the address appears in the proposal's outputs, or is the `destination` of a `close` proposal, which needs a confirmation in the same way. Any key may sign it, member or not. Every payout address needs a valid `dao.confirm` before it can enter a round; a proposer who is also the recipient confirms in the same step as proposing. There is no deadline: confirming is the recipient's responsibility, and it may come before, during or after the vote. A passed payout that is still unconfirmed waits, and lapses under the usual rule if it is not made binding within the lapse limit (2 rounds in the reference rules). A BIP-322 signature proves control of the address; without it, the confirmation shows only that someone with the confirmation link agreed.

**Standing.** A member may instead confirm one address for all their payouts: no `e` tag, content `{"address": "<address>", "standing": true}`, optionally with `"bip322"`. It is valid when the signer is on the roster at its `created_at`, and the address is valid for the DAO's network, is not a treasury address and is not reserved for a pledge. A member has at most one standing address: their latest valid standing confirmation counts, by `created_at`, then by `id`, and `{"standing": false}` withdraws it. It ends when the member leaves, is removed or has their key replaced (sections 5.2, 5.3); a new key sets its own.

A payout output whose `member` field names a member counts as confirmed if, when a round including it is published, that member's standing address is that output's address. The check is made then, not when the proposal is published, so a member who replaces or withdraws a lost wallet's address stops every unpaid payout to it. An output that no standing address covers needs a confirmation for its proposal, as above. A standing address is reused on chain; a fresh address per payout remains more private, and apps should say so.

### 4.3 `dao.vote`

Tags: `["e", <proposal id>]`. Content: `{"choice": "yes" | "no" | "abstain"}`.

- **Eligible voters:** members on the roster in effect when the proposal was published, minus anyone whose `dao.leave` or removal took effect before the close. Eligibility belongs to the person, not the key: after an endorsed `dao.rekey` the new key inherits the old key's eligibility and its latest vote, and may change it.
- **Changing a vote:** the latest vote per member counts, by `created_at`, then by `id`.
- **Close time:** proposal `created_at` + voting period. There is no early close, because votes can change until then.
- **Quorum:** the number of members casting a counted vote (abstain included) must reach the `quorum` fraction of eligible voters, rounded up. With 18 eligible voters and a quorum of 1/3, that is 6.
- **Majority:** abstentions count for quorum only. A simple majority is more yes than no. A two-thirds majority, for the types the rules list in `twoThirdsMajority`, is at least one yes and yes ≥ two-thirds of yes plus no.

### 4.4 `dao.tally` (requirement S3)

```json
{
  "proposal": "<proposal id>",
  "closed_at": 1762300800,
  "roster_version": 5,
  "settings_version": 1,
  "number": 7,
  "counted": ["<vote event id>", "..."],
  "excluded": [{"id": "<vote event id>", "reason": "late"}],
  "result": {"yes": 9, "no": 2, "abstain": 1, "quorum_met": true, "passed": true}
}
```

Tags: `["e", <proposal id>]`. Signed by a council member after the close. Exclusion reasons: `late`, `not_eligible`, `superseded`. `number` is the proposal's number as derived in section 4.1; a tally whose number differs from that derivation at its `closed_at` is invalid.

Every council member's client publishes the tally automatically the first time it runs after the close, unless a valid tally already exists. Tallies from different council members whose `counted`, `excluded` and `result` are identical are one tally, not a dispute.

Nostr timestamps are chosen by the signer, so a vote could be backdated after the close. The tally settles which votes count: once published and anchored, clients use it instead of recounting. A client that holds a vote dated before `closed_at` that the tally neither counts nor excludes shows a warning on the proposal. A second, conflicting tally makes the proposal **disputed** until `threshold` council members endorse one tally (`dao.endorse`, object `tally`).

Payouts, roster changes and rule changes act only on proposals with a valid, undisputed tally.

## 5. Membership

### 5.1 `dao.verify`

Tags: `["p", <candidate key>]`. Content: `{"candidate_key": "<hex>", "mode": "in_person" | "remote", "short_code": "7F3K29QD"}`.

Valid when the signer is on the council and `short_code` matches the one derived from `candidate_key` (section 1.6).

### 5.2 `dao.rekey`

Tags: `["p", <old key>]`, `["p", <new key>]`. Content: `{"old_key": "<hex>", "new_key": "<hex>", "mode": "in_person" | "remote", "short_code": "<of the new key>"}`.

Takes effect with `threshold` endorsements (object `rekey`); remote mode also needs a second council member's `dao.verify` of the new key. From the effective time, events signed with the old key are ignored; earlier ones stay valid. The old key's standing payout address (section 4.2) ends then; the new key sets its own.

### 5.3 `dao.leave`

Content: `{}`. Signed by the member leaving. Not valid for council members, who leave through a `change_council` proposal. From its `created_at`, the member's votes on still-open proposals are withdrawn and their standing payout address (section 4.2) ends; the next roster version drops them. A removal ends the standing address in the same way, from the roster version that removes the member.

### 5.4 `dao.keywrap`

Tags: `["c", <sha256 of the passkey credential id, hex>]`. Content: `{"nonce": "<24-byte hex>", "ct": "<hex ciphertext>"}` as in section 1.5.

Signed by the identity key it protects, which shows the publisher held that key. Valid when the signer is on the roster or is a candidate with a valid `dao.verify`. The latest event per `c` tag counts. After a passkey sign-in, a client fetches it with the filter `{"kinds": [3586], "#D": [dao_id], "#c": [sha256(credential id)]}` and opens it with the PRF output. The ciphertext is public; its security rests on the 32-byte PRF output, which never leaves the passkey's device.

## 6. Treasury

### 6.1 `dao.round`

```json
{
  "round": "2026-12",
  "proposals": ["<proposal id>", "<proposal id>"],
  "psbt": "<base64 BIP-174 PSBT>",
  "fee_rate_sat_vb": 3,
  "fee_sat": 1100
}
```

Every client that shows the round rebuilds the expected outputs and refuses to offer signing unless all of these hold:
- the outputs are exactly the payout outputs of the listed proposals, with nothing added;
- each listed proposal is passed, tallied, confirmed where needed (by a confirmation for the proposal, or by a standing address in force when the round is published, section 4.2), not yet paid, and not lapsed;
- any other output is change to the treasury's change branch (`/1/*`) at an unused index;
- inputs are unspent treasury outputs;
- `fee_sat` matches the PSBT, and the fee rate is at most `maxFeeRateSatVb` from the rules (requirement S5);
- for a `change_council` migration round, the single output pays the full balance, minus fee, to the first receive address of `new_descriptor`;
- no other round is open, unless this round spends at least one of the open round's inputs. A round is open from its publication until it has a receipt. Two rounds that share an input can never both confirm, so a replacement round is safe; once one confirms, the other is void.

**Round dates** are computed in the settings' `timezone` (Europe/Rome in the reference rules), from `rules.payoutRound`: with `"monthly"` (the default), the 1st of each month at 00:00; with `"weekly"`, every Monday at 00:00. Any other value is read as `"monthly"`. Each round date follows the settings in force at that moment, so after a change of cadence a waiting payout counts the new dates from the change. Round dates set when payouts lapse; a council member may publish a round at any time, and its `round` label is the period it was prepared in: the month (`YYYY-MM`) for monthly rounds, the ISO 8601 week (`YYYY-Www`, for example `2026-W45`) for weekly ones. If fees are above the fee-rate cap on a round date, no round is built for that period and the payouts wait.

**Building a round** (reference app): coins largest first; change to the lowest unused address on the change branch, or no change if it would be at or below the dust limit (546 sats), the remainder going to the fee; the fee rate checked against the cap uses an upper-bound size estimate with 72-byte signatures.

**Lapse:** a passed payout lapses if it has not been paid by the second round date after its tally. Round dates on which no round could be built within the fee-rate cap are not counted. A lapsed payout can be proposed again.

**Closing round:** after a `close` proposal passes, is tallied and its destination is confirmed, the next round pays the whole treasury balance, minus the fee, to the destination, with no change output. After its receipt, `threshold` council members endorse a final settings version with `"closed": true`, whose `basis` is the `close` proposal. From its effective time clients accept no new proposals, votes or rounds; the record stays readable.

**Sweeping an old treasury:** after a council change, clients keep watching every earlier descriptor. Anything that arrives there is moved by a sweep round: its inputs are on the earlier descriptor, its single output pays the current treasury's next receive address, and it is signed by council keys that belong to both descriptors. A sweep round is exempt from the one-open-round rule.

PSBT requirements, so hardware signers can verify everything: PSBT version 0; each input carries its `witness_utxo`, `witness_script` and `bip32_derivation` for all five keys; the change output carries its `witness_script` and `bip32_derivation` for all five keys. PSBTs move to and from SeedSigner as animated QR codes in the UR `crypto-psbt` format.

### 6.2 `dao.sign`

Tags: `["e", <round id>]`. Content: `{"psbt": "<base64 PSBT with this member's partial signatures>"}` or `{"decline": "<reason>"}`.

Valid when the signer is a council member and every new partial signature in the PSBT verifies against that member's treasury key from the config. When a client holds `threshold` valid partial signatures for every input, it finalises the transaction and broadcasts it through the configured chain API. Any client may do this; broadcasting the same transaction twice is harmless.

### 6.3 `dao.receipt`

Tags: `["e", <round id>]`. Content: `{"txid": "<hex>", "block_height": 1234567}`. Valid when it is signed by a council member, `txid` is the txid of the round's PSBT (fixed by its unsigned transaction, so it can only be that round's inputs and outputs), and the chain API confirms that transaction at that height. The round's proposals then show as paid. Council apps publish the receipt themselves at the first confirmation.

### 6.4 Donation address and treasury cap

- The treasury page shows one receive address: the lowest-index unused address on the receive branch (`/0/*`). It keeps showing it until that address receives a payment, then moves to the next. Unused addresses never pile up, so a standard wallet restoring from the recovery sheet, with its default gap limit, always finds every coin.
- When the balance reaches `treasuryCapSats`, the page shows no donation address. If the balance goes over the cap anyway, every client shows it, and the excess is settled by a members' vote: a `change_rules` proposal raising the cap, or a payout.

## 7. Record and discovery

### 7.1 `dao.anchor`

Tags: `["e", <tally id>]`. Content: `{"digest": "<sha256>", "covers": ["<event id>", "..."], "ots": "<base64 OpenTimestamps proof>"}`.

`digest = sha256(JCS(sorted list of the covered event ids))`, where `covers` is the proposal, its votes, its confirmations and its tally. The proof shows the record existed, unchanged, at a Bitcoin block. An incomplete proof can be replaced by an upgraded one in a later `dao.anchor` with the same digest.

### 7.2 `dao.listing`

Content: `{"name": "UNO", "site": "https://...", "relays": ["wss://..."], "descriptor": "<public descriptor>", "software": "btc-dao 0.1.0", "build": "<sha256 of the release bundle>"}`. Takes effect with `threshold` endorsements. Dashboards list only endorsed listings, and flag any DAO whose `software` is older than the latest release or whose `build` does not match the signed release. The app shows its own version and build fingerprint on the Rules page, so members can compare.

**Dashboard switch** (optional): the content may carry `"listed": true`, set by the app's *show on public dashboards* switch. Dashboards show a DAO only when its latest endorsed listing has `"listed": true`. A listing without it, or with `"listed": false`, keeps working for its other purposes (the DAO's address, the build check) but is not shown on dashboards. Leaving dashboards is a new listing with `"listed": false`, endorsed like any other. The switch governs display only: every event stays public on the relays.

The `site` of the latest endorsed listing is the DAO's address. Moving the DAO to a new domain is done by publishing a new listing and collecting `threshold` endorsements; no member needs re-verifying. The card-restore screen shows the endorsed address and its endorsements, and clients warn when they are opened at any other address. Members should never scan an identity card on an address the council has not endorsed.

After a domain loss, members find the new address in two ways that do not depend on the lost domain: the project dashboard (btcdao.tech), which shows the latest endorsed `site` of each DAO that is listed, and an announcement by the council in person or on a call. A DAO relay on the lost domain goes down with it. The public relays in the config still hold every event, so the new listing can be fetched there, and its `relays` field names the DAO's new relays.

### 7.3 DAO relay

Each DAO runs one relay of its own beside at least two public relays. Its policy:

- accept only events of kinds 3570–3586 that carry the DAO's `["D", <dao_id>]` tag, and reject everything else;
- accept them from any key, because candidates and payout recipients who are not members must be able to publish; clients validate every event anyway;
- no payment for access, and rate limits per key and per connection to keep spam small;
- keep every accepted event; never delete.

The reference setup is Nosflare on Cloudflare Workers, configured in `relay/`: pay-to-relay and sign-in off, only kinds 3570–3586, a required `D` tag (pinned to the DAO id once it exists), and pruning off. For UNO's stages it runs at a `workers.dev` address under the Bitcoin-DAO organisation's Cloudflare account; a mainnet DAO runs its own on its own domain. Any relay with the same policy can replace it.

### 7.4 Discovery relays

A DAO publishes to the relays in its own config, and its DAO relay accepts only events tagged with its own DAO id, so on its own a new DAO cannot be found by a dashboard that does not already know it. Discovery relays close that gap.

- **What goes there:** each `dao.listing` and the `dao.endorse` events that endorse it (object `listing`). Nothing else is needed: the listing's `relays` field tells a dashboard where to fetch the rest of the DAO's events by `#D`.
- **Who publishes:** the app publishes a listing and its endorsements to the discovery relays as well as to the DAO's own relays, but only when the listing has `"listed": true`. A DAO that does not opt in never appears there.
- **Which relays:** a short list shipped with each btc-dao release, so every app and every dashboard starts from the same set. The project runs one (the btcdao.tech relay); the others are public relays. A dashboard may watch more relays.
- **Policy:** a discovery relay accepts kinds 3585 and 3571 with any `D` tag, from any key, keeps every accepted event and never deletes. Dashboards validate every listing and endorsement against the DAO's own events before showing it, so a discovery relay needs no trust.
- **Stages:** dashboards show trial stages (practice and testnet, read from the genesis config's `stage`) apart from mainnet DAOs and leave them out of network totals. Whether trial stages publish at all is open (`decisions.md`).

## 8. Rebuilding state

A client rebuilds a DAO in this order, from events filtered by `#D` and from the chain:

1. Verify the genesis event and its endorsements; load relays and settings version 1 (rules, council, threshold, descriptor).
2. Follow the roster and settings chains, accepting each version only with a valid basis and enough endorsements.
3. Collect proposals, confirmations, votes and tallies; derive proposal numbers and statuses.
4. Apply verify, rekey and leave events to membership as of each moment that matters.
5. Collect rounds, signatures and receipts; check each against the chain.
6. Compute the treasury balance and history from the descriptor and the chain API, linking each payout to its round and proposals.

Events that fail validation are kept and shown in a "rejected" view with the reason, never silently dropped, so a disagreement between clients can be investigated.

## 9. Open points for phase 1

- Confirm the kind numbers and the `D` tag do not collide with existing NIPs.
- Test cases for every validity rule above (S4), including duplicate and out-of-order events and events from other DAOs.
- Confirm passkey PRF support on members' phones (section 1.5).
- Confirm phones can print an identity card straight from the browser without leaving a saved PDF (section 1.7).
- Confirm SeedSigner accepts the PSBT layout in section 6.1 and verifies change against the loaded descriptor (S7).
- Decide whether the OpenTimestamps step runs in the browser or needs a small helper.
