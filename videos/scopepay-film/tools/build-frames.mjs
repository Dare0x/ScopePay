#!/usr/bin/env node
// Writes compositions/frames/NN-*.html for the ScopePay demo from one place, so every
// frame shares the same fonts, palette, camera maths and motion feel.
// Every on-screen word that echoes the narration is timed from the voice's own word
// timings (audio_engine_meta.json), never by hand. Recordings are real sessions on
// Arbitrum Sepolia (tools/record.mjs), cut by tools/cut-recordings.mjs.
//
//   node tools/build-frames.mjs              frames + audio_meta.json
//   node tools/build-frames.mjs --no-video   same, recordings left out (for assemble-index)
//   node tools/build-frames.mjs --audio      also pad the voice files to frame length

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "compositions", "frames");
const NO_VIDEO = process.argv.includes("--no-video");
const AUDIO = process.argv.includes("--audio");
const FFMPEG = process.env.FFMPEG || "C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe";
const SITE_HOST = process.env.SITE_HOST || "scopepay-arbitrum.vercel.app";
const CONTRACT = JSON.parse(readFileSync(join(ROOT, "..", "..", "deployments", "arbitrum-sepolia.json"), "utf8")).address;
mkdirSync(OUT, { recursive: true });

// ── shared look: the app's own palette, two meaning colours only ─────────────
const C = {
  ink: "#0D0E0C", panel: "#151613", panel2: "#1B1C18", line: "#2A2B26", line2: "#3A3B35",
  text: "#ECEBE3", muted: "#A3A298", faint: "#6F6E66", dim: "#8E8D84",
  paid: "#C5F04A", // money that reached the freelancer, checks that passed
  red: "#FF6B57",  // never paid, never delivered, frozen
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const fontFaces = readFileSync(join(ROOT, "frame.md"), "utf8").split(/\r?\n/).filter((l) => l.startsWith("@font-face")).join("\n");
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── narration timing ─────────────────────────────────────────────────────────
const engine = JSON.parse(readFileSync(join(ROOT, "audio_engine_meta.json"), "utf8"));
// Silence after each line (seconds): the breath before the next frame.
const PAD = { "01": 0.75, "02": 0.65, "03": 0.5, "04": 0.55, "05": 2.3, "06": 0.6, "07": 0.7, "08": 0.6, "09": 0.6, 10: 3.0 };
const V = {};
for (const v of engine.voices) V[Number(v.id)] = { id: v.id, words: v.words, raw: v.duration_s, dur: r3(v.duration_s + (PAD[v.id] ?? 0.5)) };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Display tokens. Prefixes colour a word: + green (paid / holds), ! red (never paid / frozen),
// ~ bright white against a muted line, _ muted. {shown|spoken words} shows text that differs from the voice.
const PREFIX = { "+": "g", "!": "r", "~": "v", _: "mu" };
function parseTokens(text) {
  const out = [];
  const re = /([+!~_]*)\{([^|}]*)\|([^}]*)\}(\S*)|([+!~_]*)(\S+)/g;
  let m;
  while ((m = re.exec(text))) {
    const pre = m[2] !== undefined ? m[1] : m[5];
    const cls = [...pre].map((ch) => PREFIX[ch]).join(" ");
    if (m[2] !== undefined) out.push({ cls, disp: m[2] + m[4], spoken: m[3].split(" ").filter(Boolean) });
    else out.push({ cls, disp: m[6], spoken: [m[6]] });
  }
  return out;
}
function match(f, toks, from = 0) {
  const ws = V[f].words;
  const flat = toks.flatMap((t, ti) => t.spoken.map((w) => ({ w: norm(w), ti })));
  for (let s = from; s + flat.length <= ws.length; s++) {
    if (flat.every((x, k) => norm(ws[s + k].text) === x.w)) {
      const times = toks.map(() => null);
      flat.forEach((x, k) => { if (times[x.ti] == null) times[x.ti] = ws[s + k].start; });
      return { times, end: ws[s + flat.length - 1].end, next: s + flat.length };
    }
  }
  throw new Error(`frame ${f}: "${toks.map((t) => t.spoken.join(" ")).join(" ")}" is not in the narration`);
}
const say = (f, text, n = 0) => {
  let from = 0, m;
  for (let i = 0; i <= n; i++) { m = match(f, parseTokens(text), from); from = m.next; }
  return r3(m.times[0]);
};

// ── markup helpers ───────────────────────────────────────────────────────────
function K(id, text, cls = "", style = "") {
  const toks = parseTokens(text);
  const hasv = toks.some((t) => t.cls.split(" ").includes("v")) ? " hasv" : "";
  const html = `<div id="${id}" class="kl ${cls}${hasv}" style="${style}">${toks.map((t) => `<span class="m"><span class="w ${t.cls}">${t.disp}</span></span>`).join(" ")}</div>`;
  return { id, toks, html };
}
const inTimes = (id, times, d = 0.62) => `      { const ts = ${JSON.stringify(times)};
        $$("#${id} .w").forEach((w, i) => { const t = ts[Math.min(i, ts.length - 1)];
          tl.fromTo(w, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: "none" }, t);
          tl.fromTo(w, { yPercent: 118 }, { yPercent: 0, duration: ${d}, ease: "power4.out" }, t); }); }`;
