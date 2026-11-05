# Changelog

Each release is a git tag (`v0.1.1`). A DAO's copy runs one tagged release and records it in its README; a release moves to a DAO's next stage only after passing the one before ([guide, section 8](docs/guide.md#8-the-three-stages-practice-testnet-mainnet)).

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
