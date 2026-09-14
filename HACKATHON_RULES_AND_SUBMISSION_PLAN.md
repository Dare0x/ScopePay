# ScopePay: Arbitrum Open House Singapore readiness audit

Audit date: 14 September 2026

## Decision

Submit **one ScopePay project** to the Arbitrum Open House Singapore Online Buildathon. Position it for the **Overall Prize** and **Promising Products Track**, and allow the Arbitrum Foundation to consider it for a discretionary grant if the submission form permits this.

Do not create duplicate ScopePay entries for the same event. HackQuest's general submission guidance says multiple independent projects may be submitted, but the same project must not be submitted repeatedly with minor changes. The event-specific page does not state a numerical submission limit or explain whether one entry is automatically considered for multiple prize categories. Confirm that behavior in the signed-in form or with the organizer before final submission.

## What is officially confirmed

| Item | Confirmed rule or fact | ScopePay status |
|---|---|---|
| Organizer | Arbitrum Foundation | Aligned |
| Format | Online buildathon | Aligned |
| Registration | 29 July–2 October 2026, according to the event page | Registered |
| Submission | 13 September–4 October 2026, according to the event page | Not submitted |
| Existing work | Existing projects are permitted | Aligned |
| Technical qualification | The project must be deployed on an Arbitrum chain; Arbitrum Sepolia is an explicit example | Pass |
| Accepted implementation | Solidity or Rust/Stylus | Pass: Solidity |
| Judging | Smart-contract quality, product-market fit, innovation and creativity, and real problem solving | Partial; see gaps below |
| Prize pool | 70,000 USDC overall, 15,000 USDC Promising Products, up to 30,000 USDC discretionary grants | Eligible in principle; no prize is guaranteed |
| Reserved placements | At least one of the three overall placements is reserved for an Arbitrum project and at least one for a Robinhood Chain project | ScopePay is an Arbitrum project |
| Payout conditions | Prizes are tied to development milestones; grants are discretionary and may not be awarded | Acknowledge in planning |

Official event page: https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon

Official registration landing page: https://arbitrum-singapore.hackquest.io/

Official Arbitrum announcement: https://blog.arbitrum.foundation/builders-block-023-415k-in-prizes-at-open-house-singapore-apply-now/

HackQuest's general submission guidance: https://www.hackquest.io/blog/Best-Practices-for-Successful-Web3-Hackathon-Project-Submissions

## What is not confirmed yet

The public event page does not state all of the following:

- maximum team size or whether a solo entrant needs to add teammates;
- the maximum number of project submissions per entrant or team;
- whether one submission may select both Overall and Promising Products;
- age, nationality, residency, sanctions, or other prize-eligibility restrictions;
- whether a public GitHub repository is mandatory;
- exact demo-video requirements or maximum duration;
- whether contract-source verification is mandatory;
- whether Founder House travel is funded or attendance is required for winners;
- how much new work must be completed during the buildathon;
- whether AI-assisted development must be disclosed.

The page links a Singapore Buildathon terms PDF, but the host currently returns a security checkpoint to automated readers. This audit must remain marked **provisional** until that document is readable or the organizer answers the unresolved questions.

## Registration status

The entrant completed Buildathon registration and created the ScopePay project draft in HackQuest. The project remains incomplete and has not been finally submitted. The in-person Founder House has a separate application; it is not required to enter the online Buildathon, and Buildathon winners receive a guaranteed Founder House place according to the official Luma listing.

## ScopePay compliance and judge-readiness

### Already strong