const inSync = (k, f, n = 0) => {
  let from = 0, m;
  for (let i = 0; i <= n; i++) { m = match(f, k.toks, from); from = m.next; }
  return inTimes(k.id, m.times.map((t) => r3(Math.max(0, t - 0.05))));
};
const inAt = (k, at, step = 0.05, d) => inTimes(k.id, k.toks.map((_, i) => r3(at + i * step)), d);
const outAt = (id, at, d = 0.4) => `      { const ws = $$("#${id} .w");
        tl.to(ws, { yPercent: -118, duration: ${d}, ease: "power3.in", stagger: 0.02 }, ${at});
        tl.set(ws, { opacity: 0 }, ${at} + ${d} + 0.02 * ws.length); }`;
const typeOn = (sel, start, perChar = 0.035) => `      { const el = $("${sel}"); const full = el.textContent; el.textContent = "";
        const spans = [...full].map((ch) => { const s = document.createElement("span"); s.textContent = ch; el.appendChild(s); return s; });
        spans.forEach((s, i) => tl.fromTo(s, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: "none" }, ${start} + i * ${perChar})); }`;
const fadeIn = (sel, at, d = 0.45) => `      tl.fromTo($("${sel}"), { opacity: 0 }, { opacity: 1, duration: ${d}, ease: "power2.out" }, ${at});`;
const fadeOut = (sel, at, d = 0.35) => `      tl.to($("${sel}"), { opacity: 0, duration: ${d}, ease: "power2.in" }, ${at});`;
const riseIn = (sel, at, dy = 30, d = 0.55) => `      tl.fromTo($("${sel}"), { opacity: 0, y: ${dy} }, { opacity: 1, y: 0, duration: ${d}, ease: "power3.out" }, ${at});`;
const popIn = (sel, at, d = 0.45) => `      tl.fromTo($("${sel}"), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: ${d}, ease: "back.out(2.2)" }, ${at});`;
const show = (sel, at) => `      tl.set($("${sel}"), { opacity: 1 }, ${at});`;
const hide = (sel, at) => `      tl.set($("${sel}"), { opacity: 0 }, ${at});`;
const hidden = (...sels) => sels.map((s) => `      tl.set($("${s}"), { opacity: 0 }, 0);`).join("\n");
const drift = (sel, dur, to = 1.03) => `      tl.fromTo($("${sel}"), { scale: 1 }, { scale: ${to}, duration: ${dur}, ease: "none" }, 0);`;
// A number that counts between two values; `fmt` is JS that turns v into text.
const count = (sel, from, to, at, d, fmt = "Math.round(v)") => `      { const el = $("${sel}"), o = { v: ${from} };
        tl.fromTo(o, { v: ${from} }, { v: ${to}, duration: ${d}, ease: "none", onUpdate: () => { const v = o.v; el.textContent = ${fmt}; } }, ${at}); }`;

// Captions: short phrases that light up word by word as they're spoken.
function captions(f, phrases, top = 906) {
  let from = 0;
  const caps = phrases.map((p) => {
    const [text, until] = Array.isArray(p) ? p : [p];
    const toks = parseTokens(text);
    const m = match(f, toks, from);
    from = m.next;
    return { toks, times: m.times.map(r3), end: m.end, until, t0: r3(m.times[0] - 0.1) };
  });
  caps.forEach((c, i) => { const nxt = caps[i + 1]; c.t1 = r3(c.until ?? Math.min(nxt ? nxt.t0 : Infinity, c.end + 0.7)); });
  const html = `    <div class="caps" style="top:${top}px">${caps.map((c, i) => `<div class="cap" id="cap${i}">${c.toks.map((t) => `<span class="cw ${t.cls}">${t.disp}</span>`).join(" ")}</div>`).join("")}</div>`;
  const js = caps.map((c, i) => `      { const cp = $("#cap${i}"), ws = $$("#cap${i} .cw"), ts = ${JSON.stringify(c.times)};
        tl.fromTo(cp, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out" }, ${c.t0});
        ws.forEach((w, j) => tl.fromTo(w, { opacity: 0.32 }, { opacity: 1, duration: 0.12, ease: "none" }, ts[j]));
        tl.to(cp, { opacity: 0, duration: 0.14, ease: "power1.in" }, ${c.t1}); }`).join("\n");
  return { html, js };
}

