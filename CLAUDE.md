# CLAUDE.md — ScopePay

Notes for any Claude session working in this repo. Read this first; keep it current.

## What this is
Milestone escrow on Arbitrum where nobody can sit on the money: the client locks the full budget (USDC or Paxos USDG)
up front, milestones pay on approval, and every "someone went quiet" case has a contract-enforced exit (review window,
missed deadline, 14-day arbiter window). Live: https://scopepay-arbitrum.vercel.app
Contract (Arbitrum Sepolia): `0xc54a0CD2aB480D8124161772db17899c33747c89` (see `deployments/arbitrum-sepolia.json`).
Sibling project: **MonadTrust** (ERC-8004 review audit on Monad), same author, separate repo (`dare0x/monadtrust`).

## About the builder
Dare Ayodeji: AI/data engineer and pharmacy student, based in Nigeria (the USDG faucet isn't available there, which is
why demo deals use USDC; keep that README note accurate). Prefers plain explanations. Strategy: ship several small,
finished hackathon projects rather than one.

## Stack and commands
Solidity 0.8.30 + OpenZeppelin 5.4, ethers 6.15, ganache for local chain tests. App is plain HTML/CSS/JS in `dist/`
(no build step). Node 18+.
- `npm install` — if `npm ci` is used, the lockfile has `ganache`'s bundled `fsevents` marked optional so Linux works
- `npm test` — 14 contract tests on a local chain (must pass before any push)
- `npm run check` — static checks (page wiring, 20 contract functions, USDC+USDG, phone layout, syntax)
- `npm run build:contract` — regenerates `dist/contract.json` from the deployment record
- `npm start` — http://localhost:4173
- `tools/` holds demo tooling (local chain with deals in every state, click-through walker, video recorder).

## Layout
`contracts/ScopePay.sol` (+ `mocks/` adversarial tokens), `test/scopepay.test.mjs`, `scripts/`, `dist/` (deployed
static site, served by Vercel per `vercel.json`), `deployments/`, `videos/scopepay-film/` demo film, `docs/archive/` v1 notes.

## Rules that must not drift
- Accepted tokens are fixed at deployment; deposits are measured by balance delta (fee-on-transfer safe).
- Every clock is fixed at signing; the freelancer always gets a full review window after each release.
- If `ScopePay.sol` changes: redeploy, update `deployments/`, rebuild `dist/contract.json`, re-run tests + check, update
  README addresses, and re-verify source on Sourcify.
- Testnet only, unaudited. Keep the "Limits, honestly" section true. Never commit private keys.

## Working agreements
- Develop on the branch the session names; commit small, descriptive messages; do not open PRs unless asked.
- `dist/` is deployed as-is: don't leave debug code in it.

## Open items / ideas
- (add here) hackathon deadlines, submission checklist, next features (arbiter reputation, mainnet path, audit).