- A functional Solidity contract is deployed on Arbitrum Sepolia at `0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af`.
- The contract escrows Circle test USDC and supports funded milestones, worker evidence commitments, client release, dispute freezing, arbiter settlement, and cancellation of an unstarted deal.
- The frontend reads contract state and events, connects role wallets, supports contract transactions, and links to the explorer.
- A complete public testnet transaction story exists for deal `0`: funding, evidence commitment, release, dispute, and settlement.
- A judge landing section explains the product, links to the live deal, and exposes the on-chain activity path.
- Portable proof links verify readable terms and selectively disclosed evidence against their on-chain commitments.
- A shareable worker record reconstructs paid milestones and earnings from contract events without trusting ScopePay or connecting a wallet.
- SafeERC20 and ReentrancyGuard are used, and the existing static checks pass.

### Blocking or high-priority gaps

| Priority | Gap | Why judges care | Required fix |
|---|---|---|---|
| P0 | The live Site is still owner-only | Judges need a link that opens without the owner's account | Change the Site audience to public before submission |
| P1 | Contract source is not matched on Sourcify | Reviewers cannot easily inspect deployed source | Publish the repository and verify the exact deployment on a public source-verification service/explorer |
| P1 | Security coverage is narrow | Smart-contract quality is an explicit criterion | Add lifecycle, authorization, invariant, reentrancy/token-edge, timeout, and failure-path tests; document known limitations |
| P1 | Liveness depends on the named arbiter | Funds can remain stuck if the arbiter disappears | Add explicit deadlines and a safe timeout/refund path in a v2 contract |
| P2 | Product-market evidence is missing | Product-market fit and real problem solving are explicit criteria | Interview at least five freelancers/clients and record the strongest findings and design changes |
| P2 | Final submission material is incomplete | Judges need reproducible proof | Add the architecture diagram, screenshots, buildathon change log, and final short demo to the existing public README and links |

## The product story judges should understand in 30 seconds

**ScopePay is a milestone escrow and verifiable work-history layer for internet work. A client funds USDC once, a worker proves each delivery, and payment releases only when that milestone is accepted. If they disagree, the deal freezes and a named arbiter settles it onchain. Every completed milestone becomes portable proof that the worker delivered and was paid.**

The Arbitrum-specific value is low-cost, transparent USDC settlement with a complete, independently verifiable history of approvals, disputes, and payouts.

## Product-first sequence

1. **Contract v2 quality:** add liveness deadlines, broader tests, documented threat model, and public source verification.
2. **Validation:** test the complete flow with fresh wallets and collect five short user interviews.
3. **Submission package:** finish the architecture diagram, screenshots, buildathon change log, project narrative, and track selections.
4. **Demo:** record the short final video only after the product and judge path are stable.

## Submission package checklist

- HackQuest registration accepted
- ScopePay project created once in the event
- correct prize category selections confirmed in the signed-in form
- public live URL
- public GitHub repository and useful README
- Arbitrum Sepolia contract address and explorer URL
- verified contract source
- funding, milestone release, dispute, and resolution transaction links
- architecture diagram
- security assumptions and test results
- 30-word description and longer project narrative
- founder/team information
- demo video if the final form requires or permits it
- disclosure of existing code and a clear buildathon change log
- submission completed at least 24 hours before the displayed deadline

## Questions to resolve with the organizer

1. Can one entrant or team submit more than one independent project?
2. Is a single project automatically considered for Overall, Promising Products, and discretionary grants, or must tracks be selected separately?
3. Are solo builders allowed, and what is the maximum team size?
4. Are residents of Nigeria eligible to compete and receive USDC prizes?
5. Which repository, live-demo, contract-verification, and video fields are mandatory?
6. Is testnet deployment sufficient through final judging?
7. Must the submission identify all code created before 14 September and all new work completed during the event?
8. Are AI coding tools allowed without restriction, or is disclosure required?
9. Is Founder House attendance required for top teams, and are flights or accommodation covered?

## Internal deadlines

The event page displays registration closing on 2 October and submissions closing on 4 October, but the public crawl does not expose the timezone. Use conservative internal deadlines:

- registration: **as soon as possible**;
- product freeze: **30 September**;
- final materials: **2 October**;
- submit: **3 October, before noon WAT**.

Do not wait for the official last minute.