// Browser window playing screen recordings. A recording's page is 1280x720 CSS px,
// shown at 1440x810, so 1 CSS px = 1.125 screen px before zoom.
const WX = 240, WY = 30, BAR = 36, VW = 1440, VH = 810, VK = VW / 1280;
function vwin(videos, roles) {
  const vids = videos.map(({ id, start, dur }) => (NO_VIDEO
    ? `<div class="vidc"></div>`
    : `<video id="rec-${id}" class="clip vidc" src="assets/rec-${id}.mp4" data-start="${start}" data-duration="${dur}" data-track-index="2" muted playsinline></video>`)).join("");
  const roleSpans = roles.map(([key, label]) => `<span class="role" id="role-${key}">${label}</span>`).join("");
  return `    <div id="win"><div class="bar"><span class="who">${roleSpans}</span><span class="url">${SITE_HOST}</span><span class="net">Arbitrum Sepolia</span></div><div class="scr"><div id="vcam">${vids}</div></div></div>`;
}
function vc(cx, cy, z) {
  let x = VW / 2 - z * VK * cx, y = VH / 2 - z * VK * cy;
  x = Math.min(0, Math.max(VW - z * VW, x));
  y = Math.min(0, Math.max(VH - z * VH, y));
  return { x: r3(x), y: r3(y), scale: z };
}
const vcam = (at, d, cx, cy, z, ease = "power3.inOut") => `      tl.to($("#vcam"), { ...${JSON.stringify(vc(cx, cy, z))}, duration: ${d}, ease: "${ease}" }, ${at});`;
const vset = (at, cx, cy, z) => `      tl.set($("#vcam"), ${JSON.stringify(vc(cx, cy, z))}, ${at});`;
const roleAt = (key, at) => `      tl.set($$("#win .role"), { opacity: 0 }, ${at}); tl.set($("#role-${key}"), { opacity: 1 }, ${at});`;

// The bracket mark (same as dist/mark.svg), drawn inline so it can animate.
const markSvg = (id, size) => `<svg id="${id}" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1b1c18"/><path class="br" d="M11.5 8H7.5v16h4M20.5 8h4v16h-4" fill="none" stroke="${C.text}" stroke-width="2.4"/><rect class="seg1" x="11" y="13.5" width="5.5" height="5" fill="${C.paid}"/><rect class="seg2" x="17.5" y="13.5" width="3.5" height="5" fill="${C.text}" opacity=".3"/></svg>`;
const markPop = (id, at) => `      tl.fromTo($("#${id}"), { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.7)" }, ${at});
      tl.fromTo($("#${id} .seg1"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.45, ease: "power3.out" }, ${r3(at + 0.3)});
      tl.fromTo($("#${id} .seg2"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.35, ease: "power3.out" }, ${r3(at + 0.5)});`;

const baseCss = (id) => `
${fontFaces}
#root { position: absolute; inset: 0; overflow: hidden; color: ${C.text}; font-family: "Schibsted Grotesk", sans-serif; font-weight: 400; }
#bg-${id} { position: absolute; inset: 0; background: ${C.ink}; }
#root #cam { position: absolute; inset: 0; transform-origin: 30% 45%; }
#root .t { position: absolute; left: 160px; }
#root .kicker { font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 24px; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.muted}; }
#root .kl { position: absolute; }
#root .h1 { font-weight: 800; font-size: 100px; line-height: 1.04; letter-spacing: -0.032em; max-width: 1620px; }
#root .h2 { font-weight: 700; font-size: 68px; line-height: 1.1; letter-spacing: -0.02em; max-width: 1600px; }
#root .giant { font-weight: 800; line-height: 1; letter-spacing: -0.04em; }
#root .lead { font-size: 44px; line-height: 1.25; color: ${C.muted}; max-width: 1400px; }
#root .m { display: inline-block; overflow: hidden; vertical-align: top; padding: 0.06em 0.05em 0.16em; margin: -0.06em -0.05em -0.16em; }
#root .w { display: inline-block; }
#root .g { color: ${C.paid}; } #root .r { color: ${C.red}; } #root .mu { color: ${C.muted}; }
#root .kl.hasv .w { color: ${C.dim}; } #root .kl.hasv .w.v { color: #FFFFFF; }
#root .mono { font-family: "IBM Plex Mono", monospace; }
#root .tag { font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 26px; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 10px 16px 11px; border: 2px solid ${C.faint}; border-radius: 6px; color: ${C.text}; white-space: nowrap; }
#root .tag.ok { color: ${C.paid}; border-color: rgba(197,240,74,0.45); }
#root .tag.bad { color: ${C.red}; border-color: rgba(255,107,87,0.5); }
#root .caps { position: absolute; left: 0; right: 0; display: grid; justify-items: center; z-index: 20; pointer-events: none; }
#root .cap { grid-area: 1 / 1; font-weight: 600; font-size: 38px; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;
  color: ${C.text}; background: rgba(13,14,12,0.92); border: 1px solid ${C.line}; padding: 9px 22px 12px; border-radius: 8px; opacity: 0; }
#root .cw { display: inline-block; }
#root #win { position: absolute; left: ${WX}px; top: ${WY}px; width: ${VW}px; height: ${VH + BAR}px; border: 1px solid ${C.line2};
  border-radius: 12px; overflow: hidden; background: ${C.ink}; box-shadow: 0 40px 120px rgba(0,0,0,0.6); }
#root #win .bar { position: absolute; left: 0; right: 0; top: 0; height: ${BAR}px; border-bottom: 1px solid ${C.line};
  background: ${C.panel}; display: flex; align-items: center; justify-content: center; font-family: "IBM Plex Mono", monospace; }
#root #win .url { font-size: 16px; color: ${C.muted}; letter-spacing: 0.02em; padding: 3px 14px; border-radius: 6px; background: ${C.panel2}; }
#root #win .who { position: absolute; left: 16px; top: 0; height: ${BAR}px; width: 420px; }
#root #win .role { position: absolute; left: 0; top: 9px; font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.text}; opacity: 0; white-space: nowrap; }
#root #win .role b { color: ${C.muted}; font-weight: 500; }
#root #win .net { position: absolute; right: 16px; top: 10px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: ${C.muted}; }
#root #win .scr { position: absolute; left: 0; top: ${BAR}px; width: ${VW}px; height: ${VH}px; overflow: hidden; background: ${C.ink}; }
#root #vcam { position: absolute; left: 0; top: 0; width: ${VW}px; height: ${VH}px; transform-origin: 0 0; }
#root .vidc { position: absolute; left: 0; top: 0; width: ${VW}px; height: ${VH}px; display: block; }
`;

