# Draft protocol change: weekly rounds and standing payout addresses

November 2026 · **approved and applied** to [`protocol.md`](../protocol.md) (sections 3.4, 4.1, 4.2, 5.2, 5.3, 6.1) and [`test-cases.md`](../test-cases.md). Kept as the record of why. The app changes below are built (November 2026).

Two small changes, needed first by the Sun to Sats showcase ([`showcase-sun-to-sats.md`](../showcase-sun-to-sats.md)), and open to any DAO. Neither adds an event kind, and a DAO that changes nothing in its settings behaves exactly as before.

| | Change A: weekly rounds | Change B: standing payout addresses |
| --- | --- | --- |
| What it adds | A DAO can set its round dates to every Monday | A member confirms a payout address once, and it stays confirmed until they withdraw or replace it |
| Who chooses | The DAO, by a rules vote | Each member, for themselves |
| Protocol sections | 3.4, 6.1 | 4.1, 4.2, 5.2, 5.3 |
| New kinds | None | None: it reuses `dao.confirm` (3575) |

## Change A: weekly rounds

### Why

Round dates do two jobs: they label rounds, and they count down to lapse. Today they fall on the 1st of each month. A council can already publish a round at any time, so weekly payments are possible now. What doesn't work is the countdown: a passed payout tallied on the 2nd waits up to two months to lapse, and the round labels say nothing about which week was paid. A DAO that distributes weekly needs round dates that match.

### The change

`rules.payoutRound` becomes a fixed value instead of free text:

| Value | Round dates | Round label |
| --- | --- | --- |
| `"monthly"` (default) | The 1st of each month at 00:00 | `YYYY-MM`, for example `2026-12` |
| `"weekly"` | Every Monday at 00:00 | ISO 8601 week, for example `2026-W45` |

Both are in the settings' `timezone`. Any other value, including the current `"monthly, 1st of the month"`, is read as `"monthly"`, so existing configs keep working.

Everything else in section 6.1 stays as it is:
- **Lapse** still counts round dates: `lapseAfterRounds` of them after the tally. In a weekly DAO, 2 rounds means about two weeks. A weekly DAO should probably raise it (see below).
- **Fee cap:** a round date whose fees are above the cap still doesn't count toward lapse. In a weekly DAO, that's one week rather than one month.
- **Building rounds** is unchanged. One round can still pay several weeks' passed proposals, so a missed week is caught up in the next round.

**Changing cadence** is a `change_rules` proposal for `rules.payoutRound`. Each round date is computed from the settings in force at that moment. A payout tallied under the monthly rule that is still waiting when the weekly rule takes effect counts weekly dates from then on. That moves its lapse date earlier, so clients show the new lapse date as soon as the change takes effect.

### Replacement text for protocol section 6.1

> **Round dates** are computed in the settings' `timezone` (Europe/Rome in the reference rules), from `rules.payoutRound`: with `"monthly"` (the default), the 1st of each month at 00:00; with `"weekly"`, every Monday at 00:00. Any other value is read as `"monthly"`. Each round date follows the settings in force at that moment. Round dates set when payouts lapse; a council member may publish a round at any time, and its `round` label is the period it was prepared in: the month (`YYYY-MM`) for monthly rounds, the ISO 8601 week (`YYYY-Www`) for weekly ones. If fees are above the fee-rate cap on a round date, no round is built for that period and the payouts wait.

The rules example in section 3.4 gains `"payoutRound": "monthly"`, and the config example lists both values.

### A weekly DAO in practice (Sun to Sats)

| Day | What happens |
| --- | --- |
| Monday, week 45 | Round date. A council member loads the week's pool data; the helper pre-fills a distribution proposal |
| Monday, week 46 | The vote closes after its full 7 days; the first council app tallies it; the next distribution proposal opens |
| Monday to Sunday, week 46 | The council builds and signs the round (`2026-W46`) |

Sats mined in week 45 reach members' wallets in week 46. With `lapseAfterRounds: 2`, the council has two Mondays after the tally to sign. Raising it to **4** gives them about a month, which fits a council that meets in person around a shared SeedSigner. The Sun to Sats settings should set this.

