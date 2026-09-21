# ScopePay security model

ScopePay is a testnet prototype for milestone escrow. It is not audited and must not hold production funds.

## Protected properties

- A deal escrows exactly the sum of its milestones.
- Only the assigned worker can submit evidence for the current milestone.
- Only the client can approve and release a submitted milestone.
- A dispute blocks normal submission and approval.
- Only the named arbiter can settle a dispute.
- An arbiter cannot award more than the disputed milestone.
- Every terminal path accounts for the entire deposit: released to the worker or refunded to the client.
- Deal state is isolated by deal ID.

## Trust assumptions

- The payment token follows the ERC-20 transfer contract expected by OpenZeppelin `SafeERC20`.
- The client, worker, and arbiter control distinct wallets and protect their keys.
- The arbiter is available and evaluates off-chain evidence fairly.
- Terms and evidence remain available off-chain; the contract stores only commitments.
- The Arbitrum chain and selected RPC accurately expose finalized state.

## Known limitations

- The deployed v1 contract has no timeout if a client or arbiter disappears. A v2 deployment must add review and dispute deadlines with safe fallback settlement.
- Identity is wallet-based. ScopePay proves payment and participation, not a person's legal identity or work quality.
- Evidence privacy and availability depend on the parties' chosen storage and sharing method.
- The contract has not received an independent audit, formal verification, or production load testing.
- Fee-on-transfer, rebasing, callback-enabled, or otherwise non-standard tokens are outside the supported model.

## Test coverage

The automated suite covers input validation, party authorization, ordered milestone progression, full release, dispute freezing, arbiter settlement bounds, cancellation rules, deal isolation, and conservation of deposited funds across terminal states.

## Responsible disclosure

Do not test against other people's wallets or funds. Report a suspected issue privately to the project maintainer before publishing exploit details.