function frame({ id, dur, css = "", html, js }) {
  return `<template>
  <style>${baseCss(id)}${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080">
    <div id="bg-${id}" class="clip" data-start="0" data-duration="${dur}" data-track-index="0"></div>
${html}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    (function () {
      const $ = (s) => document.querySelector('[data-composition-id="${id}"] ' + s);
      const $$ = (s) => Array.from(document.querySelectorAll('[data-composition-id="${id}"] ' + s));
      const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
${js}
      tl.to({}, { duration: ${dur} }, 0);
      window.__timelines["${id}"] = tl;
    })();
  </script>
</template>
`;
}

const frames = [];
// sfx cues: [file, offset, volume, duration?]
const SFX_LEN = { click: 0.48, impact: 1.6, pop: 0.48, riser: 1.2, ticks: 2.0, typing: 1.2, whoosh: 0.8 };
const ROLE = {
  client: ["client", "Signed in as <b>client</b>"],
  worker: ["worker", "Signed in as <b>freelancer</b>"],
  arbiter: ["arbiter", "Signed in as <b>arbiter</b>"],
  guest: ["guest", "<b>No wallet</b> · anyone can read it"],
};
const winIn = (at) => `      tl.fromTo($("#win"), { opacity: 0, y: 90, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" }, ${at});`;

// ── 01 Hook: somebody gets stiffed ───────────────────────────────────────────
{
  const f = 1, dur = V[f].dur;
  const a1 = K("a1", "A freelancer in Lagos ~finishes ~the ~job.", "h1", "left:160px;top:212px");
  const a2 = K("a2", "Then the client goes quiet…", "h1", "left:160px;top:212px");
  const b2 = K("b2", "{…and|and} the money !never !comes.", "h1", "left:160px;top:320px");
  const a3 = K("a3", "Flip it around.", "h1", "left:160px;top:212px");
  const b3 = K("b3", "{The|the} client {paid|who paid} up {front…|front,}", "h1", "left:160px;top:212px");
  const c3 = K("c3", "{…and|watching} the freelancer !{disappears.|disappear.}", "h1", "left:160px;top:320px");
  const tFin = say(f, "finishes"), tThen = say(f, "Then"), tQuiet = say(f, "quiet…"), tNever = say(f, "never"), tFlip = say(f, "Flip");
  const tAnd2 = say(f, "and it's"), tWatch = say(f, "watching"), tGone = say(f, "disappear.");
  const tFlipMid = r3(tFlip + 0.26);
  const row = (id, label, desc) => `<div class="row" id="${id}"><span class="lab">${label}</span><span class="desc">${desc}</span><span class="tg"></span></div>`;
  frames.push({
    id: "01-hook", n: f, dur,
    css: `
#root #k { top: 140px; }
#root #side { top: 572px; }
#root #led { position: absolute; left: 160px; top: 616px; width: 1600px; border-top: 1px solid ${C.line2}; transform-origin: 50% 50%; }
#root .row { position: relative; height: 112px; border-bottom: 1px solid ${C.line2}; display: flex; align-items: center; }
#root .row .lab { width: 280px; font-family: "IBM Plex Mono", monospace; font-weight: 500; font-size: 24px; letter-spacing: 0.1em; text-transform: uppercase; color: ${C.muted}; }
#root .row .desc { font-weight: 700; font-size: 44px; letter-spacing: -0.015em; }
#root .row .amt { font-family: "IBM Plex Mono", monospace; font-weight: 600; letter-spacing: -0.02em; }
#root .tagbox { position: absolute; right: 0; top: 50%; transform: translateY(-50%); }
#root .tagbox .tag { position: absolute; right: 0; top: 0; transform: translateY(-50%); }
#root .face2 { position: absolute; inset: 0; }`,
    html: `    <div id="cam">
    <div id="k" class="t kicker">Getting paid for internet work</div>
    ${a1.html}${a2.html}${b2.html}${a3.html}${b3.html}${c3.html}
    <div id="side" class="t kicker"><span id="s1">The freelancer's side</span><span id="s2" style="position:absolute;left:0">The client's side</span></div>
    <div id="led">
      <div class="row" id="r1"><div class="face1" style="display:contents"><span class="lab f1">Delivery</span><span class="desc f1">Landing page, 3 screens</span></div>
        <span class="lab f2" style="position:absolute;left:0">Payment</span><span class="desc f2 amt" style="position:absolute;left:280px">450.00 USDC</span>
        <div class="tagbox"><span class="tag ok" id="t1a">Delivered</span><span class="tag ok" id="t1b">Paid up front</span></div></div>
      <div class="row" id="r2"><span class="lab f1">Payment</span><span class="desc f1 amt">450.00 USDC</span>
        <span class="lab f2" style="position:absolute;left:0">Delivery</span><span class="desc f2" style="position:absolute;left:280px">Landing page, 3 screens</span>
        <div class="tagbox"><span class="tag" id="t2a">Waiting · day <span id="d1">1</span></span><span class="tag bad" id="t2b">Never paid</span><span class="tag" id="t2c">Waiting · day <span id="d2">1</span></span><span class="tag bad" id="t2d">Never delivered</span></div></div>
    </div>
    </div>`,
    js: `${drift("#cam", dur, 1.03)}
${hidden("#side", "#s2", "#r1", "#r2", ".f2", "#t1a", "#t1b", "#t2a", "#t2b", "#t2c", "#t2d")}
      tl.set($$("#led .f2"), { opacity: 0 }, 0);
${typeOn("#k", 0.05, 0.03)}
${inSync(a1, f)}
${fadeIn("#side", r3(tFin - 0.3))}
${riseIn("#r1", r3(tFin - 0.05), 24, 0.5)}
${popIn("#t1a", r3(tFin + 0.35))}
${outAt("a1", r3(tThen - 0.35))}
${inSync(a2, f)}
${riseIn("#r2", r3(tThen), 24, 0.5)}
${popIn("#t2a", r3(tThen + 0.3))}
${count("#d1", 1, 34, r3(tQuiet), r3(tNever - tQuiet))}
${inSync(b2, f)}
      tl.set($("#t2a"), { opacity: 0 }, ${tNever});
${popIn("#t2b", tNever, 0.4)}
${outAt("a2", r3(tFlip - 0.3))}
${outAt("b2", r3(tFlip - 0.3))}
${inSync(a3, f)}
      tl.to($("#led"), { rotateX: 90, duration: 0.26, ease: "power2.in" }, ${tFlip});
      tl.set($$("#led .f1"), { opacity: 0 }, ${tFlipMid});
      tl.set($$("#led .f2"), { opacity: 1 }, ${tFlipMid});
      tl.set([$("#t1a"), $("#t2b"), $("#s1")], { opacity: 0 }, ${tFlipMid});
      tl.set([$("#t1b"), $("#t2c"), $("#s2")], { opacity: 1 }, ${tFlipMid});
      tl.fromTo($("#led"), { rotateX: -90 }, { rotateX: 0, duration: 0.34, ease: "power2.out", immediateRender: false }, ${tFlipMid});
${outAt("a3", r3(tAnd2 - 0.3))}
${inSync(b3, f)}
${count("#d2", 1, 21, r3(tAnd2 + 0.6), r3(tGone - tAnd2 - 0.6))}
${inSync(c3, f)}
      tl.set($("#t2c"), { opacity: 0 }, ${tGone});
${popIn("#t2d", tGone, 0.4)}`,
    sfx: [["pop", r3(tFin + 0.35), 0.22], ["pop", r3(tThen + 0.3), 0.18], ["ticks", r3(tQuiet), 0.16, r3(tNever - tQuiet)], ["impact", tNever, 0.14],
      ["whoosh", r3(tFlip - 0.1), 0.2], ["ticks", r3(tAnd2 + 0.6), 0.12, r3(tGone - tAnd2 - 0.6)], ["impact", tGone, 0.14], ["whoosh", r3(dur - 0.3), 0.14]],
  });
}

