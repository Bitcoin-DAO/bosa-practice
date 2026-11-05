# Founding and running a Bitcoin DAO: the complete guide

This guide walks through every step of founding and running a DAO built on btc-dao, using UNO, the first DAO's trial stages, as the example. It is written for the people who will do the work: the organiser, the council, the maintainer and the founding members. The plain-language introduction is [what-is-a-bitcoin-dao.md](what-is-a-bitcoin-dao.md); the exact rules are in [spec.md](spec.md) and [protocol.md](protocol.md).

**Status.** The software for the testnet stages exists (the phase 1 prototype in `app/`); hardware signing and mainnet follow. Every DAO goes through **three stages**, practice, testnet and mainnet, each a separate DAO with its own tested build (section 8). Where the design did not say what happens, the guide marks a **gap** (G-01, G-02, …): resolved gaps say how, open ones still need a decision. All are listed in the [gap register](#gap-register) at the end.

## Contents

1. [The people and what they do](#1-the-people-and-what-they-do)
2. [Before founding](#2-before-founding)
3. [The council ceremonies](#3-the-council-ceremonies)
4. [The founding meeting](#4-the-founding-meeting)
5. [Funding the treasury](#5-funding-the-treasury)
6. [Everyday running](#6-everyday-running)
7. [Changing the DAO](#7-changing-the-dao)
8. [The three stages: practice, testnet, mainnet](#8-the-three-stages-practice-testnet-mainnet)
9. [When something goes wrong](#9-when-something-goes-wrong)
10. [Closing a DAO](#10-closing-a-dao)
11. [Gap register](#gap-register)

## 1. The people and what they do

| Role | How many | Job | Holds |
| --- | --- | --- | --- |
| Member | Any number | Proposes and votes | A phone with a passkey; optionally an identity card at home |
| Council member | 5 in the reference setup | Verifies new members, publishes final counts, approves changes to the member list and settings, signs payout rounds | Everything a member holds, plus a SeedQR card, a steel seed plate, their own SeedSigner SD card and a copy of the recovery sheet; an identity card is required |
| Organiser | 1 at founding | Runs the setup page at the founding meeting | Must be a council member, because publishing the founding settings is a council act |
| Maintainer | 1 or 2 | Keeps the DAO's copy of the software, hosting and relay running | Access to the repository and hosting; no treasury key |
| Sponsor | One per new member | Vouches for a new member and opens the add-member proposal | Is an existing member |

Any three council members together can move the treasury. Members cannot move money at all. The council is trusted to follow the members' votes: the app only offers signing for payments members have approved, but three council members acting together outside the app could sign anything. Every such payment is public. This is the trust model of any multisig treasury and is recorded in the spec's threat model.

## 2. Before founding

### 2.1 Agree the purpose and the charter

1. Write down in a few sentences what the money is for and who can join. This becomes the DAO's description and the opening of its charter.
2. Read [funding models](funding-models.md) and discuss it at a members' meeting: where will the money come from once the first donations are spent? Choose the primary model (`grant`, `production`, `mutual` or `revolving`) and record it in the settings (`fundingModel`). This is required before the mainnet charter is drafted; the trial stages may set a model too, to rehearse the choice.
3. Draft the founding charter: purpose, who may join, how members behave, what the money may and may not be used for, that votes and pseudonyms are public and permanent, and that members must be 18 or over. Members tick that they accept it when they join.

A short core [charter template](charter-template.en.md) in English covers purpose, what the DAO is and is not, members, the council, the treasury, decisions, the public record, conduct, changes and closing. Numbers and procedures stay in the settings, which the app shows beside the charter. Optional [modules](charter-modules/) add articles a DAO may want: council handbook (keys, absence, death), council eligibility, use of funds, conduct, language, personal data and the trial phase. A DAO writes its charter in the language it sets as binding (`charterLanguage` in the settings), saves it as `config/charter.<language>.md`, and the app shows and hashes that copy. UNO's current copy ([Italian](../config/example.charter.it.md), [English](../config/example.charter.en.md)) was written from the earlier, longer template. It still needs the founding meeting's values and a legal review. Its SHA-256 goes in the settings (`charterSha256`), so everyone can check which text is in force.

> **Gap G-01.** Partly resolved: the "first wallet in 5 minutes" guide now exists ([Italian](wallet-guide.it.md), [English](wallet-guide.en.md)). The charter still needs its legal review before mainnet.

### 2.2 Choose the council and the founders

1. Choose five council members. Good keyholders:
    - are trusted by the group and by each other;
    - do not share a household or an employer with another council member;
    - can attend a monthly signing session, or will sign remotely with their own SeedSigner;
    - are comfortable keeping a seed plate and a SeedQR card safe for years.
2. List the founding members who are not on the council. They join at the founding meeting without a vote.

For the practice stage (section 8), 3 to 5 people are enough: the council-to-be, with a threshold that suits the people in the room, for example 2 of 3. The testnet and mainnet stages use the real council of five.
3. Settle the starting rules. The reference values, used by UNO:

| Setting | Reference value |
| --- | --- |
| Council and threshold | 5, any 3 to sign |
| Voting period | 7 days, always run in full |
| Quorum | One third of eligible voters, rounded up |
| Majorities | Simple for payouts, statements and new members; two thirds for removals, rule changes and council changes |
| Payout rounds | Monthly, on the 1st |
| Lapse | A passed payout lapses if unpaid by the second round date after its final count |
| Fee-rate cap | 20 sat/vB; a month with higher fees waits |
| Time zone | Europe/Rome, for round dates |
| Treasury cap (trial) | 5,000,000 sats |

> **Gap G-02.** With a small founding group, the council's own five votes can meet quorum and pass a proposal if no one else votes. This is accepted for now. If the group stays small, consider a rule that a proposal needs at least one yes from a member outside the council.

### 2.3 Choose the addresses and hosting

1. **Practice and testnet addresses.** Both disposable stages run on GitHub Pages, published straight from their repositories: free, with HTTPS built in. UNO's practice stage is at `bitcoin-dao.github.io/uno-practice` and its testnet stage at `bitcoin-dao.github.io/uno-testnet`. Their passkeys are tied to `bitcoin-dao.github.io`, which is fine because every stage is a separate DAO; practice passkeys are labelled "(prova generale)" so they are easy to delete afterwards. GitHub Pages cannot send custom security headers, so the content security policy is set inside the page.
2. **Mainnet name and domain.** The council chooses the mainnet DAO's name before its founding meeting, and the domain follows from it, with the relay on a subdomain (for a DAO at `dao.example`: `relay.dao.example`). The project site and dashboard live at `btcdao.tech`. Pay several years ahead, turn on auto-renew, and give two council members access to the registrar account.
3. **The domain is permanent.** Passkeys are tied to it. A move is possible (section 7.5), but costs every member a card scan or a key replacement.
4. **Relay.** The DAO relay runs Nosflare on Cloudflare Workers, under the Bitcoin-DAO organisation's Cloudflare account, with pay-to-relay off and only the DAO's event kinds and tag allowed (protocol 7.3). One relay, `btc-dao-relay.btcdao.workers.dev`, serves the practice and testnet stages: after each founding, that DAO's id is added to its list ([relay/README.md](../relay/README.md)). The mainnet DAO gets its own, on its own domain. Two public relays are listed as well (`nos.lol` and `relay.damus.io` for UNO).
5. **Chain data.** Choose an Esplora-compatible block explorer for balances and broadcasting (mempool.space for testnet4), and a second one as fallback.

> **Gap G-03.** Who registers the mainnet DAO's domain, and how ownership passes on, is not settled; the name, and so the domain, is the council's to choose first. The DAO has no legal entity, so a person or organisation must be the registrant.
>
> **Gap G-04.** Partly resolved: GitHub Pages for the trial site, Nosflare on Cloudflare for the relay. Still open: the mainnet site host, and who pays for Cloudflare beyond its free tier. The relay's cost could be the DAO's first recurring payout proposal.

### 2.4 Get the equipment

| Item | How many | Notes |
| --- | --- | --- |
| SeedSigner (Raspberry Pi Zero without radio, 1.3" screen, camera) | 2: one in use, one spare | Bought from different sources and kept sealed between rounds (S8) |
| microSD card | 1 per council member, plus spares | Each member's own, prepared at the SD card ceremony |
| Casino dice | At least 1 set | For creating seeds |
| Steel seed plates and letter punches | 1 per council member | The long-term backup of each seed |
| SeedQR card templates | 1 per council member | Filled in by hand from the SeedSigner screen |
| Printer and card stock | 1 | For the recovery sheet and identity cards; laser printing lasts longest |
| Plastic sleeves | 1 per card | |

Check current prices before buying; nothing here is expensive, and the SeedSigner parts are standard.

### 2.5 Set up the software

Done once per stage, each in its own repository in the Bitcoin-DAO organisation (for UNO: `uno-practice`, then `uno-testnet`):

1. Create an empty public repository and fill it from btc-dao at a released version (section 8).
2. Write `config/dao.json`: the stage, name and purpose, network, the site address and passkey domain, the relays and chain API, the starting rules (ten-minute votes for practice) and, for practice and testnet, the BTC DAO Testnet Treasury's return address. The council, founders and descriptor stay as placeholders: the setup page fills them in at the founding meeting.
3. In the repository's Settings → Pages, set the source to GitHub Actions. Every push then runs the tests and publishes the site (`.github/workflows/pages.yml`). Until the founding it shows founding mode: Founder sign-up and the setup page.
4. Check the site on members' phones: a test sign-up shows whether the phone can protect the key with its passkey (no yellow warning), and whether it can print a card. Clear the test sign-up and delete its passkey afterwards.

For UNO a developer does this. For later DAOs, the fork kit (phase 4) turns it into a guided setup.

### 2.6 Legal check

> **Gap G-05.** The legal position is not confirmed: whether keyless coordination software counts as custody, how the DAO's funds are treated for tax in Italy and the UK, and what liability council members carry. Take advice before mainnet funds.
>
> **Gap G-06.** Votes and pseudonyms are public and permanent, and anchored to Bitcoin so they cannot be changed. Under EU data protection law members have a right to erasure. Pseudonyms reduce the risk but do not remove it. Ask the legal adviser how the charter and the consent wording should handle this.

## 3. The council ceremonies

Each council member goes through two ceremonies before the mainnet founding meeting, and before the testnet stage moves to hardware signing in phase 2. They can be held on the same day.

**Practice, and the testnet stage in phase 1, skip the ceremonies.** There, each council member's phone creates a test treasury key when they sign up as a founder and tick "I request a council seat": 12 words, shown on their profile page, with only the public key going into their sign-up code. They sign payout rounds on the phone, or in Sparrow or Nunchuk. Test keys must never hold real funds.

### 3.1 SD card ceremony

Each council member prepares their own SD card, so that no one else's card ever runs on the shared device with their seed.

1. Download the official SeedSigner release image.
2. Verify its signature and checksum, following SeedSigner's own instructions.
3. Write it to the member's own microSD card.
4. Label the card with the member's name. It holds no seed and no keys.

### 3.2 Key ceremony

Done by each council member alone, at the shared SeedSigner or their own.

1. Boot the SeedSigner from your own SD card.
2. Create a new 12-word seed from dice rolls (50 rolls for 12 words). Do not use a seed made anywhere else.
3. Stamp the 12 words onto your steel plate. This is the backup and stays at home.
4. Fill in your SeedQR card by hand from the SeedSigner screen (a 21×21 CompactSeedQR). This is what you carry to signings.
5. Export your public key (xpub) for multisig, at the BIP-48 path for testnet4 (`m/48'/1'/0'/2'`) or mainnet (`m/48'/0'/0'/2'`), as a QR code. Note your 8-character fingerprint.
6. Power off. The SeedSigner keeps nothing.

Rules that never bend: never type a seed into a phone or computer; never photograph it; never store your SeedQR card with another member's or with the shared device; never sign anything the device screen does not confirm.

### 3.3 Build the wallet and the recovery sheet

1. The organiser scans the five xpubs into the setup page. It builds the 3-of-5 treasury descriptor.
2. Print the recovery sheet: DAO name, network, threshold, the descriptor as text and QR, the five fingerprints with their holders, and plain restore steps. One printed copy per council member, kept away from their seed, and a copy in the DAO's public repository.
3. Each council member loads the descriptor onto the SeedSigner and checks their own fingerprint is in it.
4. **Test before any funds:** restore the wallet in Sparrow from the recovery sheet alone, send testnet4 coins in, and spend them with three seeds. This is phase 2's gate, and it is the only proof that the money can be recovered without btc-dao.

## 4. The founding meeting

The first members join here, because the normal route needs a sponsor, a council member and a vote that do not exist yet. Being listed in the founding settings, approved by the council, takes their place. Remote founders can join by video call.

1. **Open the setup page.** The organiser (a council member) opens it on their phone. Tab 1 holds the basics: name, purpose, address, passkey domain, network and starting rules.
2. **Founder sign-up.** Each founder, council members included, opens Founder sign-up on their own phone, enters a name and creates a passkey. The app makes a random identity key and keeps it in that browser only for now. Founders must not clear the browser or switch phones until the founding is finished.
3. **Read the codes aloud.** Each founder shows a QR and a short code. The organiser scans it and both read the short code aloud; it must match. Remote founders send the code by message and read it on the call. Without a call, a founder taps **Share** and sends the message to the DAO's group: it carries their name, short code and full code, the organiser pastes it into setup, and the group sees who sent it.
4. **Council keys.** In tab 2 the organiser scans each council member's code and sets the threshold. On testnet the code already carries the member's test treasury key; on mainnet, and wherever a member uses their own wallet, "Use another treasury key" takes the key and fingerprint from the key ceremony (`[fingerprint/48h/…/2h]tpub…`).
5. **Check and publish.** In tab 4 everyone checks the summary together: the DAO, the council and threshold, the founders, the DAO id. The organiser signs and publishes the founding settings. Nothing in them can change later except by proposal.
6. **Council approval.** At least three council members approve the founding settings on their own phones. Their approval stands in for verifying each founder: they heard every short code read aloud and approved the list. At the third approval the DAO exists.
7. **Protect and print.** Each founder's app now knows the DAO id. The passkey protects the identity key, and the founder can print their identity card. Council members print theirs before signing anything else.
8. **Hand-out** (mainnet, and testnet from phase 2). Each council member takes their copy of the recovery sheet. The shared SeedSigner and the spare are sealed and stored.

Next comes funding (section 5). In the practice and testnet stages, also add the new DAO id to the relay's list and to the site's `config/dao.json` (`daoId`); the setup page shows it once the DAO is founded.

> **Gap G-07.** Who keeps the shared SeedSigner and the spare between rounds, and where, is not assigned. S8 says sealed, bought from different sources, and signing times not announced, but not who holds them.

If a founder loses their key before step 5, they sign up again before publication. After that, a lost key goes through the normal key replacement.

## 5. Funding the treasury

1. **On testnet4** (the practice and testnet stages), fund the treasury from the **BTC DAO Testnet Treasury**, the organisation's own testnet4 wallet: about 50,000 sats for a practice stage, about 500,000 for a testnet stage. Copy the donation address from the treasury page, send, and wait for it to appear; test blocks can arrive in bursts or slowly. Each disposable stage returns the coins when it closes (section 10). Step by step in [testnet-treasury.md](testnet-treasury.md). Run at least one full payout round before going near real money.
2. **On mainnet**, anyone can donate by scanning the treasury page's receive address. Every incoming payment appears on the public treasury page.
3. Respect the trial cap (5,000,000 sats in the reference rules) while the system proves itself.

4. **One donation address at a time.** The treasury page shows a single address and keeps showing it until it receives a payment, then moves to the next. Unused addresses never pile up, so a standard wallet restoring from the recovery sheet always finds every coin. (Resolved G-09.)
5. **At the cap,** the page stops showing a donation address. Anyone can still send to an old address, so if the balance goes over the cap anyway, every client shows it and members vote: raise the cap, or pay out the excess. (Resolved G-08.)
6. **Fees.** The fee cap is a fee rate (20 sat/vB in the reference rules), not a fixed sum. If network fees are above it on the round date, no round is built that month: payouts wait, and that month does not count toward their lapse. (Resolved G-10.)

## 6. Everyday running

### 6.1 New members

1. The candidate asks a member who knows them to sponsor them.
2. They meet with the sponsor and one council member, or with two council members on a video call.
3. The candidate opens the site, taps **Become a member**, chooses a name, ticks the age, charter and public-record box, and creates a passkey. Their phone shows a QR code and a short code.
4. The council member opens **Council → Check a candidate**, scans the code, and both read the short code aloud. The council member's phone signs the check, in person or remote. A remote candidate needs this from two council members.
5. The sponsor opens **Profile → Propose a new member** and scans the same code. Once the check is in, the sponsor's phone publishes the add-member proposal, pre-filled and linked to it.
6. Members vote. If it passes, a council member's phone publishes the final count, and three council members approve the new member list (**Council → Member list**).
7. The candidate's waiting page sees them on the list and asks for the passkey once more to protect the key. They can then vote, and print their identity card.

Remote members are marked "verified remotely" until someone verifies them in person, and in the trial they cannot join the council.

### 6.2 Proposals

1. Any member writes a proposal: type, title (up to 80 characters), summary (up to 500; the binding text), an optional link to the full text, and the language.
2. For a payout, the recipient's address goes in its own box, scanned from the recipient's wallet. Payouts can pay several recipients.
3. If the recipient is not the proposer, the recipient confirms the address on the proposal page. There is no deadline, but an unconfirmed payout cannot be paid and lapses under the usual rule.
4. Discussion happens wherever the group already talks. The proposal links to it; the DAO records only the decision.

### 6.3 Voting and the final count

1. Every member on the member list when the proposal was published can vote yes, no or abstain, and change their vote until the end.
2. The vote always runs 7 days. A member who leaves before the close loses their vote; one whose key is replaced keeps it.
3. At the close, a council member signs the final count: which votes counted, which were excluded and why, the result, and the proposal's permanent number.
4. Any member's app timestamps the record on Bitcoin with OpenTimestamps. (Not in the app yet: G-20.)
5. If two council members publish different counts, the proposal is disputed until three council members approve one.

Nobody has to remember to publish the count: every council member's app publishes it automatically the first time it opens after the close, unless a count is already there, and identical counts from two council members are one count, not a dispute. Receipts and timestamps are published the same way by whichever app sees the confirmation or the closed vote first. (Resolved G-11.)

### 6.4 Payout rounds and signing sessions

Once a month, every approved payment goes out in one transaction.

1. **Prepare.** Around the round date (the 1st of the month, Europe/Rome time; resolved G-12), any council member opens **Council → Prepare the payout round**. The round date is what counts for lapse; a round can be prepared at any time. The app gathers every passed, counted and confirmed payout not yet paid, picks the treasury's coins, adds change back to the treasury and a fee within the cap, and publishes the round; the preparer's phone signs it straight away. Only one round can be open at a time.
2. **Verify.** Every other council member's app rebuilds the payments from the approved proposals and refuses to offer signing if anything differs by a single sat, the fee is above the cap, or the change does not return to the treasury.
3. **Sign.** In the practice stage, and the testnet stage in phase 1, each council member opens the round, checks every address and amount against the proposals, and taps **Sign with the trial key**; or copies the PSBT into Sparrow or Nunchuk, signs there and pastes it back. With SeedSigner (mainnet, and testnet from phase 2; animated QR not in the app yet, G-20), each council member, in any order, alone or together:
    1. inserts their own SD card into the SeedSigner and boots it;
    2. scans their SeedQR card and checks the fingerprint matches their line on the recovery sheet;
    3. loads the descriptor (from the recovery sheet QR) so the device can check the change;
    4. selects Scan PSBT and scans the round's animated QR from the app;
    5. checks every address in full and every amount on the device screen against the proposal page;
    6. signs and shows the signed QR back to the app.
4. **Send.** Once the threshold is reached, anyone can tap **Broadcast the transaction**, and council phones do it by themselves. Broadcasting again is harmless. If the browser cannot reach the chain API, the round page offers the signed transaction to paste into mempool.space's broadcast page.
5. **Receipt.** Once the transaction confirms, a council phone publishes the receipt and the proposals show as paid; the treasury's movements name the round.
6. **Decline.** A council member may refuse to sign, with a public reason. A round that never reaches three signatures can be replaced by a new round that spends at least one of the same coins, so the two can never both pay.

> **Gap G-13.** Signing-session logistics are not described: who calls the session, where, how council members who are away sign, and what happens if fewer than three can attend before payouts lapse.

### 6.5 Keeping the record

1. Every event is on the DAO relay and at least two public relays.
2. After every payout round, each council member exports the DAO's full event history (one button on the site; not in the app yet, G-20) and keeps the last two exports. Public relays may delete old events without notice, so the exports and the DAO relay are the long-term record. (Resolved G-14.)
3. Every closed vote is timestamped on Bitcoin.

### 6.6 Members leaving, lost phones, lost cards

- **Leaving:** from the profile page, at any time, with no vote. Open votes are withdrawn; closed votes and the pseudonym stay in the public record. Council members leave through a council change instead.
- **New phone:** a synced passkey brings the identity back with nothing to do. Otherwise, scan the identity card.
- **Lost passkey and no card:** key replacement. A council member re-verifies the member (two council members if remote), and three council members approve. Past votes stay valid.
- **Lost or exposed card:** print a new one and ask the council for a key replacement. A finder could vote as the member, but never move funds.

## 7. Changing the DAO

### 7.1 Rule changes

1. A member proposes a change-rules proposal naming each setting, its current value and the new one.
2. It needs two thirds of the votes and quorum.
3. After the final count, three council members approve the new settings version. Proposals already open keep the rules they started under.

### 7.2 Removing a member

A remove-member proposal needs two thirds. After the final count, three council members approve the new member list.

### 7.3 Changing the council

Used when a council member steps down, becomes unavailable, loses their seed, or the members want a different keyholder or threshold. Not in the app yet (G-20); it comes with phase 2.

1. The incoming council member is already a member. They hold the SD card and key ceremonies (section 3) and print their identity card.
2. A member proposes a change-council proposal: outgoing and incoming member, the incoming public key and fingerprint, the threshold, and the new treasury descriptor.
3. It needs two thirds of the votes and quorum.
4. After the final count, the council prepares a migration round that sends the whole balance, minus the fee, to the new treasury. Three members of the **current** council sign it.
5. Once it confirms, three council members approve the new settings: new council, threshold and descriptor. From then on payouts come from the new treasury.
6. Print and hand out the new recovery sheet; publish it in the repository.
7. Test the new treasury in Sparrow from the new sheet. Then the outgoing member destroys their SeedQR card and steel plate in front of another council member.
8. Archive the old recovery sheet; do not destroy it. Continuing council members' keys can still spend the old treasury, and the apps keep watching it: anything sent there later is moved across by a sweep round, signed by three continuing council members. (Resolved G-15.)

### 7.4 Replacing a member's key

See section 6.6. In person, one council member verifies and three approve; remotely, two council members verify on the call.

### 7.5 Moving to a new web address

Used if the domain is lost, seized or not renewed. The DAO listing it relies on is not in the app yet (G-20).

1. The maintainer puts the site up at the new address. The relay on the old domain goes down with it; the public relays still hold every event.
2. Three council members approve a new DAO listing naming the new address and relays.
3. The council announces the new address in person or on a call, and the btcdao.tech dashboard shows it if the DAO is listed.
4. Members open the new address, check it is the approved one, scan their identity card and create a new passkey. Same identity, same votes, no re-verification.
5. Members without a card go through key replacement.

### 7.6 Software updates

1. The maintainer announces each new version to members as a statement proposal, with what changes, before deploying it.
2. Releases are signed and built reproducibly (S2), so anyone can check that the published files match the code.
3. The app shows its version and build fingerprint on the Rules page; the DAO's listing records them, and the btcdao.tech dashboard flags listed DAOs running an outdated version or a build that does not match the signed release.

Funds stay safe whatever the software does, because council members check every payment on the SeedSigner screen. (Resolved G-16.)

## 8. The three stages: practice, testnet, mainnet

Every DAO is founded three times. Each stage is a separate DAO, with its own copy of the software, config, address, DAO id, treasury and member list. Nothing carries over by itself. The first two stages are disposable.

| | 1. Practice | 2. Testnet | 3. Mainnet |
| --- | --- | --- | --- |
| Purpose | Rehearse every step in one sitting | Run the real DAO with test coins | The DAO itself |
| Config `stage` | `practice` | `testnet` | `mainnet` |
| Network | testnet4 | testnet4 | mainnet |
| Voting period | about 10 minutes | the real rules (7 days in the reference rules) | the real rules |
| People | 3 to 5, the council-to-be | all founding members | all founding members again |
| Treasury keys | test keys on the phones | test keys, then SeedSigner (phase 2) | new seeds from a new key ceremony, SeedSigner |
| Name | UNO | UNO | chosen by the council |
| Charter (`config/charter.*.md`) | UNO's copy | UNO's copy | the template, filled in with the new name |
| Address | `bitcoin-dao.github.io/uno-practice` | `bitcoin-dao.github.io/uno-testnet` | the DAO's own domain |
| Repository | `uno-practice` | `uno-testnet` | created at mainnet time |
| Relay | the organisation's relay and public relays | the organisation's relay and public relays | its own, on the DAO's domain |
| Funding | about 50,000 test sats from the BTC DAO Testnet Treasury | about 500,000 test sats from the BTC DAO Testnet Treasury | real donations |
| Last step | close the DAO, coins back to the BTC DAO Testnet Treasury | close the DAO, coins back to the BTC DAO Testnet Treasury | — |
| Afterwards | thrown away | thrown away once mainnet runs | kept |

**Practice.** One sitting of about an hour: founder sign-up, setup and approvals, protecting keys and printing cards; funding from the BTC DAO Testnet Treasury; a proposal, a vote and its count after ten minutes; a new member joining; a lost key replaced; a card restored on another phone; a payout round, signed, broadcast and confirmed; and finally closing the DAO, which returns the coins to the BTC DAO Testnet Treasury. Anything that goes wrong is fixed before the testnet founding. Afterwards everyone deletes their practice passkey (the phone's password manager lists it as "… (prova generale)"), and the repository is archived. The practice banner on every page says it will be thrown away.

**Testnet.** The real founding meeting, with real rules and real members, on test coins from the BTC DAO Testnet Treasury. It runs for at least one full monthly round and the phase 1 and 2 gates: a payout from proposal to receipt run by five testers, hardware signing, and the treasury restored and spent in Sparrow without the website. Once the mainnet DAO is running, the testnet DAO is closed and its coins go back to the BTC DAO Testnet Treasury.

**Mainnet.**

1. Phase 2 must be passed on the testnet stage.
2. Council members create **new** mainnet seeds at a new key ceremony. Test seeds must never hold real funds.
3. The members confirm the funding model (`fundingModel`, see [funding models](funding-models.md)). The council then chooses the mainnet DAO's name, fills it and the funding model into a fresh copy of the charter template in `config/`, and registers the domain (G-03).
4. Hold a mainnet founding meeting (section 4) with the mainnet path, the DAO's own domain and its own relay.
5. Fund with real bitcoin up to the cap, and run three monthly rounds without developer help (phase 3's gate).

**Separate, tested builds.** Each stage runs a released version of btc-dao (a version tag), never work in progress. A version moves to the next stage only after it has passed the one before: the practice stage proves a version, the testnet stage may then take it, and mainnet may take only a version the testnet stage has run. Every build runs the protocol tests before it is published (`.github/workflows/pages.yml`), and every release passes the end-to-end runs in `app/e2e` first. A DAO's copy records which version it runs.

Every member of the trial DAO is listed as a founder at the mainnet founding meeting. They sign up afresh, because identities are separate per DAO, and the council verifies them by short code as at any founding meeting, so no one has to be voted in twice. Members print a new identity card for the mainnet DAO; trial cards only work on the trial DAO. (Resolved G-17.)

## 9. When something goes wrong

| Situation | What happens | What to do |
| --- | --- | --- |
| A member loses their phone | Nothing is lost | Synced passkey or identity card; otherwise key replacement |
| A member's card is lost or seen by someone | The finder could vote as them; funds are safe | Reprint and ask for key replacement |
| A council member loses their SeedQR card | The treasury still needs 3 of 5 | Make a new card from the steel plate; if the card may have been found, change the council |
| A council member loses their seed entirely | 4 keys remain | Change the council promptly (section 7.3) |
| Two council members are unavailable | 3 remain: exactly enough | Change the council now. One more loss would freeze the treasury |
| Three council keys are lost | The treasury cannot be spent by anyone | None. This is why losses must be replaced at once |
| The SeedSigner breaks | No keys are lost | Use the spare; any SeedSigner works with a member's own SD card and SeedQR card |
| The site goes down | Funds and record are safe | Re-host the static files at the same address |
| The DAO relay goes down | Events remain on public relays | Bring it back; council exports fill any gaps |
| The domain is lost | Passkey sign-in stops | Move to a new address (section 7.5) |
| A payment looks wrong on the SeedSigner | Nothing has been signed | Do not sign. Decline with the reason and tell the council |
| Three council members collude | They can move the funds outside the app | It shows publicly as a payment with no round. Members can replace the council, but the money cannot be recovered. The cap limits the loss |

A council member's seed belongs to the DAO and does not pass to their heirs. Each council member keeps a sealed note with their plate, without the seed, asking their family to contact the council; the council changes the key and has the plate and SeedQR card destroyed in front of a council member. Any absence of more than one round triggers a council change. (Resolved G-18, charter module [council handbook](charter-modules/council-handbook.md).)

## 10. Closing a DAO

A DAO is closed by a final proposal of type **Close the DAO**, decided by vote. (Resolved G-19.)

1. A member proposes closing. The proposal names the destination wallet that will receive the whole balance: another DAO's treasury, a cause the members choose, or any address the proposal names. Practice and testnet stages always close this way as their last step, with the BTC DAO Testnet Treasury as the destination; the app fills in its address ([testnet-treasury.md](testnet-treasury.md)).
2. The destination's owner confirms the address, as for a payout to someone else.
3. It needs two thirds of the votes and quorum.
4. After the final count, the next round pays the whole balance, minus the fee, to the destination, with no change. Three council members sign.
5. Once it confirms, three council members approve the final settings, marked closed. From then on no proposals, votes or rounds are accepted; the whole record stays readable.
6. Each council member keeps a final export, and the repository keeps the last recovery sheet, so the record stays checkable after the site goes offline.
7. The domain can then be allowed to lapse, and the council members destroy their SeedQR cards and plates.

## Gap register

| Gap | Area | What was missing | Needed before | Status |
| --- | --- | --- | --- | --- |
| G-01 | Preparation | Wallet guide; legal review of the drafted charter | First member joins | Partly resolved |
| G-02 | Governance | Council alone can meet quorum in a small DAO | Accepted; review if membership stays small | Accepted |
| G-03 | Preparation | The mainnet DAO's name (the council's choice), and who registers its domain and how it passes on | Mainnet founding | Open |
| G-04 | Preparation | Mainnet site host, and who pays for hosting | Mainnet | Partly resolved |
| G-05 | Legal | Custody, tax and liability position | Mainnet | Open |
| G-06 | Legal | Permanent public record versus the right to erasure | Mainnet | Open |
| G-07 | Treasury | Who keeps the shared SeedSigner and the spare | Founding meeting | Open |
| G-08 | Treasury | What happens when donations exceed the cap | Mainnet | Resolved |
| G-09 | Treasury | Unused donation addresses versus the wallet gap limit | Phase 1 | Resolved |
| G-10 | Treasury | Fixed fee cap versus fee spikes and many small coins | Phase 1 | Resolved |
| G-11 | Operations | No one assigned to publish counts, receipts and timestamps | Phase 1 | Resolved |
| G-12 | Protocol | Time zone of the round date | Phase 1 | Resolved |
| G-13 | Operations | Signing-session logistics | Phase 2 | Open |
| G-14 | Record | How often exports are made and where they are kept | Phase 1 | Resolved |
| G-15 | Treasury | Retiring old keys after a council change; coins sent to an old treasury | First council change | Resolved |
| G-16 | Software | Who approves updates and how members check the running version | Phase 1 | Resolved |
| G-17 | Membership | Carrying members from the trial to mainnet | Mainnet founding | Resolved |
| G-18 | Council | Death or long incapacity of a council member | Charter | Resolved in the council handbook module |
| G-19 | Governance | Winding up a DAO | Charter | Resolved |
| G-20 | Software | Parts of the design not in the app yet: OpenTimestamps anchoring, the event-history export, the DAO listing (moving address), council changes with migration and sweep rounds, SeedSigner signing by animated QR, signed reproducible releases | Phase 2, and mainnet for releases | Open |

Still open from the design and listed in [decisions.md](decisions.md): who sits on UNO's council and who the founders are; the mainnet DAO's name; the event kind numbers; and the phase 1 checks: passkey support on every member's phone (confirmed on the first Android phone tested), printing a card without a saved file, SeedSigner change verification, and OpenTimestamps from the browser. Votes are public by name (decided).
