# Funding models

Bitcoin is the money. The DAO coordinates and funds. This document is about the third part: where the funds come from, and whether they keep coming.

Most DAOs so far have worked like a charity: a pot of money paid out to projects. When the pot ran dry, or the payments to projects stopped, the DAO stopped too. A Bitcoin DAO cannot issue tokens to refill its pot, so every sat it spends has to come from somewhere real. Each btc-dao DAO therefore chooses, before it drafts its mainnet charter, how it intends to keep going.

**Read this before drafting the mainnet charter, and discuss it at a members' meeting.** The choice is recorded in the settings (`rules.fundingModel`) and named in Article 1 of the charter. Most DAOs will mix models; choose the **primary** one, the one that keeps the DAO alive.

## The four models

| Model | Setting | Money comes from | Lasts as long as |
| --- | --- | --- | --- |
| Grant | `grant` | Donations, paid out to projects | Donors keep giving |
| Production | `production` | Something the DAO owns or does: mining, sales, services | The asset or activity keeps producing |
| Mutual | `mutual` | Members' own regular contributions: dues, or rotating rounds | Members keep taking part |
| Revolving | `revolving` | Funds advanced to projects, paid back or shared from their income | Projects repay |

### Grant

The DAO collects donations and pays them out to projects its members choose. This is the familiar model, and a good one for a defined goal with a clear end: a fund for one event, one building, one season.

- **How it lasts:** only while donors give. Spending without new donations empties it.
- **Typical failure:** the first enthusiasm funds a burst of projects; donations slow, the pot empties, and members drift away.
- **If you choose it:** say so plainly. On the dashboard, a grant DAO's steady I/O (below) will usually sit near 0, which is honest: it lives on gifts, and donors and members can see that. Consider a spending rule in your settings or charter, for example never spending more than a set share of the treasury each quarter.

### Production

The DAO owns or runs something that earns bitcoin, and the earnings come back to the treasury: mining hardware paying straight to the treasury address, sales of goods or tickets, a service members or customers pay for.

- **How it lasts:** the treasury refills from the activity itself, without depending on goodwill.
- **Typical failure:** the asset stops earning (hardware ages, energy costs rise, nobody buys), or the work of running it falls on one or two people.
- **If you choose it:** fund the producing asset first, and name who looks after it. Make payments into the treasury go straight to its address, so income is visible and reconciled like everything else.

### Mutual

Members fund the DAO themselves, regularly. Either everyone pays dues into the treasury, or the DAO runs rounds in which every member pays the same amount and one member in turn receives the whole round (a rotating savings group, known in many countries under different names). btc-dao's monthly payout rounds fit this naturally.

- **How it lasts:** as long as members keep paying in. A rotating group never runs dry because it is a schedule, not a pot.
- **Typical failure:** members stop paying, especially after they have received their turn.
- **If you choose it:** fix the amount and the timing in the charter, keep the group small enough that members know each other, and decide in advance what happens when someone misses a payment.

### Revolving

The DAO advances funds to projects, and the projects pay back, in full or as a share of what they earn. The same money then funds the next project.

- **How it lasts:** as long as projects repay. Repaid funds go round again.
- **Typical failure:** projects fail or do not repay. A DAO without a legal form cannot enforce repayment; it can only record it publicly.
- **If you choose it:** keep it local and face to face, where reputation counts. State in each proposal what comes back and when, and reword the use-of-funds module, which forbids loans by default.

## Questions for the members' meeting

1. Where will the next sat come from after the first donations are spent?
2. Who does the work that keeps money coming in, and what happens if they stop?
3. If no new money arrived at all, how long would the treasury last at the spending you plan?
4. Is the DAO meant to last indefinitely, or to reach one goal and close?
5. Which model is primary, and which others will you mix in?

## Recording the choice

- **Settings:** `rules.fundingModel` is one of `grant`, `production`, `mutual`, `revolving`. It is set at founding and changed by a rules vote, like any other rule.
- **Charter:** Article 1 names the model in a sentence.
- **Dashboard:** each listed DAO shows its model as a label and a colour ("not stated" if unset), and beside it its **steady I/O**: median monthly inflow divided by median monthly outflow over the last 12 complete months. Above 1, regular income covers regular spending; below 1, the DAO draws on reserves or occasional gifts. A one-off donation does not move it. It is how members and donors see whether the chosen model is working. Defined in [`dashboard-spec.md`](dashboard-spec.md), section 2a.
