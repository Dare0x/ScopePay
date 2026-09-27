# ScopePay

**Milestone escrow on Arbitrum where nobody can sit on the money.**
The client locks the whole budget in USDC or USDG before work starts. Each milestone pays out when it's approved.
If anyone goes quiet (the client, the freelancer, or even the arbiter), a deadline agreed at signing settles it instead of an argument.

| | |
|---|---|
| Live app | https://scopepay-arbitrum.vercel.app |
| Demo video | [`videos/scopepay-film/renders/scopepay-demo.mp4`](videos/scopepay-film/renders/scopepay-demo.mp4) |
| Contract (Arbitrum Sepolia) | [`0xc54a0CD2aB480D8124161772db17899c33747c89`](https://sepolia.arbiscan.io/address/0xc54a0CD2aB480D8124161772db17899c33747c89) |
| Verified source | [Sourcify, exact match](https://repo.sourcify.dev/421614/0xc54a0CD2aB480D8124161772db17899c33747c89) |
| Payment tokens | Circle test USDC [`0x75fa…AA4d`](https://sepolia.arbiscan.io/token/0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d) and Paxos test USDG [`0xFFC9…1892`](https://sepolia.arbiscan.io/token/0xFFC95faa3d63Cde504a05B567C600B78C0b41892) |

## The problem

Internet work breaks in both directions. A freelancer delivers and the client goes quiet, so the money never comes.
Or the client pays up front and the freelancer disappears. Platforms solve this by holding the money themselves, taking
10–20% and deciding disputes behind closed doors, and freelancers in places like Nigeria often struggle to receive
international payments at all.

Plain escrow only moves the problem: the money is safe, but it can still be stuck forever if one side, or the escrow
agent, stops responding.

## How ScopePay works

1. **Fund.** The client names the work, the freelancer and an arbiter, splits the budget into milestones with due
   dates, and picks USDC or USDG and a review window. One transaction locks the whole amount in the contract.
2. **Deliver.** The freelancer submits a link or note. Only its hash goes on-chain, so the work stays private but provable.
3. **Get paid.** The client approves and that milestone pays out in the same transaction.

**Nobody can stall.** Every way of going quiet has an exit, and each one is a contract function anyone can check:

| Who goes quiet | What happens | Function |
|---|---|---|
| The client, after a delivery | When the review window closes, the freelancer claims the milestone | `claimAfterReviewWindow` |
| The freelancer, past a due date | The client takes back everything still in escrow | `reclaimAfterMissedDeadline` |
| The arbiter, during a dispute | After 14 days either side can settle: delivered work splits 50/50, undelivered work is refunded | `settleAfterArbiterWindow` |

Disputes freeze the deal until the named arbiter splits the current milestone (`resolveDispute`); everything after it
goes back to the client. A client can also cancel for a full refund until the first delivery (`cancelUnstarted`).

## See every outcome live

Each of these is a real deal on the contract above, created and settled by the demo wallets on Arbitrum Sepolia:

| Deal | What it shows |
|---|---|
| [#0 Checkout flow for a Lagos food store](https://scopepay-arbitrum.vercel.app/?deal=0) | Three milestones delivered and approved: the happy path |
| [#1 Brand video for a fintech launch](https://scopepay-arbitrum.vercel.app/?deal=1) | Client disputes milestone 2; the arbiter awards 1.25 of 2.00 USDC ([resolution tx](https://sepolia.arbiscan.io/tx/0x821e57da64e26635bf6158e8ac27124a708a382a75f843775c7f386d4d1d5d34)) |
| [#2 Podcast edit, episodes 4 to 6](https://scopepay-arbitrum.vercel.app/?deal=2) | Client never reviewed; the freelancer claimed after the 1-hour review window |
| [#3 Logo refresh for a bakery](https://scopepay-arbitrum.vercel.app/?deal=3) | Freelancer missed the due date; the client reclaimed the rest |
| [#4 Patient dashboard for a clinic](https://scopepay-arbitrum.vercel.app/?deal=4) | Frozen by the freelancer; the 14-day arbiter clock is running |
| [#6 Landing page for a coffee brand](https://scopepay-arbitrum.vercel.app/?deal=6) | The deal funded, delivered and paid on camera in the demo video ([fund](https://sepolia.arbiscan.io/tx/0x61f8c3eb7479b2c0b21af77f850fa714fdb68a2b40bcc3d47895761bd7bc4b79), [deliver](https://sepolia.arbiscan.io/tx/0x4f8e8cf442fcb410ab82ccda7d87ea79f7b3256292140a2e428cd30a9df0c4d1), [pay](https://sepolia.arbiscan.io/tx/0x63557ab86dcd841e3ac87f10cd8137a77dc151db3bf91b8080f25bea90534ce2)) |

All of these deals are paid in test USDC. Paxos's USDG testnet faucet isn't available in Nigeria, where ScopePay is
built, so the demo wallets couldn't get test USDG; the contract and the app accept USDG in exactly the same way (the
token is chosen per deal at creation, and the test suite runs every path with two tokens).

Anyone can read these without a wallet. To start your own deal, connect a wallet on Arbitrum Sepolia and get test USDC
from [faucet.circle.com](https://faucet.circle.com) or test USDG from [faucet.paxos.com](https://faucet.paxos.com).

## A work record that travels

Every payment becomes part of the freelancer's record, rebuilt only from the contract's events:
`https://scopepay-arbitrum.vercel.app/?worker=0x…` shows what they were paid, for how many milestones, how each deal
ended, and links to every settlement. It proves payment and participation, not identity or the quality of the work.

## Proof without publishing the work

Terms and deliveries stay off-chain; the contract stores their hashes. A **share proof** link carries the readable terms
and delivery notes, and the app hashes them in the browser and checks them against the chain before showing them as
verified. Nothing is trusted just because the app says so.

## The contract

[`contracts/ScopePay.sol`](contracts/ScopePay.sol), Solidity 0.8.30, OpenZeppelin `SafeERC20` and `ReentrancyGuard`.

- **Accepted tokens are fixed at deployment** (Circle USDC and Paxos USDG here). A deal records its token.
- **Deposits are measured, not trusted**: the contract checks its balance before and after pulling funds, so a
  fee-on-transfer token can't leave a deal underfunded.
- **Every clock is known at signing**: due dates per milestone, a per-deal review window (1 hour to 30 days), and a fixed
  14-day arbiter window. A late approval can't be used to run out the next deadline: the freelancer always gets at least
  one review window after each release (`missedDeadlineAt`).
- Custom errors (`TooEarly`, `Unauthorized`, `InvalidState`, …), an event for every state change, and read helpers
  (`getDeal`, `getMilestones`, `supportedTokens`) the app uses directly.

**Tests** (`npm test`, 14 passing) cover roles and ordering, every timeout path, dispute bounds, cancellation,
conservation of funds, a fee-on-transfer token, a token that tries to re-enter the escrow during a payout, and 70 random
actions across several deals and both tokens, checking after every step that the escrow holds exactly what it owes.

## Built during the buildathon

ScopePay v1 existed before the event: a USDC-only escrow ([`0xcD7C…51af`](https://sepolia.arbiscan.io/address/0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af))
whose due dates were stored but never enforced, so money could be stuck forever. New in v2, during the buildathon:

- the three timeout paths, the fee-on-transfer guard, the token allowlist with **Paxos USDG** support, and the new views;
- the rewritten test suite (6 → 14 tests, including the adversarial tokens and the randomized conservation test);
- the rebuilt web app: the all-deals table, a next-step panel per role with live countdowns, the live transaction panel,
  correct split accounting, and recovery from dropped RPC connections;
- source verification on Sourcify, the public demo deals, and the demo video.

## Run it yourself

```bash
npm install
npm test                  # contract tests on a local chain
npm run build:contract    # writes dist/contract.json from the deployment record
npm run check             # static checks on the app
npm start                 # http://localhost:4173
```

The app is plain HTML, CSS and JavaScript in `dist/` with ethers.js; there is no build step. `tools/` holds the
scripts used for the demo: a local test chain with deals in every state (`local-chain.mjs`), a full click-through of
every flow as each role (`walk.mjs`), and the recorder for the video (`record.mjs`).

## Limits, honestly

- Testnet only and not audited. Don't put real money in it.
- The arbiter is a wallet both sides agree on; there's no arbiter marketplace or reputation for arbiters yet.
- The 50/50 fallback when an arbiter disappears is a policy choice, written into the contract so both sides know it before signing.
- Deliveries and terms live wherever the parties keep them; ScopePay proves what was agreed and delivered, not where the files are.

Built by Dare Ayodeji with AI-assisted development tools. Security notes: [SECURITY.md](SECURITY.md).