// ── 02 Promise ───────────────────────────────────────────────────────────────
{
  const f = 2, dur = V[f].dur;
  const wm = K("wm", "ScopePay", "giant", "position:relative;font-size:150px;letter-spacing:-0.035em");
  const sub = K("sub", "fixes both sides.", "lead", "left:0;right:0;top:600px;text-align:center;max-width:none");
  const l1 = K("l1", "Milestone escrow on Arbitrum,", "h2", `left:160px;top:330px;color:${C.muted}`);
  const l2 = K("l2", "where ~nobody gets to sit on the money.", "h1", "left:160px;top:430px;max-width:1500px");
  const tIts = say(f, "It's");
  frames.push({
    id: "02-promise", n: f, dur,
    css: `#root #lock { position: absolute; left: 0; right: 0; top: 340px; display: flex; justify-content: center; align-items: center; gap: 44px; transform-origin: 50% 50%; }`,
    html: `    <div id="cam">
    <div id="lock">${markSvg("mk", 190)}${wm.html}</div>
    ${sub.html}${l1.html}${l2.html}
    </div>`,
    js: `${drift("#cam", dur, 1.025)}
${markPop("mk", 0.0)}
${inTimes("wm", [0.12], 0.7)}
${inSync(sub, f)}
      tl.to($("#lock"), { y: -250, scale: 0.42, duration: 0.6, ease: "power3.inOut" }, ${r3(tIts - 0.35)});
      tl.to($("#lock"), { x: -610, duration: 0.6, ease: "power3.inOut" }, ${r3(tIts - 0.35)});
${outAt("sub", r3(tIts - 0.4))}
${inSync(l1, f)}
${inSync(l2, f)}`,
    sfx: [["pop", 0.1, 0.22], ["whoosh", r3(tIts - 0.4), 0.16]],
  });
}

