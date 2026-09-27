---
workflow: product-launch-video
flow: automation
storyboard: no
message: "ScopePay is milestone escrow on Arbitrum where nobody can sit on the money: the client funds first, every milestone pays on approval, and a deadline settles it when anyone goes quiet."
destination: youtube
aspect: 1920x1080
language: en
audience: "Arbitrum Open House Singapore Buildathon judges: Arbitrum team, founders and engineers judging smart-contract quality, product-market fit, innovation and real problem solving"
length: 110s
angle: show-the-product
narration: yes
---

## Intent

The demo video for the Arbitrum Open House Singapore Online Buildathon (HackQuest). It replaces a
ChatGPT-made cut that was mostly text slides and showed a fake "5,000 USDC" screen. This one must show
the real, live product doing real work on Arbitrum Sepolia: a client locks funds, a freelancer
delivers, the client pays, and then the three "nobody can stall" rules on real deals, ending on the
freelancer's portable work record and the proof (verified source, tests).

The user asked for something as good as the MonadTrust demo: "a beautiful demo video. No AI slop.
Good voiceover, proper sound design, music where necessary, clean transitions." They strongly dislike
AI-looking design (gradient text, glows, pill badges, generic fonts) and AI-sounding copy.
Tone: calm, confident, concrete. Plain words, short sentences.

## Assets

- The live app (Vercel URL once deployed; source in `dist/`) — featured deal, all-deals table, work record.
- Real demo deals on the v2 contract, one per outcome: completed, arbiter split, claimed after the
  review window, reclaimed after a missed due date, frozen with the arbiter clock running.
- Screen recordings made with `tools/wallet-shim.mjs` (a real signing wallet in a scripted browser),
  so every click and transaction in the video really happened on Arbitrum Sepolia.
- Logo: `dist/mark.svg` (bracket "scope" with one paid segment in acid green).

## Customizations

- Feature the product's own screens (recordings), never a rebuilt UI.
- Voice: ElevenLabs River (SAz9YHcvj6GT2YYXdXww), eleven_v3 — same narrator the user liked on MonadTrust.
- Music: understated, warm, low in the mix; tasteful UI sound design on key reveals only.
- Captions: word-timed, because judges often watch muted.

## Notes

- Brand: ground #0d0e0c, text #ecebe3, muted #a3a298; acid green #c5f04a = money that reached the
  freelancer / verified; amber #f2b84b = a clock is running / waiting; red #ff6b57 = frozen / overdue;
  slate #8fa6bf = money returned to the client. Type: Schibsted Grotesk + IBM Plex Mono.
- Avoid: gradient text, glows, grid backgrounds, pulsing dots, emoji, "revolutionary/seamless/unlock".
- Facts must stay exact: amounts, deal numbers and tx hashes come from the recorded deals.
