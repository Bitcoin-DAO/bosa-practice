# Showcase: Sun to Sats on btc-dao

November 2026 · plan, not yet built

Sun to Sats runs a shared solar site in Sardinia: ten members, ten panels, one or two miners. Run as a btc-dao DAO, it shows both projects working together: sats produced by sunlight, held and paid out by a group with no company behind it, and every step verifiable on chain.

It is the first `production` DAO ([funding models](funding-models.md)): the miner pays into the treasury every month, so its steady I/O sits above 1, and the dashboard shows that beside **unauthorised spends: 0**.

## 1. The monthly cycle

1. **Sun to treasury.** The PV system powers the miner. The pool pays straight to one treasury address, and every payment is reconciled on chain as income.
2. **Distribution proposal.** Once a month, a council member loads the month's pool data. The app computes each member's share under the distribution rule and pre-fills a payout proposal: one output per member, up to the protocol's 10.
3. **Vote and pay.** Members vote. The council signs the round on SeedSigner, and the payout reaches each member's own wallet.
4. **Reserve.** A share of each month's income stays in the treasury as the Bridge Buffer reserve.
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
2. **Sun front page**, from [`showcase/sun-to-sats-treasury-prototype.html`](showcase/sun-to-sats-treasury-prototype.html): a read-only page in the Sun to Sats DAO's own copy of btc-dao, rebuilding state from relays and the chain like the app does.

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

1. **Distribution rule.** Equal split per member, or by panel ownership or energy share. With one shared miner, hashrate per worker cannot attribute income to members.
2. **Reserve share.** What percentage of each month's income stays in the treasury for the Bridge Buffer.
3. **Cadence.** Monthly, matching btc-dao's payout rounds and one vote a month, rather than the Bridge Buffer's weekly design.
4. **Payout addresses.** Today every payout address needs the recipient's confirmation each time, and btc-dao advises a fresh address per payout. For a monthly distribution to ten members, either members confirm each month, or btc-dao adds a standing payout address that a member registers once (a protocol change). Sun to Sats chose a single static address per member; that is a privacy trade-off worth deciding openly.

Also to align: the council is 3-of-5 (the protocol's fixed five keys), five of the ten members, replacing the earlier 6-of-10 plan. The pool pays to one fixed treasury address, which is reused; reconciliation still works.

## 5. Order

1. Make decisions 1 to 4, and write the rule and reserve share into a charter module.
2. Build the distribution helper and rehearse the monthly cycle in `uno-practice`, with simulated pool payments.
3. Connect the sun front page to the practice DAO.
4. Found the Sun to Sats DAO on mainnet with the site live, funding model `production`, listed on btcdao.tech.

## Reference files

`docs/showcase/` holds the two earlier prototypes as they were, for reference: the Sun to Sats treasury front end and the Bridge Buffer MVP dashboard. Both use mock or pasted data and are not part of the app.