// ── 03 Fund the deal (recording) ─────────────────────────────────────────────
{
  const f = 3, dur = V[f].dur;
  const cap = captions(f, ["The client describes the work,", "names the freelancer and an arbiter,", "and splits the budget into milestones,", "in USDC or Paxos USDG.", "Then the whole amount is locked in the contract,", "before any work starts."]);
  frames.push({
    id: "03-fund", n: f, dur,
    html: `${vwin([{ id: "03", start: 0, dur }], [ROLE.client])}
${cap.html}`,
    js: `${roleAt("client", 0)}
${vset(0, 640, 360, 1.0)}
${vcam(0.55, 0.9, 640, 300, 1.42)}
${vcam(5.7, 0.8, 560, 372, 1.62)}
${vcam(7.6, 0.8, 640, 520, 1.42)}
${vcam(10.2, 0.7, 700, 620, 1.42)}
${vcam(11.25, 0.8, 640, 360, 1.0)}
${vcam(13.2, 0.8, 1010, 600, 1.35)}
${cap.js}`,
    sfx: [["click", 0.5, 0.35], ["typing", 1.4, 0.14, 3.6], ["typing", 8.2, 0.12, 2.2], ["click", 11.0, 0.35], ["pop", 13.2, 0.22]],
  });
}

// ── 04 Deliver (recording) ───────────────────────────────────────────────────
{
  const f = 4, dur = V[f].dur;
  const cap = captions(f, ["The freelancer delivers.", "Only a fingerprint of the delivery goes on-chain,", "so the work stays private… but provable."]);
  frames.push({
    id: "04-deliver", n: f, dur,
    html: `${vwin([{ id: "04", start: 0, dur }], [ROLE.worker])}
${cap.html}`,
    js: `${roleAt("worker", 0)}
${vset(0, 640, 360, 1.0)}
${vcam(0.7, 0.8, 640, 330, 1.45)}
${vcam(3.5, 0.8, 640, 420, 1.12)}
${vcam(5.4, 0.9, 420, 500, 1.55)}
${cap.js}`,
    sfx: [["click", 0.9, 0.3], ["typing", 1.5, 0.12, 1.5], ["click", 3.4, 0.35], ["pop", 5.2, 0.22]],
  });
}

// ── 05 Paid (recording) ──────────────────────────────────────────────────────
{
  const f = 5, dur = V[f].dur;
  const cap = captions(f, ["The client approves,", "and the milestone pays out in seconds."]);
  frames.push({
    id: "05-paid", n: f, dur,
    html: `${vwin([{ id: "05", start: 0, dur }], [ROLE.client])}
${cap.html}`,
    js: `${roleAt("client", 0)}
${vset(0, 640, 360, 1.0)}
${vcam(0.35, 0.7, 1030, 420, 1.35)}
${vcam(1.15, 0.6, 640, 340, 1.45)}
${vcam(2.1, 0.7, 640, 360, 1.0)}
${vcam(3.7, 0.9, 420, 300, 1.7)}
${cap.js}`,
    sfx: [["click", 0.8, 0.3], ["click", 1.9, 0.35], ["pop", 3.6, 0.26]],
  });
}

// ── 06 Nobody can stall (kinetic + two recordings) ───────────────────────────
{
  const f = 6, dur = V[f].dur;
  const k1 = K("k1", "Here's the part escrow usually ~gets ~wrong.", "h1", "left:160px;top:420px;max-width:1500px");
  const cap = captions(f, ["If the client goes quiet,", "the review window closes,", "and the freelancer claims the payment.", "If the freelancer misses a due date,", "the client takes back what's left."]);
  const VA = 2.6, VB = 8.05;
  frames.push({
    id: "06-stall", n: f, dur,
    html: `    <div id="kin">${k1.html}</div>
${vwin([{ id: "06a", start: VA, dur: r3(VB - VA) }, { id: "06b", start: VB, dur: r3(dur - VB) }], [ROLE.worker, ROLE.client])}
${cap.html}`,
    js: `${hidden("#win")}
${inSync(k1, f)}
      tl.to($("#kin"), { opacity: 0, y: -40, duration: 0.35, ease: "power2.in" }, ${r3(VA - 0.3)});
${winIn(r3(VA - 0.1))}
${roleAt("worker", VA)}
${vset(VA, 1030, 390, 1.35)}
${vcam(r3(VA + 3.0), 0.9, 430, 480, 1.35)}
${roleAt("client", VB)}
${vset(VB, 1030, 390, 1.35)}
${vcam(r3(VB + 3.1), 0.8, 640, 330, 1.12)}
${cap.js}`,
    sfx: [["whoosh", r3(VA - 0.2), 0.18], ["click", r3(VA + 2.7), 0.35], ["pop", r3(VA + 4.8), 0.24], ["click", r3(VB + 2.8), 0.35], ["pop", r3(VB + 3.9), 0.22]],
  });
}

