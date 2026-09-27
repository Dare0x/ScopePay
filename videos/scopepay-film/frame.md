---
version: alpha
name: ScopePay Ledger — Frame (video / frame layer)
description: >
  The ScopePay app's own look, scaled to the 1920x1080 frame. A warm near-black ground, warm-white
  type in Schibsted Grotesk (800 for statements, sentence case, tight tracking), IBM Plex Mono for
  labels, amounts and hashes, 1px hairlines, flat panels. Colour carries meaning only: acid green is
  money that reached the freelancer or a check that passed; amber is a clock that is running; red is
  frozen or overdue; slate is money returned to the client. Never decorative.
unit: the frame — 1920x1080
principle: atoms are the app's atoms · real screens, never rebuilt · every number comes from the chain

colors:
  canvas: "#0D0E0C"
  ink: "#0D0E0C"
  panel: "#151613"
  panel-2: "#1B1C18"
  line: "#2A2B26"
  line-2: "#3A3B35"
  text: "#ECEBE3"
  muted: "#A3A298"
  faint: "#6F6E66"
  paid: "#C5F04A"
  wait: "#F2B84B"
  frozen: "#FF6B57"
  returned: "#8FA6BF"
  arbitrum: "#28A0F0"

typography:
  display: { fontFamily: "Schibsted Grotesk", weight: 800, tracking: "-0.035em", lineHeight: 1.0 }
  h1:      { fontFamily: "Schibsted Grotesk", weight: 800, tracking: "-0.03em", lineHeight: 1.04 }
  h2:      { fontFamily: "Schibsted Grotesk", weight: 700, tracking: "-0.02em", lineHeight: 1.1 }
  lead:    { fontFamily: "Schibsted Grotesk", weight: 400, lineHeight: 1.3 }
  label:   { fontFamily: "IBM Plex Mono", weight: 500, tracking: "0.08em", upper: true }
  amount:  { fontFamily: "IBM Plex Mono", weight: 600, tracking: "-0.02em" }

components:
  state-tag: "IBM Plex Mono 600 uppercase, 1px border in the state colour at 40%, text in the state colour, 4px radius"
  window: "the recorded app in a flat window: 1px line border, 10px radius, a thin top bar with the URL in mono"
  ledger-row: "label left (muted), value right (text or state colour), 1px line between rows"

avoid: gradient text, glows, grids, bokeh, pulsing dots, emoji, pill badges, stock icons, browser chrome beyond a thin URL bar
---

# ScopePay Ledger frame

Font faces (local files, used by every frame):

@font-face { font-family: "IBM Plex Mono"; font-weight: 400; font-style: normal; src: url("assets/fonts/IBMPlexMono-400.woff2") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 500; font-style: normal; src: url("assets/fonts/IBMPlexMono-500.woff2") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 600; font-style: normal; src: url("assets/fonts/IBMPlexMono-600.woff2") format("woff2"); }
@font-face { font-family: "Schibsted Grotesk"; font-weight: 400; font-style: normal; src: url("assets/fonts/SchibstedGrotesk-400.woff2") format("woff2"); }
@font-face { font-family: "Schibsted Grotesk"; font-weight: 500; font-style: normal; src: url("assets/fonts/SchibstedGrotesk-500.woff2") format("woff2"); }
@font-face { font-family: "Schibsted Grotesk"; font-weight: 600; font-style: normal; src: url("assets/fonts/SchibstedGrotesk-600.woff2") format("woff2"); }
@font-face { font-family: "Schibsted Grotesk"; font-weight: 700; font-style: normal; src: url("assets/fonts/SchibstedGrotesk-700.woff2") format("woff2"); }
@font-face { font-family: "Schibsted Grotesk"; font-weight: 800; font-style: normal; src: url("assets/fonts/SchibstedGrotesk-800.woff2") format("woff2"); }
