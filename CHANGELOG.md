# Changelog

Each release is a git tag (`v0.1.1`). A DAO's copy runs one tagged release and records it in its README; a release moves to a DAO's next stage only after passing the one before ([guide, section 8](docs/guide.md#8-the-three-stages-practice-testnet-mainnet)).

## v0.1.5 · 6 November 2026

Found in UNO's practice run: mempool.space's testnet4 indexer was unstable for most of the day, and it was the only source.

**A second chain source: Blockbook**
- `chainApi` entries can now be Blockbook servers, written `blockbook:<address>`, next to Esplora APIs. The app asks in Esplora's terms and translates Blockbook's answers for all six requests: address activity, transactions, unspent coins, transaction status, fee estimate and broadcast.
- Sources are asked in order; a source that fails is asked last for the next five minutes, so one slow source does not slow every request.
- The site's current `chainApi` is used first, then the one recorded at founding, so a founded DAO can add a source without a vote. A source shows data but never moves coins: every payment is checked against the treasury's descriptor.
- Explorer links and the manual broadcast page follow the first source (Blockbook: `/tx/<txid>` and `/sendtx`).
- Example config: Zelcore's testnet4 Blockbook (`blockbook:https://blockbook.tbtc.zelcore.io`) as the second source.

**Tests**
- Unit tests read UNO's practice treasury from Blockbook answers and fall back from a silent Esplora source.
- The end-to-end mock chain also answers as Blockbook (`CHAIN=blockbook bash e2e/run.sh payouts`): a full payout round, broadcast included, with Blockbook as the only source.

## v0.1.4 · 6 November 2026

Found in UNO's practice run: with mempool.space unstable, the treasury page kept loading or showed only an error.

**The treasury page shows what it last knew**
- Each phone remembers the last treasury reading and shows it at once, with the time it was read ("Read from the blockchain: 6 Nov, 13:48"), then refreshes in the background ("updating…"). A failed refresh shows "not updated, the blockchain is not answering" and keeps the balance.
- The funding address shows while the treasury is loading too.
- One reading at a time; a reading is refreshed after 5 minutes, at once after a payout round moves, and retried by itself at most every 2 minutes after a failure.
- A whole reading gives up after 2 minutes, and errors say what failed ("/address/…: no answer in 30 s").

**Payout rounds use only live coins**
- Preparing a round waits for a fresh reading of the treasury's coins and never builds from the remembered one.

## v0.1.3 · 6 November 2026

Found in UNO's practice run: with mempool.space working again, the treasury still timed out.

**Treasury page asks far less of the blockchain service**
- The treasury check looks 5 unused addresses past the last used one, not 20. The app only ever shows the first unused address and takes change in order, so used addresses stay contiguous. A new treasury now needs about 10 requests instead of 40.
- Requests go one at a time with a short pause, and each may take up to 30 seconds. mempool.space slows bursts down rather than refusing them, so later requests in a burst ran past the old 15-second limit.

**Docs**
- Testnet treasury log: 10,000 sats to UNO's practice.

## v0.1.2 · 6 November 2026

Found in UNO's practice run (2 of 2, two phones).

**Treasury page survives the blockchain service**
- Reading the treasury no longer sends bursts: two addresses at a time with a short pause, each request retried twice and given up after 15 seconds. mempool.space refused the old bursts, which reached the page only as "Failed to fetch", and a stalled request could leave the page loading for ever.
- When the blockchain cannot be read, the page still shows the treasury's funding address, worked out on the phone from the descriptor.

## v0.1.1 · 5 November 2026

**Remote founding without a call**
- Founder sign-up, code page: a **Share** button sends one message (DAO, role, pseudonym, short code and full code) through the phone's share sheet, or copies it where sharing is not available.
- The message names the role, **Council** or **Founder**, so a mistaken council request shows in the group.
- The code page's wording covers founding **in person** and **remote**.
- The setup page's paste box accepts the whole shared message, not only the bare code.
- The council box reads **I request a council seat**.

**Starting again**
- The code page has a **Start again** link.
- Starting the sign-up again also discards the setup draft, which belonged to the old identity.

**DAO-owned files**
- New `site/` folder: the DAO's own static pages and files, copied next to the app at build. Like `config/`, it belongs to the DAO and is never touched by updating btc-dao.

**Docs**
- BTC DAO Testnet Treasury: new dedicated wallet (`2N5SK7BFXGzefmMs9AHui2Y71fUh3uVVn2S`) and the first log entry.
- Guide: the remote route through the DAO's group at founding.

## v0.1.0

The testnet4 prototype: founding, passkey sign-in, identity cards, treasury, proposals and votes, membership, key replacement and payout rounds signed by the council. Tagged afterwards, at the commit the UNO stages were set up from.
