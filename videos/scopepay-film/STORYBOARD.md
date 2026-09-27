---
format: 1920x1080
duration: 110s
message: "ScopePay is milestone escrow on Arbitrum where nobody can sit on the money: the client funds first, every milestone pays on approval, and a deadline settles it when anyone goes quiet."
arc: Hook (both sides get stiffed) → Promise → Fund → Deliver → Get paid → Nobody can stall (claim, reclaim) → Disputes (arbiter, arbiter timeout) → Work record → Proof → CTA
audience: "Arbitrum Open House Singapore Buildathon judges"
mode: autonomous
music: warm minimal electronic underscore, steady mid-tempo pulse, soft keys, calm and hopeful, restrained, no vocals, no drops
---

# STORYBOARD — ScopePay demo

Arc: **Problem → Demo loop → Differentiator → Proof.** The pain (getting stiffed on internet work, from either
side) is universal, so it is shown fast with the product's own vocabulary (ledger rows and state tags). Then the
real product does real work on Arbitrum Sepolia: every transaction on screen was signed and confirmed during the
recording. The differentiator is that every stall has an exit, shown on four real deals. Close on the freelancer's
portable record and the proof that the contract holds up.

## Video direction

- **palette**: the app's own. Ground #0D0E0C, text #ECEBE3, muted #A3A298, lines #2A2B26. Colour means money
  state only: acid green #C5F04A = reached the freelancer / verified; amber #F2B84B = a clock is running;
  red #FF6B57 = frozen / overdue / never paid; slate #8FA6BF = returned to the client.
- **type**: Schibsted Grotesk 800, sentence case, tight tracking for statements; IBM Plex Mono for labels, tags,
  amounts, hashes. Emphasis is a bright word on a muted line, or a word in its state colour.
- **product screens**: real recordings of the app (1280x720 CSS px @2x) in a flat window with a thin URL bar.
  The camera pushes in on the part being talked about; nothing is rebuilt.
- **motion grammar**: one camera, long-tail power3 eases, word-synced reveals from the voice's own timings,
  hard in-place swaps for kinetic type, 0.5% drift on holds. No bounce except state-tag pops.
- **captions**: word-timed captions on recording frames (judges often watch muted); kinetic frames carry their own words.
- **negative list**: gradient text, glows, grid backgrounds, pulsing dots, emoji, pill badges, stock icons, fake UI,
  fake numbers. Every amount, deal number and hash on screen comes from the chain.

## Frame 1 — Somebody gets stiffed

- scene: Two ledger rows tell the story from the freelancer's side, then flip to the client's side
- voiceover: "A freelancer in Lagos finishes the job. Then the client goes quiet… and the money never comes. Flip it around, and it's the client who paid up front, watching the freelancer disappear."
- duration: 14.2s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html

## Frame 2 — Nobody sits on the money

- scene: Logo and wordmark, then the promise
- voiceover: "ScopePay fixes both sides. It's milestone escrow on Arbitrum, where nobody gets to sit on the money."
- duration: 6.9s
- transition_in: crossfade
- status: animated
- src: compositions/frames/02-promise.html

## Frame 3 — Fund the exact scope

- scene: Recording: the client fills the new-deal form and locks the funds on Arbitrum
- voiceover: "The client describes the work, names the freelancer and an arbiter, and splits the budget into milestones, in USDC or Paxos USDG. Then the whole amount is locked in the contract, before any work starts."
- duration: 14.2s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/03-fund.html

## Frame 4 — Deliver

- scene: Recording: the wallet switches to the freelancer, who submits the delivery; its hash matches on-chain
- voiceover: "The freelancer delivers. Only a fingerprint of the delivery goes on-chain, so the work stays private… but provable."
- duration: 7.9s
- transition_in: cut
- status: animated
- src: compositions/frames/04-deliver.html

## Frame 5 — Get paid

- scene: Recording: back as the client, approve and release; the paid bar fills
- voiceover: "The client approves, and the milestone pays out in seconds."
- duration: 5.4s
- transition_in: cut
- status: animated
- src: compositions/frames/05-paid.html

## Frame 6 — Nobody can stall

- scene: Kinetic line, then two real deals: the freelancer claims after the client went quiet; the client reclaims after a missed due date
- voiceover: "Here's the part escrow usually gets wrong. If the client goes quiet, the review window closes, and the freelancer claims the payment. If the freelancer misses a due date, the client takes back what's left."
- duration: 12.8s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/06-stall.html

## Frame 7 — Disputes end too

- scene: Recording: the arbiter splits a disputed milestone; then a frozen deal with the 14-day clock running
- voiceover: "If they disagree, the deal freezes and the arbiter splits it. And if the arbiter never decides, the contract settles it after fourteen days. Nothing stays stuck."
- duration: 10.2s
- transition_in: crossfade
- status: animated
- src: compositions/frames/07-disputes.html

## Frame 8 — A record that travels

- scene: Recording: the freelancer's work record, then every deal on the contract
- voiceover: "Every payment becomes part of the freelancer's work record, rebuilt straight from the contract. The next client can check it without trusting anyone."
- duration: 9.1s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/08-record.html

## Frame 9 — It holds up

- scene: Verified source on the left, the attack tests ticking green on the right
- voiceover: "The contract source is public and verified, and the tests attack it with tokens built to cheat."
- duration: 5.9s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/09-proof.html

## Frame 10 — Funded before you start

- scene: Logo lockup, the line, the live URL and GitHub
- voiceover: "ScopePay. Funded before you start. Paid when you deliver."
- duration: 7.1s
- transition_in: blur-crossfade
- status: animated
- src: compositions/frames/10-outro.html