## Change B: standing payout addresses

### Why

Today every payout address needs its own `dao.confirm`, so the recipient approves it each time. That's the right default for one-off payments to suppliers. For a weekly distribution to ten members, though, it means forty confirmations a month, and a member who misses one sees their share lapse. Sun to Sats decided payout addresses travel in each proposal. This change keeps that rule, and lets a member confirm their own address once.

### The change

**1. A standing confirmation is a `dao.confirm` with no `e` tag.** Content:

```json
{"address": "bc1q…", "standing": true}
```

It may carry `"bip322"` like any confirmation. It is valid when:
- its signer is a member, on the roster in effect at its `created_at`;
- the address is valid for the DAO's network, is not a treasury address, and is not reserved for a pledge.

A member has at most one standing address. The latest valid standing confirmation counts, by `created_at`, then by `id`. To withdraw it, the member publishes `{"standing": false}`, with no address.

**2. A payout output may name the member it pays:**

```json
{"address": "bc1q…", "amount_sat": 41200, "member": "<member's identity key>"}
```

`member` is optional. The proposal is still voted on with the address in full, exactly as today.

**3. When a standing confirmation covers an output.** An output with `member` set counts as confirmed if, when the round is published, that member's standing address is that output's address. Otherwise it needs an ordinary `dao.confirm`, as now.

The check happens when the round is published, not when the proposal is made. That is deliberate. A member whose wallet is lost or stolen withdraws or replaces their standing address, and from that moment no unpaid proposal can pay the old one without a fresh confirmation. If a member changes their address while a distribution is open, its share to the old address can still be paid in one of two ways: the member confirms the old address for that proposal, or the share lapses and goes into the next distribution.

**4. When a standing address ends.** It ends when its member leaves, is removed, or has their key replaced (`dao.rekey`). A replaced key may have been compromised, so the new key sets its own standing address. Per-proposal confirmations are not affected.

### Replacement text for protocol section 4.2

> ### 4.2 `dao.confirm`
>
> **For one proposal.** Tags: `["e", <proposal id>]`. Content: `{"address": "<address being confirmed>"}`, optionally with `"bip322": "<signature>"` when the recipient's wallet can sign a message with that address. *(Validity, deadline and BIP-322 text unchanged.)*
>
> **Standing.** A member may instead confirm an address for all their payouts: no `e` tag, content `{"address": "<address>", "standing": true}`, optionally with `"bip322"`. It is valid when the signer is on the roster at its `created_at`, and the address is valid for the network, not a treasury address and not reserved for a pledge. A member's latest valid standing confirmation counts (by `created_at`, then `id`); `{"standing": false}` withdraws it. It ends when the member leaves, is removed or has their key replaced.
>
> A payout output whose `member` field names a member counts as confirmed if, when a round including it is published, that member's standing address is that output's address. Otherwise every payout address needs a valid confirmation for its proposal before it can enter a round.

Section 4.1's payload table changes `outputs` to `1 to 10 {address, amount_sat, member?}`. Sections 5.2 and 5.3 each gain one line saying a rekey, leave or removal ends the member's standing address.

### Privacy

A standing address is reused, so anyone can add up on chain what it has received. btc-dao's advice stays the same: a fresh address for each payout is more private. A standing address is the member's choice, and they can replace it whenever they like; the app should suggest doing so from time to time.

The link between a member's identity key and their payout address is already public in today's per-proposal confirmations, and a standing confirmation makes it no more public. The dashboard still never shows it ([dashboard spec](../dashboard-spec.md), section 6).

**Considered and dropped: a standing xpub**, from which the app would derive a fresh address for every payout. It would be better for convenience, but publishing an xpub on public relays reveals every address in that wallet branch, past and future. That is worse for privacy than one reused address.

## Test cases to add

To go into [`test-cases.md`](../test-cases.md), section 11 (rounds) and section 5 (confirmations).

