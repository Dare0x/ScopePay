# ScopePay

ScopePay is a working USDC milestone escrow and portable work-proof product for independent work. A client deposits Circle testnet USDC, a freelancer submits work, and each payment is released only after approval. A named arbiter can resolve a frozen deal, while settled payments become a public work record the freelancer can carry to the next client.

Built by Dare Ayodeji with AI-assisted development tools.

The interface includes a guided flow and a live Arbitrum Sepolia mode that can deploy or connect to the contract, create funded deals, submit evidence commitments, release milestones, open disputes, resolve them, and link every event to the explorer. A portable proof link carries readable terms and selectively shared evidence; the app hashes that material and verifies it against the commitments stored onchain before displaying it as verified.

## Portable work proof

Every live deal exposes a shareable worker record. ScopePay finds that wallet's deals from the contract's `DealCreated` events, reconstructs released and dispute-awarded payments from Arbitrum, and shows verified earnings, paid milestones, client deals, and direct links to each settlement. The page works without a connected wallet and can be shared through a `?worker=0x…&contract=0x…` URL.

This record proves settlement, wallet participation, and payment on this ScopePay contract. It deliberately does not claim legal identity or assess the quality of delivered work. ScopePay also exposes the same record through a read-only WebMCP tool for compatible agents.

The canonical Arbitrum Sepolia deployment is [`0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af`](https://sepolia.arbiscan.io/address/0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af). The browser app verifies its bytecode-facing interface and confirms that its payment token is Circle test USDC before enabling transactions.

The first live escrow is [deal #0](https://scopepay-escrow.daretapioca.chatgpt.site/?deal=0), funded with 4 test USDC in this [`createDeal` transaction](https://sepolia.arbiscan.io/tx/0x02c3bbcf52e039c50bc9409d0611dddf0b3c738f3dec27ae8fb68703b312654b). It is the featured deal loaded for new visitors.

The Worker submitted the first evidence commitment [onchain](https://sepolia.arbiscan.io/tx/0xaf423d7a04beae00a2621df4f581ead264a7d08df7d4714526edccfe188edd2d) and the Client released the first 1 USDC milestone in this [payment transaction](https://sepolia.arbiscan.io/tx/0xb88333ec74fedffc2ec45617f5d267baa8431d0e3d602ceb1243f3147eedd541). The interface handles wallet-account changes without reloading and polls the featured deal for onchain updates every 12 seconds.

For the dispute path, the Client [froze milestone 2](https://sepolia.arbiscan.io/tx/0x61e4d02cbac3e1db0ac194b8ca2f91cb4151b9f25e0e8cd2f77fdc214bfe163a), then the Arbiter [resolved it](https://sepolia.arbiscan.io/tx/0x3e256c9778e5078962bac6ce28770791686bda871132bf0ce0262ccb1df0ed56): 1 USDC went to the Worker and 2 USDC returned to the Client, including the cancelled final milestone.

## Local use

```powershell
npm install --cache .npm-cache
npm test
npm run build:contract
npm run check
npm start
```

Open `http://localhost:4173`.

## Contract flow

1. Client creates a deal and deposits the exact sum of its milestones.
2. Freelancer submits evidence for the current milestone.
3. Client releases that milestone or either party opens a dispute.
4. The named arbiter can split the current milestone; all unearned future funds return to the client.

The contract uses Circle's official Arbitrum Sepolia test USDC address. Test tokens have no financial value. Production needs review windows, emergency procedures, an independent security audit, a carefully designed arbiter policy, and a separate production deployment.

## Arbitrum submission work remaining

- Broaden the contract security tests, add a timeout path, and verify the deployed source publicly.
- Validate the product language with freelancers and clients.
- Publish the demo and repository for public access, complete the HackQuest project profile, and prepare the final submission package and video.

See [HACKATHON_RULES_AND_SUBMISSION_PLAN.md](./HACKATHON_RULES_AND_SUBMISSION_PLAN.md) for the dated rules audit, readiness matrix, and unresolved organizer questions.
