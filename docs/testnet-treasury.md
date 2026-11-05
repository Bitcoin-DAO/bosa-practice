# BTC DAO Testnet Treasury

The **BTC DAO Testnet Treasury** is the Bitcoin-DAO organisation's own testnet4 wallet. It holds the test coins that every DAO's practice and testnet stages run on. Each disposable stage borrows coins from it at the start and returns everything it has left at the end, so the same coins serve one DAO after another and nobody has to keep finding new ones.

Test coins have no value. The wallet exists so that the trials behave like the real thing (a treasury that starts empty, gets funded, pays out and is closed) without anyone hunting for faucet coins in the middle of a meeting.

## The wallet

| | |
| --- | --- |
| Name | BTC DAO Testnet Treasury |
| Network | testnet4 |
| Held by | the maintainer, for the Bitcoin-DAO organisation |
| Wallet | single signature (P2SH address), in Mycelium Testnet |
| Return address | `2N5SK7BFXGzefmMs9AHui2Y71fUh3uVVn2S` |

The return address is also in each disposable stage's `config/dao.json` as `testnetTreasury`, so the app fills it in when someone proposes closing the DAO. Reusing one address for returns is fine on testnet4; on mainnet it would not be.

When the wallet runs low, top it up from a testnet4 faucet, and note the top-up below.

## Funding a stage

Do this straight after the founding meeting, once the DAO is founded and the treasury page shows a donation address.

1. Open the DAO's site and copy the donation address from the treasury page (or scan its QR code).
2. From the BTC DAO Testnet Treasury wallet, send:
   - **practice:** about 50,000 sats, enough for a few small payouts and their fees;
   - **testnet:** about 500,000 sats, below the trial cap of 5,000,000, enough for several monthly rounds.
3. Wait for the payment to appear on the treasury page. Testnet4 blocks can be slow or come in bursts.
4. Add a line to the log below.

## Returning the coins: the last step of every disposable stage

A practice or testnet stage ends by closing the DAO, which sends the whole balance back to the BTC DAO Testnet Treasury. It uses the normal closing process (guide section 10), so the last thing each stage tests is the end of a DAO's life.

1. A member opens **New proposal → Closing the DAO**. The app fills in the BTC DAO Testnet Treasury's return address.
2. The wallet holder confirms the address: either they propose it themselves and tick "I am the recipient", or they open the confirmation link the proposer sends them.
3. Members vote. Closing needs a two-thirds majority and quorum; in the practice stage the vote lasts about ten minutes.
4. After the final count, a council member opens **Council → Prepare the payout round**. The round sends everything, minus the fee, to the return address, with no change. Council members sign until the threshold is reached, and the transaction is broadcast.
5. Once it confirms, the council approves the final settings (**Council → Rules**), which mark the DAO closed. The site stays readable; nothing new can be proposed.
6. Check the coins arrived in the BTC DAO Testnet Treasury wallet, and add a line to the log.
7. Clean up: everyone deletes the stage's passkey from their phone, and the stage's repository is archived.

## Log

| Date | Stage | Out (sats) | Back (sats) | Note |
| --- | --- | --- | --- | --- |
| 2026-11-05 | — | | | Top-up: 100,000 sats from the maintainer's own testnet4 wallet into the new treasury wallet (`2N5SK…Vn2S`) |
