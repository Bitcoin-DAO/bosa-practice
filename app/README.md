# btc-dao app

The DAO's website: one static page that members open on their phones. It holds no keys that can move funds and talks only to the DAO's relays and its chain API. Everything it shows is rebuilt in the browser from signed events (`docs/protocol.md` section 8).

**The testnet4 prototype, stages 1 to 3** (this version). Stage 1:

- founder sign-up with a passkey and a random identity key, the short code and the founder QR code;
- the council's setup page: basics, council (identity plus trial treasury key), founders, publish the genesis, endorsements;
- the passkey wrap of each founder's key (`dao.keywrap`) once the DAO is founded, passkey sign-in on any synced device;
- identity cards printed straight from the browser, and restoring from a card on a new phone;
- the treasury page: balance, donation address (one at a time, none at the cap), movements, from the descriptor and the chain API;
- members and rules pages, with the charter checked against its hash.

Stage 2:

- proposals of every kind except a council change: payout, statement, new member, removal, rules change, closing the DAO; numbers like UNO-0007 derived by every client;
- voting, changing a vote until the close, quorum and simple or two-thirds majority, from the rules in force when the proposal was published;
- the final count, published automatically by council phones after the close; conflicting counts are shown as disputed;
- recipient confirmation by link, with or without a DAO key;
- new members: the candidate's own key and passkey, the sponsor, the council's check (one in person, or two on a video call), the vote, then the next member list;
- leaving, and replacing a lost key (same person, same votes);
- the council inbox: publishing and approving new member list and rules versions, approving key replacements, checking candidates;
- the record of each proposal: every signed event behind it.

Stage 3:

- the next round date and the approved payouts waiting for it on the treasury page;
- preparing a round (council): every approved, confirmed and unexpired payout, coins chosen largest first, the fee rate suggested by the chain API and capped by the rules, change back to the treasury;
- checking a round on every phone before signing: outputs exactly the payouts, change and coins the treasury's own, fee within the cap, one open round at a time;
- signing with the trial treasury key in the browser, or exporting the PSBT to Sparrow or Nunchuk and pasting it back signed; declining with a reason;
- combining the signatures, finalising and broadcasting once the threshold is reached; council phones publish the receipt at the first confirmation;
- payout statuses on each proposal (waiting, in a round, paid, lapsed) and the round named in the treasury's movements;
- closing the DAO: the whole balance to the confirmed destination, then the final settings.

Not yet: council changes (migration and sweep rounds) and SeedSigner signing with animated QR codes, which come with phase 2.

For the trial, each council member's phone also creates a **test treasury key** (12 words, testnet4 only) and shares its xpub in the founder code. On the setup page any council key can be swapped for one from Sparrow, Nunchuk or SeedSigner (`[fingerprint/48h/1h/0h/2h]tpub…`). The mainnet DAO uses SeedSigner only.

## Layout

| Path | What it holds |
| --- | --- |
| `src/core/` | The protocol, with no browser code: canonical JSON, short codes, events, descriptors and addresses, identity keys and cards, rebuilding state, the treasury from an Esplora API. Rounds in `round.ts`, round dates in `time.ts`. Unit tests in `core.test.ts`, `governance.test.ts` and `round.test.ts` |
| `src/lib/` | Browser parts: passkeys (WebAuthn PRF), relays, QR drawing and scanning, IndexedDB storage |
| `src/ui/` | The screens, following `design/mockups` |
| `src/i18n.ts` | Italian and English text |
| `e2e/` | End-to-end tests with a local relay, a mock chain API and virtual passkeys |

## Config

The build reads the DAO's config file and serves it as `dao.json` beside the page. It takes `DAO_CONFIG` if set, then `config/dao.json` (an instance's own file), then the example. Placeholders in square brackets are ignored. After founding, add `"daoId": "<id>"` to the instance's file so the app goes straight to that DAO.

The charter comes from `DAO_CHARTER` if set, then `config/charter.<language>.md` for the binding language in the config (`rules.charterLanguage`, English if unset), then `docs/charter-template.en.md`. Its SHA-256 goes into the genesis, and the rules page checks the text against it, so the file must not change after founding except by a rules change.

The page's content security policy is built from the same file: it can connect only to the listed relays and chain APIs.

## Develop and test

```sh
npm ci
npm test            # protocol unit tests
npm run dev         # local site; passkeys bind to localhost
npm run build       # type check and build into dist/
bash e2e/run.sh     # end to end (needs relay/ installed, Playwright with Chromium, ffmpeg)
```

The end-to-end runs: founding with five council phones and two founders (one remote), the identity card's QR, funding the treasury in a mock chain API, signing out and back in, restoring on a new phone from the card, reading a card through a fake camera; then, in a second DAO with a two-minute voting period, a payout confirmed by its recipient, a rules change, a new member from sign-up to member list, a member leaving, and a lost key replaced by the council; then, in a 2-of-3 DAO on a mock chain, a payout from proposal to round, two signatures, broadcast, receipt and the new balance, with the broadcast transaction checked independently by embit (`e2e/embit-check.py`).

## Deploy

`.github/workflows/pages.yml` builds and publishes the site to GitHub Pages whenever the repository has a `config/dao.json`, so it runs in a DAO's own copy (such as `Bitcoin-DAO/uno-testnet`) and not in `btc-dao` itself. In the copy, set Settings → Pages → Source to "GitHub Actions".
