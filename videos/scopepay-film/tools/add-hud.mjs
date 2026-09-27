#!/usr/bin/env node
// Adds the HUD overlay to index.html at the host root: corner marks, a running
// timecode and a chapter label that changes with each frame. It lives outside
// the frames so frame transitions (push, zoom) don't carry it away.
// Run after assemble-index and transitions inject:  node tools/add-hud.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const path = join(ROOT, "index.html");
let html = readFileSync(path, "utf8");

// Drop a previous HUD so the script can be re-run.
html = html.replace(/\s*<!-- HUD:start -->[\s\S]*?<!-- HUD:end -->/g, "");

const scenes = [...html.matchAll(/class="scene"\s+data-composition-id="([^"]+)"[\s\S]*?data-start="([\d.]+)"/g)].map((m) => ({
  id: m[1],
  start: Math.round(Number(m[2]) * 1000) / 1000,
}));
const total = Number(html.match(/id="root"[\s\S]*?data-duration="([\d.]+)"/)[1]);
if (scenes.length !== 10) throw new Error(`expected 10 scenes, found ${scenes.length}`);

const CHAPTERS = ["The problem", "ScopePay", "Fund", "Deliver", "Get paid", "Nobody can stall", "Disputes", "Work record", "Proof", ""];
const fonts = readFileSync(join(ROOT, "frame.md"), "utf8")
  .split(/\r?\n/)
  .filter((l) => l.startsWith("@font-face") && l.includes("IBM Plex Mono"))
  .join("\n");

const corner = (pos) => `<i class="hud-c" style="${pos}"></i>`;
const markup = `
      <!-- HUD:start -->
      <style>
${fonts}
        #hud { position: absolute; inset: 0; z-index: 40; pointer-events: none; font-family: "IBM Plex Mono", monospace;
          font-weight: 500; font-size: 15px; letter-spacing: 0.16em; text-transform: uppercase; color: #8E8D84; }
        #hud .hud-c { position: absolute; width: 22px; height: 22px; border-color: #3A3B35; border-style: solid; border-width: 0; }
        #hud .hud-t { position: absolute; line-height: 18px; white-space: nowrap; }
        #hud #hud-ch { position: absolute; left: 58px; bottom: 23px; height: 18px; width: 420px; overflow: hidden; }
        #hud .hud-l { position: absolute; left: 0; top: 0; line-height: 18px; white-space: nowrap; }
        #hud .hud-l b { color: #A3A298; font-weight: 500; }
      </style>
      <div id="hud">
        ${corner("left:24px;top:24px;border-left-width:2px;border-top-width:2px")}
        ${corner("right:24px;top:24px;border-right-width:2px;border-top-width:2px")}
        ${corner("left:24px;bottom:24px;border-left-width:2px;border-bottom-width:2px")}
        ${corner("right:24px;bottom:24px;border-right-width:2px;border-bottom-width:2px")}
        <div class="hud-t" style="left:58px;top:23px">ScopePay · product demo</div>
        <div class="hud-t" id="hud-tc" style="right:58px;top:23px">TC 00:00:00:00</div>
        <div id="hud-ch">${CHAPTERS.map((c, i) => (c ? `<div class="hud-l" id="hud-l${i}"><b>${String(i + 1).padStart(2, "0")}</b> / ${c}</div>` : "")).join("")}</div>
        <div class="hud-t" style="right:58px;bottom:23px">Live on Arbitrum Sepolia</div>
      </div>
      <!-- HUD:end -->`;

html = html.replace(/(<div\s+id="root"[^>]*>)/, `$1${markup}`);

const js = `
    <!-- HUD:start -->
    <script>
      (function () {
        var tl = window.__timelines["main"];
        var tc = document.getElementById("hud-tc"), o = { v: 0 };
        var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
        tl.fromTo(o, { v: 0 }, { v: ${total}, duration: ${total}, ease: "none", onUpdate: function () {
          var fr = Math.floor(o.v * 30 + 1e-6), s = Math.floor(fr / 30);
          tc.textContent = "TC 00:" + p2(Math.floor(s / 60)) + ":" + p2(s % 60) + ":" + p2(fr % 30);
        } }, 0);
        tl.fromTo("#hud", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out" }, 0.3);
        var starts = ${JSON.stringify(scenes.map((s) => s.start))};
        for (var i = 0; i < 9; i++) {
          var el = "#hud-l" + i;
          tl.fromTo(el, { yPercent: 110 }, { yPercent: 0, duration: 0.45, ease: "power3.out" }, i === 0 ? 0.5 : starts[i] + 0.05);
          if (i < 8) tl.to(el, { yPercent: -110, duration: 0.3, ease: "power3.in" }, starts[i + 1] - 0.25);
        }
        tl.to("#hud", { opacity: 0, duration: 0.5, ease: "power2.in" }, starts[9]);
      })();
    </script>
    <!-- HUD:end -->`;
html = html.replace(/(\s*<\/body>)/, `${js}$1`);

writeFileSync(path, html);
console.log(`✓ HUD added to index.html (${scenes.length} chapters, ${total}s)`);
