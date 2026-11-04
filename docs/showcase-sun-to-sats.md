# Showcase: Sun to Sats on btc-dao

November 2026 · plan, not yet built

Sun to Sats runs a shared solar site in Sardinia: ten members, ten panels, one or two miners. Run as a btc-dao DAO, it shows both projects working together: sats produced by sunlight, held and paid out by a group with no company behind it, and every step verifiable on chain.

It is the first `production` DAO ([funding models](funding-models.md)): the miner pays into the treasury every month, so its steady I/O sits above 1, and the dashboard shows that beside **unauthorised spends: 0**.

## 1. The weekly cycle

1. **Sun to treasury.** The PV system powers the miner. The pool pays straight to one treasury address, and every payment is reconciled on chain as income.
2. **Distribution proposal.** Once a week, a council member loads the week's pool data. The app computes each member's share under the distribution rule and pre-fills a payout proposal: one output per member, up to the protocol's 10.
3. **Vote and pay.** Members vote. The council signs the round on SeedSigner, and the payout reaches each member's own wallet.
4. **Reserve.** A share of each week's income stays in the treasury as the Bridge Buffer reserve.
5. **Public proof.** btcdao.tech shows the DAO as production, its steady I/O and its reconciled treasury.

The panel and miner wiring, curtailment ([SolarSats v2](https://github.com/blankworker1/solar-sats/blob/main/docs/v2-design.md)) and pool choice stay outside the DAO. The DAO starts where the pool pays.

## 2. What btc-dao already provides

The planned `suntosats` backend was designed but never built. Most of it already exists in btc-dao:

| Planned for suntosats | In btc-dao |
| --- | --- |
| `registry-api`: members and slots | Roster, join flow, identity cards |
| `settlement-webapp`: PSBT, SeedSigner QR exchange, broadcast | Payout rounds, SeedSigner signing by animated QR, broadcast |
| `treasury-history`: aggregate treasury page | Treasury page, reconciliation, dashboard spec |
| `onboarding-webapp` | Join flow with sponsor and council verification |

The key ceremonies match too: btckeys (Entropia, hand-stamped plates, SeedSigner) cuts each member's own wallet key, and the same session can enrol them in the DAO.

## 3. What remains to build

1. **Distribution helper** in the DAO's app, from [`showcase/bridge-buffer-dashboard.html`](showcase/bridge-buffer-dashboard.html). Its core (split a total by share, show idle members at 0%) carries over. Its inputs change: members own panels, not miners, so the share comes from the distribution rule (section 4), not from hashrate per worker. Pool data is pasted at first; a small Cloudflare Worker can poll the pool later, because browsers cannot fetch pool stats directly.
2. **Sun front page**: a preview with demo data is built at [`showcase/sun-to-sats/`](../showcase/sun-to-sats/index.html) and published at https://bitcoin-dao.github.io/btc-dao/showcase/sun-to-sats/. Its demo state is one JSON block shaped like the app's rebuilt state, so going live replaces that block. It started from [`showcase/sun-to-sats-treasury-prototype.html`](showcase/sun-to-sats-treasury-prototype.html): a read-only page in the Sun to Sats DAO's own copy of btc-dao, rebuilding state from relays and the chain like the app does.

| In the prototype (mock data) | Real source |
| --- | --- |
| Centre of the sun: treasury balance | Treasury descriptor and the chain |
| Particles drifting in: mining income | Payments into the treasury |
| Ten orbiting wallets, registered or open | Roster members; open slots up to ten |
| Settlement rays to each wallet | Each paid round's `dao.receipt` |
| Ticker of settlements with txids | Rounds and receipts |
| "Settlements confirmed" | Count of receipts |

Replaced by btc-dao: the PIN login and register form (join flow), the accrued balance and settlement threshold (monthly distribution proposal), and "update address" (recipient confirmation, see decision 4). The "Start with this" text and the layers section carry over.

## 4. Decisions before building

Decided: weekly cadence (changeable by a rules vote), and payout addresses carried in each distribution proposal. Both are now in the protocol (sections 4.2 and 6.1): Sun to Sats sets `payoutRound` to `weekly`, with `lapseAfterRounds` at 4 so the council has about a month to sign, and each member confirms a standing payout address once.

1. **Distribution rule.** Equal split per member, or by panel ownership or energy share. With one shared miner, hashrate per worker cannot attribute income to members.
2. **Reserve share.** What percentage of each week's income stays in the treasury for the Bridge Buffer.

Note on payout addresses: a standing address that a member confirms once is reused every week, so anyone can see on chain how much each address has received. btc-dao advises a fresh address per payout; a member who cares can withdraw and replace their standing address whenever they like.

Also to align: the council is 3-of-5 (the protocol's fixed five keys), five of the ten members, replacing the earlier 6-of-10 plan. The pool pays to one fixed treasury address, which is reused; reconciliation still works.

## 5. Order

1. Make decisions 1 and 2, and write the rule and reserve share into a charter module.
2. Build the distribution helper and rehearse the weekly cycle in `uno-practice`, with simulated pool payments.
3. Connect the sun front page to the practice DAO.
4. Found the Sun to Sats DAO on mainnet with the site live, funding model `production`, listed on btcdao.tech.

## 6. Later: Layer 01, sunblocks

A **sunblock** is a whole solar panel (500 W) that a member buys through the DAO and owns outright. It is a structured contribution layer on top of the weekly cycle: members pay in sats to cover the cost of their own panel, and the panel's output is counted in their share. The rules are drafted as the [member assets charter module](charter-modules/member-assets.md).

**The model: a buying group.** The DAO works like a *gruppo di acquisto solidale*. Neighbours pool an order: the group collects each person's money, places one order with the supplier and hands each person what they paid for. It holds the money only on its members' behalf and never owns the goods. Here the order is a panel, the group's bookkeeping is the public record, and the hand-over is a passed ownership statement. The members own the panels; the DAO runs the arrangement.

**The flow**

1. **Pledge.** A member asks for a sunblock. The app reserves a treasury receive address for that pledge, derived from the treasury's own descriptor, and records it publicly, so its payments can be told apart from mining income.
2. **Pay in.** The member pays the panel's price in sats, at once or in instalments. Progress shows against the pledge. Until the panel is bought, these sats are **held for the member**: kept in their own coins, never spent with the DAO's funds, and usable only to buy that panel or refund the member.
3. **Buy for the member.** When the pledge is covered, a payout proposal pays the supplier from the pledge for the panel and its share of mounting and cabling. Members vote; the council signs; reconciliation matches the spend.
4. **Record ownership.** After installation, a statement proposal records the sunblock, its owner and the pledge that funded it. Once passed, it is permanent and public: the sunblock register is the chain of these records.
5. **Earn.** The distribution rule gives each member a base share, plus a panel share for each sunblock they own.

**One treasury, two parts.** No second wallet is needed. The pledge addresses belong to the same 3-of-5 treasury, so the same council keys and SeedSigner sign, and a restore from the recovery sheet finds every coin. What keeps pledges apart is that each pledge's coins are never mixed with the DAO's: on chain, every member's money can be followed coin by coin. The treasury balance is shown in two parts, **DAO funds** and **held for members**.

**Dashboard.** Pledge payments are not the DAO's income. The dashboard shows them as **pledged** and leaves them out of steady I/O, so a member buying a panel does not make the DAO look more self-sustaining than it is. A spend of pledge coins for anything except that pledge's panel or refund counts as unauthorised ([dashboard spec](dashboard-spec.md), sections 2 and 2a).

**Protocol.** Nothing new is needed to start: pledges, buying and ownership records use the existing payout and statement proposals, plus the pledge address convention. If it works, a `pledge` proposal type could formalise it for any DAO buying shared assets for its members.

**Decisions for later**

1. The weights in the distribution rule: base share against panel share.
2. Who carries the price risk while a pledge is paid in instalments.
3. Whether only members, or anyone, can buy a sunblock.
4. Legal check: whether holding pledges for members counts as holding client money anywhere the DAO's members live.
5. **Deferred payouts into a pledge** (the automatic route from Layer 0 to Layer 01). A member opts in once to have their weekly share paid into their own pledge address. The distribution helper sends what the pledge still needs there and the rest to their standing address. When the pledge is covered, the panel is bought and full payouts resume. It is the member's own choice, not a group vote: the weekly distribution is voted on as usual. The share is paid out to the pledge address as its own coin, not kept back in the treasury, so pledges stay ring-fenced. Needed before it can run:
   - the protocol allows a payout output to a pledge address only when the output names the pledge's owner and the owner has opted in (today any payout to a treasury address is refused);
   - pledge addresses go on the public record (an open question in the [dashboard spec](dashboard-spec.md), section 9);
   - a signed "defer to my pledge" switch, checked when the round is published and ended by leaving or a new key, like a standing address;
   - the dashboard counts a deferred share as outflow and as **pledged**, and shows the spend as a move from DAO funds to held for members, not as unauthorised.

## Reference files

`docs/showcase/` holds the two earlier prototypes as they were, for reference: the Sun to Sats treasury front end and the Bridge Buffer MVP dashboard. Both use mock or pasted data and are not part of the app.
