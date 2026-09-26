# ScopePay demo video production plan

## Goal

Produce a 75–90 second judge-facing demo that makes one claim easy to verify:

> ScopePay turns internet work into a funded, milestone-based settlement with a visible dispute path and an on-chain receipt.

The video should show the real ScopePay interface and real Arbitrum Sepolia evidence. It should feel deliberate and cinematic without inventing product screens or burying the proof under effects.

## Direction from the HyperFrames reference workflow

- Use a reference-led structure: study pacing, typography, sound, and transitions, then rebuild the useful parts around ScopePay.
- Put the product on screen immediately; avoid generic AI b-roll and abstract blockchain imagery.
- Use restrained motion, clean transitions, readable captions, and subtle sound design.
- Render the composition in the HyperFrames workflow so the final export is repeatable and does not depend on a fragile screen recording.

## Storyboard

| Time | Screen action | Narration / message | Proof on screen |
| --- | --- | --- | --- |
| 0:00–0:08 | Open the completed deal and reveal the ScopePay wordmark | “Work should be settled by what was delivered, not by who has more leverage.” | ScopePay, live Arbitrum Sepolia deal |
| 0:08–0:22 | Show funded balance, milestones, and the three roles | “ScopePay is USDC milestone escrow for independent work. A client funds the scope, a worker delivers evidence, and payment follows approval.” | Funded amount, milestone totals, client/worker/arbiter |
| 0:22–0:42 | Show the paid milestone and activity record | “The first milestone is submitted, approved, and released directly from the contract.” | Milestone released, activity entry, explorer link |
| 0:42–1:05 | Show the dispute state and arbiter resolution | “If the parties disagree, the escrow freezes. The named arbiter resolves the current milestone and the contract records the split.” | Dispute status, resolution amounts, arbiter role |
| 1:05–1:20 | Move to Arbiscan, then return to the completed deal | “Every state change has a public receipt on Arbitrum Sepolia.” | Contract address and verified transaction |
| 1:20–1:30 | End on the completed dashboard and URL | “ScopePay: work delivered, payment earned, proof carried forward.” | Live URL, GitHub, concise call to action |

## Voice and sound

- Use ElevenLabs Matilda if it is available in the user's account and permitted for this submission.
- Keep the delivery calm, precise, and slightly warm; target roughly 135–150 words per minute.
- Generate narration as separate scene clips so timing can be adjusted without re-recording everything.
- Keep music quiet under the voice. Use short interface clicks or low confirmation tones only when they clarify a state change.
- Add captions and correct the pronunciation of “USDC,” “Arbitrum,” and “ScopePay” after the first voice render.

## Acceptance criteria

- The product appears within the first three seconds.
- The video uses the actual deployed interface and actual transaction links.
- The funded, released, disputed, and resolved states are all visible.
- No wallet secrets, private keys, seed phrases, or personal notifications appear.
- Text remains readable at phone size.
- Final export is 16:9, 1080p MP4, between 75 and 110 seconds.
- The submission copy does not claim timeout protection or production security that is not in the deployed contract.

## Next production step

Create the HyperFrames project brief and a short visual proof-of-concept for the opening eight seconds. Review that first frame for hierarchy and readability before producing the full render.
