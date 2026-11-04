# Fork tasks

This repo counts as released only when every item below is done, the code is field-tested by the first DAO (UNO, then its mainnet successor), and the licence has been added (last step).

## Code and protocol
- [ ] `docs/protocol.md`: every event format as exact JSON, with kind numbers and versioning
- [ ] Config schema, validated on load; no secrets in the config
- [ ] State rules written down, with test cases for edge cases (requirement S4)
- [ ] Code and config kept apart, so forks can merge upstream fixes cleanly
- [ ] Bundled, pinned dependencies; no third-party scripts at runtime (S2)
- [ ] Signed releases with published hashes; reproducible build (S2)

## Security gates
- [ ] S1 to S6 met and tested on testnet4 (phase 1)
- [ ] S7: change verified against the loaded descriptor on SeedSigner (phase 2, hard gate)
- [ ] Independent code review before mainnet funds
- [ ] S8 and S9 in place for the first mainnet DAO

## Field test
- [ ] UNO restores and spends its testnet4 treasury in Sparrow without the website
- [ ] The first mainnet DAO completes three monthly rounds without developer help

## Fork kit
- [ ] Three-stage template: practice, testnet and mainnet configs from one set of answers (practice with short votes)
- [ ] Release tags; a DAO's copy pins a version, and a version is promoted to the next stage only after passing the previous one
- [ ] End-to-end runs in CI on every release
- [ ] Setup wizard produces the config and the recovery sheet
- [ ] Template repo and one-click deploy to free static hosting
- [ ] Dashboard listing via `dao.listing`
- [ ] A second group deploys its own DAO from the kit and runs one testnet4 round

## Last
- [ ] Licence chosen and added
