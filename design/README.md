# Design

The clickable mock-up of a DAO, with UNO as the sample, in Italian. All names, amounts, dates and addresses are sample data; addresses are placeholder test-network (tb1) strings.

- `mockups/`: source files, one Design Component page (`.dc.html`) per screen, plus `canvas.json` with each screen's size.
- `screens/`: a PNG of each screen in its default state, rendered from the source.
- `diagrams/`: the two diagrams from the spec.

To regenerate the PNGs after changing a screen, see `tools/render-mockups/`.

## Member journey

| Join or sign in | Home and treasury | Proposals |
| --- | --- | --- |
| ![Join](screens/Join.png) | ![Home](screens/Main.png) | ![Proposals](screens/Proposals.png) |

| Proposal and archive | New proposal | Recipient confirmation |
| --- | --- | --- |
| ![Proposal detail](screens/ProposalDetail.png) | ![New proposal](screens/NewProposal.png) | ![Confirm](screens/Confirm.png) |

| Propose a new member | Profile, identity card and leaving | Restore from your identity card |
| --- | --- | --- |
| ![Sponsor a member](screens/SponsorMember.png) | ![Profile](screens/Profile.png) | ![Restore](screens/Restore.png) |

## Council

| Council inbox | Prepare a round | Sign a round |
| --- | --- | --- |
| ![Council inbox](screens/CouncilInbox.png) | ![Prepare round](screens/PrepareRound.png) | ![Signing](screens/Signing.png) |

| Replace a member's key |
| --- |
| ![Replace key](screens/ReplaceKey.png) |

## Founding

| Founder sign-up | Prepare the founding (council) |
| --- | --- |
| ![Founder sign-up](screens/FounderSignup.png) | ![Setup](screens/Setup.png) |

## Public reference

| Members | Rules |
| --- | --- |
| ![Members](screens/Members.png) | ![Rules](screens/Rules.png) |

**Recovery sheet** (printable A4)

![Recovery sheet](screens/RecoverySheet.png)

**Identity card** (printable A4: one card each, members and council)

![Identity cards](screens/IdentityCards.png)

## Diagrams

![Architecture](diagrams/architecture.png)

![Payout round](diagrams/payout-round.png)
