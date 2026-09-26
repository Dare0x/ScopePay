---
workflow: product-launch-video
flow: automation
storyboard: no
message: "ScopePay makes internet work settle by milestone, evidence, and a verifiable on-chain receipt."
destination: youtube
aspect: 1920x1080
language: en
audience: "Arbitrum Open House judges and builders"
length: 90s
angle: proof-led product demo
narration: yes
voice: "ElevenLabs Matilda"
---

## Intent

Create a judge-facing product demo for ScopePay. Show the working Arbitrum Sepolia escrow flow quickly and clearly: scope is funded, evidence is submitted, payment is released, disputes freeze funds, and the named arbiter settles the current milestone. The tone is calm, exact, and cinematic enough to feel intentional without hiding the product behind generic AI visuals.

## Assets

- `https://scopepay-escrow.daretapioca.chatgpt.site/?deal=0` — live completed deal and primary product surface.
- `assets/scopepay-live-full-page.png` — captured live product page for the opening and closing compositions.
- `assets/scopepay-terminal-preview.png` — proof-terminal reference for the visual language and settlement overview.
- `assets/scopepay-terminal-mobile.png` — responsive product reference for an optional evidence cutaway.
- `https://sepolia.arbiscan.io/address/0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af` — deployed contract proof.

## Customizations

- Use the real ScopePay screens and real Arbitrum Sepolia transaction links.
- Use separate narration clips for each scene with ElevenLabs Matilda when the authorized audio file is available.
- Add subtle confirmation tones and a quiet music bed; narration remains dominant.
- Use readable captions for `Fund → Submit → Approve → Settle` and `Dispute frozen → Arbiter split → Receipt retained`.
- Avoid fake balances, invented dashboards, generic blockchain b-roll, wallet secrets, and claims beyond the deployed v1 contract.

## Notes

- The run is autonomous because the user asked the agent to execute the full production.
- Render a first visual proof before the final MP4 and keep a contact sheet for review.
- The timeout upgrade is separate engineering work and must not be implied in this video.