| ID | Case | Expected | § |
| --- | --- | --- | --- |
| P-W01 | `payoutRound: "weekly"`, Europe/Rome: round dates after Wed 4 Nov 2026 | Mon 9 Nov 00:00, Mon 16 Nov 00:00 (local) | 6.1 |
| P-W02 | Weekly round prepared on Fri 1 Jan 2027 | Label `2026-W53` | 6.1 |
| P-W03 | Weekly round prepared on Mon 4 Jan 2027 | Label `2027-W01` | 6.1 |
| P-W04 | Weekly, `lapseAfterRounds: 2`, tallied Mon 9 Nov 2026 at 10:00, unpaid | Lapses at Mon 23 Nov 00:00 | 6.1 |
| P-W05 | As P-W04, but fees above the cap at 00:00 on 16 Nov | 16 Nov not counted; lapses at Mon 30 Nov 00:00 | 6.1 |
| P-W06 | `payoutRound: "monthly, 1st of the month"` | Read as monthly; dates and labels as before | 6.1 |
| P-W07 | Payout tallied under monthly rules; a change to weekly takes effect 3 days later | Weekly dates count from the change; the new lapse date is shown | 3.4, 6.1 |
| P-W08 | First weekly date after summer time starts (Sun 28 Mar 2027) | Mon 29 Mar 00:00 CEST, which is Sun 28 Mar 22:00 UTC | 6.1 |
| C-S01 | Member F1 publishes a standing confirmation of address X; a passed payout output pays X with `member: F1` | Confirmed without a per-proposal `dao.confirm` | 4.2 |
| C-S02 | As C-S01, but the output has no `member` field | Needs a per-proposal confirmation | 4.2 |
| C-S03 | Output pays X with `member: F2`, where X is F1's standing address | Not confirmed by F1's standing address | 4.2 |
| C-S04 | Standing confirmation by a key not on the roster | Rejected | 4.2 |
| C-S05 | Standing address that is a treasury address or reserved for a pledge | Rejected | 4.2 |
| C-S06 | F1 replaces X with Y after a proposal paying X passed, before the round | Output to X is unconfirmed; it can be paid only with a per-proposal confirmation of X | 4.2 |
| C-S07 | F1 publishes `{"standing": false}` | No standing address; later rounds need per-proposal confirmations | 4.2 |
| C-S08 | F1 leaves, is removed, or has their key replaced | Standing address ends at that moment; the new key has none | 4.2, 5.2, 5.3 |
| C-S09 | Two standing confirmations by F1 with the same `created_at` | The one with the higher `id` counts | 4.2 |
| C-S10 | Round published including an output covered only by a standing address that was withdrawn before the round | Sign refused | 4.2, 6.1 |

## What changes in the app

- `core/time.ts`: weekly round dates and ISO week labels beside the monthly ones; round dates follow the settings in force at each date.
- `core/config.ts`: `payoutRound: 'monthly' | 'weekly' | string`, read as monthly unless exactly `weekly`.
- `core/state.ts`: standing confirmations per member, ended by leave, removal and rekey; `confirmed` per output checked against the standing address in force at the round's `created_at`.
- **Profile page:** "My payout address": set, replace or withdraw, with the privacy note.
- **Proposal form and distribution helper:** when an output is for a member, add `member` and pre-fill their standing address.
- **Payment status:** an output waiting only because a standing address changed says so, and offers the member a one-tap confirmation.
- **Config example and settings page:** `payoutRound` shown as a choice of monthly or weekly.

## Decisions for review

1. **Monday as the weekly round date.** It's the ISO week start, so labels and dates agree. Another day would need a further setting.
2. **Check at round time, not proposal time.** Safer when a wallet is lost; the cost is the occasional re-confirmation when someone changes address mid-vote.
3. **`member` on outputs, optional.** Without it, the protocol can't tell whose standing address applies.
4. **No DAO-level setting for standing addresses.** Each member chooses for themselves. A DAO that wants fresh addresses only can say so in its charter.
5. **Sun to Sats `lapseAfterRounds`:** 4 with weekly rounds?