// ── 07 Disputes end too (two recordings + kinetic) ───────────────────────────
{
  const f = 7, dur = V[f].dur;
  const cap = captions(f, ["If they disagree,", "the deal freezes and the arbiter splits it.", "And if the arbiter never decides,", "the contract settles it after fourteen days."]);
  const end = K("end", "Nothing stays ~stuck.", "h1", "left:0;right:0;top:450px;text-align:center;max-width:none;font-size:130px");
  const VB = 4.3, tNothing = say(f, "Nothing");
  frames.push({
    id: "07-disputes", n: f, dur,
    html: `${vwin([{ id: "07a", start: 0, dur: VB }, { id: "07b", start: VB, dur: r3(dur - VB) }], [ROLE.arbiter, ROLE.guest])}
${cap.html}
    <div id="endw">${end.html}</div>`,
    js: `${roleAt("arbiter", 0)}
${vset(0, 640, 330, 1.4)}
${vcam(2.2, 0.7, 640, 360, 1.0)}
${vcam(3.0, 0.8, 1030, 350, 1.3)}
${roleAt("guest", VB)}
${vset(VB, 1030, 400, 1.3)}
${vcam(r3(VB + 0.4), 1.4, 1030, 445, 1.75)}
      tl.to($("#win"), { opacity: 0.18, scale: 0.97, duration: 0.5, ease: "power2.inOut" }, ${r3(tNothing - 0.35)});
${inSync(end, f)}`,
    sfx: [["click", 2.5, 0.35], ["pop", 3.9, 0.22], ["ticks", r3(VB + 0.6), 0.12, 2.4], ["impact", r3(tNothing), 0.12]],
  });
}

// ── 08 Work record (recording) ───────────────────────────────────────────────
{
  const f = 8, dur = V[f].dur;
  const cap = captions(f, ["Every payment becomes part", "of the freelancer's work record,", "rebuilt straight from the contract.", "The next client can check it", "without trusting anyone."]);
  frames.push({
    id: "08-record", n: f, dur,
    html: `${vwin([{ id: "08", start: 0, dur }], [ROLE.guest])}
${cap.html}`,
    js: `${roleAt("guest", 0)}
${vset(0, 640, 360, 1.0)}
${vcam(2.2, 0.9, 640, 300, 1.32)}
${vcam(5.8, 0.9, 640, 360, 1.0)}
${cap.js}`,
    sfx: [["click", 1.2, 0.3], ["whoosh", 5.2, 0.14]],
  });
}

// ── 09 Proof ─────────────────────────────────────────────────────────────────
{
  const f = 9, dur = V[f].dur;
  const tPublic = say(f, "public"), tVerified = say(f, "verified,"), tTests = say(f, "tests"), tTokens = say(f, "tokens"), tCheat = say(f, "cheat.");
  const TESTS = [
    ["accepts only a short list of real, distinct payment tokens", 0],
    ["a client who goes quiet after delivery cannot hold the payment", 0],
    ["a worker who misses a deadline lets the client take back what is left", 0],
    ["an arbiter who never decides cannot freeze the money forever", 0],
    ["refuses a fee-on-transfer token that would underfund the deal", 1],
    ["a token that calls back during a payout cannot re-enter the escrow", 1],
    ["random sequences of actions never lose or create money", 1],
  ];
  const step = r3((tCheat - tTests) / TESTS.length);
  frames.push({
    id: "09-proof", n: f, dur,
    css: `
#root .col { position: absolute; top: 200px; }
#root #left { left: 160px; width: 700px; }
#root #right { left: 940px; width: 820px; }
#root .file { font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 58px; letter-spacing: -0.02em; margin: 26px 0 30px; }
#root .kv { display: flex; justify-content: space-between; padding: 18px 0; border-top: 1px solid ${C.line2}; font-size: 28px; }
#root .kv span:first-child { color: ${C.muted}; }
#root .kv span:last-child { font-family: "IBM Plex Mono", monospace; font-weight: 500; }
#root #match { color: ${C.paid}; }
#root .test { display: grid; grid-template-columns: 44px 1fr; align-items: start; padding: 13px 0; border-top: 1px solid ${C.line}; font-family: "IBM Plex Mono", monospace; font-size: 23px; line-height: 1.35; color: ${C.dim}; }
#root .test .ck { color: ${C.paid}; font-weight: 600; }
#root .test.atk { color: ${C.text}; }
#root #pass { margin-top: 18px; font-family: "IBM Plex Mono", monospace; font-size: 24px; color: ${C.muted}; }
#root #pass b { color: ${C.paid}; font-weight: 600; }`,
    html: `    <div id="cam">
    <div class="col" id="left">
      <div class="kicker">Public, verified source</div>
      <div class="file">ScopePay.sol</div>
      <div class="kv" id="kv1"><span>Network</span><span>Arbitrum Sepolia</span></div>
      <div class="kv" id="kv2"><span>Contract</span><span>${short(CONTRACT)}</span></div>
      <div class="kv" id="kv3"><span>Sourcify</span><span id="match">✓ exact match</span></div>
      <div class="kv" id="kv4"><span>Tokens</span><span>USDC · USDG</span></div>
    </div>
    <div class="col" id="right">
      <div class="kicker">npm test</div>
      <div style="height:26px"></div>
      ${TESTS.map(([name, atk], i) => `<div class="test ${atk ? "atk" : ""}" id="tt${i}"><span class="ck">✓</span><span>${name}</span></div>`).join("")}
      <div id="pass"><b>14 passing</b> · 0 failing</div>
    </div>
    </div>`,
    js: `${drift("#cam", dur, 1.02)}
${hidden("#left", "#right", "#kv1", "#kv2", "#kv3", "#kv4", "#pass")}
${riseIn("#left", r3(tPublic - 0.5), 30, 0.5)}
${riseIn("#kv1", r3(tPublic - 0.2), 14, 0.35)}
${riseIn("#kv2", r3(tPublic), 14, 0.35)}
${riseIn("#kv3", r3(tVerified - 0.05), 14, 0.35)}
${riseIn("#kv4", r3(tVerified + 0.3), 14, 0.35)}
${riseIn("#right", r3(tTests - 0.5), 30, 0.5)}
      ${JSON.stringify(TESTS.map((_, i) => r3(tTests - 0.2 + i * step)))}.forEach((t, i) => tl.fromTo($("#tt" + i), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.3 }, t));
      tl.to($$(".test.atk"), { backgroundColor: "rgba(197,240,74,0.07)", duration: 0.3 }, ${r3(tTokens)});
${fadeIn("#pass", r3(tCheat))}`,
    sfx: [["pop", r3(tVerified), 0.2], ["ticks", r3(tTests - 0.2), 0.14, r3(tCheat - tTests + 0.3)]],
  });
}

