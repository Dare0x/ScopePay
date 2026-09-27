# ScopePay security model

ScopePay is a testnet prototype for milestone escrow. It is not audited and must not hold real funds.

## What the contract guarantees

- A deal escrows exactly the sum of its milestones, in one of the tokens fixed at deployment (Circle USDC, Paxos USDG).
  The deposit is measured by balance difference, so a fee-on-transfer token is refused.
- Only the freelancer submits deliveries, only the client approves, only the named arbiter resolves disputes, and
  milestones settle strictly in order.
- Every stall has an exit agreed at signing:
  - the freelancer can claim a submitted milestone once the client's review window has passed without approval or dispute;
  - the client can reclaim everything still in escrow once the current milestone is past due and undelivered
    (never earlier than one review window after the previous release);
  - either side can settle a dispute the arbiter hasn't decided within 14 days: a delivered milestone splits 50/50,
    an undelivered one is refunded, and later milestones return to the client.
- Every terminal path accounts for the whole deposit: it ends with the freelancer or back with the client.
- All payouts are protected by `ReentrancyGuard` and `SafeERC20`; deals are isolated by id.

## Trust assumptions

- The accepted tokens behave like standard ERC-20s (Circle USDC and Paxos USDG do). Rebasing or pausable-token behaviour
  is outside the model.
- Client, freelancer and arbiter are three different wallets that protect their keys; the arbiter is someone both sides accept.
- Terms, deliveries and dispute reasons stay available off-chain; the contract stores only their hashes.
- The Arbitrum chain and the RPC the app reads from report finalized state accurately.

## Known limitations

- No independent audit, formal verification or production load testing.
- The 50/50 split after an absent arbiter is a policy choice. It is visible before signing, but it isn't a judgement of the work.
- Identity is wallet-based. The work record proves payment and participation, not who someone is or how good the work was.
- Deadlines use block timestamps, which validators can shift by seconds; windows are hours to days long, so this doesn't matter in practice.

## Tests

`npm test` runs 14 tests on a local chain: validation, roles and ordering, full release, disputes and arbiter bounds,
cancellation, each timeout path including the late-approval grace rule, a fee-on-transfer token, a token that tries to
re-enter the escrow during a payout, and a randomized run of 70 actions checking after every step that the escrow holds
exactly what it owes.

## Reporting

Please don't test against other people's wallets or funds. Report a suspected issue privately to the maintainer
([@Dare0x](https://github.com/Dare0x)) before publishing details.