// ── 10 Outro ─────────────────────────────────────────────────────────────────
{
  const f = 10, dur = V[f].dur;
  const wm = K("wm", "ScopePay.", "giant", "position:relative;font-size:132px;letter-spacing:-0.035em");
  const l1 = K("l1", "Funded before you start.", "h2", "left:0;right:0;top:560px;text-align:center;max-width:none");
  const l2 = K("l2", "~Paid ~when ~you ~deliver.", "h2", "left:0;right:0;top:648px;text-align:center;max-width:none");
  const tDel = say(f, "deliver.");
  frames.push({
    id: "10-outro", n: f, dur,
    css: `#root #all { position: absolute; inset: 0; }
#root #lock { position: absolute; left: 0; right: 0; top: 300px; display: flex; justify-content: center; align-items: center; gap: 38px; }
#root #links { position: absolute; left: 0; right: 0; top: 800px; display: flex; justify-content: center; gap: 56px; font-family: "IBM Plex Mono", monospace; font-size: 30px; color: ${C.text}; }
#root #links span { color: ${C.muted}; }
#root #credit { position: absolute; left: 0; right: 0; top: 900px; text-align: center; font-size: 20px; color: ${C.faint}; }`,
    html: `    <div id="all">
      <div id="lock">${markSvg("mk", 150)}${wm.html}</div>
      ${l1.html}${l2.html}
      <div id="links"><div>${SITE_HOST}</div><div><span>github.com/</span>Dare0x/ScopePay</div></div>
      <div id="credit">Built on Arbitrum · Circle USDC and Paxos USDG · Voice: ElevenLabs</div>
    </div>`,
    js: `${hidden("#links", "#credit")}
${markPop("mk", 0.0)}
${inTimes("wm", [0.1], 0.7)}
${inSync(l1, f)}
${inSync(l2, f)}
${riseIn("#links", r3(tDel + 0.5), 16, 0.5)}
${fadeIn("#credit", r3(tDel + 0.8), 0.5)}
      tl.to($("#all"), { opacity: 0, duration: 0.6, ease: "power2.in" }, ${r3(dur - 0.65)});`,
    sfx: [["pop", 0.1, 0.22]],
  });
}

// ── write frames ─────────────────────────────────────────────────────────────
for (const fr of frames) {
  writeFileSync(join(OUT, `${fr.id}.html`), frame(fr));
  console.log(`✓ compositions/frames/${fr.id}.html  (${fr.dur}s)${NO_VIDEO ? "  [no video]" : ""}`);
}

// ── audio: padded voice files + audio_meta.json ──────────────────────────────
if (AUDIO) {
  for (const f of Object.keys(V)) {
    const v = V[f];
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", join(ROOT, "assets", "voice", `${v.id}.mp3`), "-af", `apad=whole_dur=${v.dur}`, "-ar", "48000", "-ac", "2", join(ROOT, "assets", "voice", `${v.id}.wav`)]);
  }
  console.log("✓ voice files padded");
}
const sfx = frames.flatMap((fr) => (fr.sfx ?? []).map(([name, at, vol, len]) => ({
  frame: fr.n, file: `assets/sfx/${name}.mp3`, offset_s: r3(Math.max(0, at)), duration_s: r3(len ?? SFX_LEN[name]), volume: vol,
})));
const audioMeta = {
  bgm: { path: "assets/bgm/track.mp3", volume: 0.11, query: "warm minimal electronic underscore, steady mid-tempo pulse, soft keys, calm and hopeful", duration_s: 117 },
  bgm_pending: false,
  voices: Object.keys(V).map((f) => ({ frame: Number(f), path: `assets/voice/${V[f].id}.wav`, duration_s: V[f].dur, words: V[f].words })),
  sfx,
};
writeFileSync(join(ROOT, "audio_meta.json"), JSON.stringify(audioMeta, null, 2));
console.log(`✓ audio_meta.json  ${audioMeta.voices.length} voices, ${sfx.length} sfx, total ${r3(Object.values(V).reduce((s, v) => s + v.dur, 0))}s`);
